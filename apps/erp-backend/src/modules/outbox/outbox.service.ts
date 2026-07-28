import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  SyncQueueEntry,
  SyncQueueStatus,
} from './entities/sync-queue.entity';

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(SyncQueueEntry)
    private readonly repo: Repository<SyncQueueEntry>,
  ) {}

  /**
   * Queue an event for the next manual push.
   *
   * Pass `manager` to enlist in the caller's transaction — without it the event
   * is written on its own connection, so a transaction that later rolls back
   * leaves a queued event describing something that never happened. Callers
   * that enqueue *after* their transaction commits (the plain create paths) can
   * omit it.
   */
  enqueue(
    type: string,
    payload: Record<string, unknown>,
    manager?: EntityManager,
  ) {
    const repo = manager ? manager.getRepository(SyncQueueEntry) : this.repo;
    return repo.save(
      repo.create({
        id: randomUUID(),
        type,
        payload: JSON.stringify(payload),
        status: 'PENDING' as SyncQueueStatus,
        attempts: 0,
      }),
    );
  }

  list() {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  countPending() {
    return this.repo.count({ where: { status: 'PENDING' as SyncQueueStatus } });
  }

  countFailed() {
    return this.repo.count({ where: { status: 'FAILED' as SyncQueueStatus } });
  }

  /**
   * Returns every PENDING row, no row limit. Poison-pill isolation in the
   * sync service handles per-event failures so a misbehaving row never
   * stalls the queue — there's no benefit to chunking and a real cost to
   * leaving healthy events behind every click.
   */
  pending() {
    return this.repo.find({
      where: { status: 'PENDING' as SyncQueueStatus },
      order: { createdAt: 'ASC' },
    });
  }

  /** FAILED rows — surfaced in the banner so the operator can review/clear. */
  failed() {
    return this.repo.find({
      where: { status: 'FAILED' as SyncQueueStatus },
      order: { lastAttemptAt: 'DESC' },
      take: 200,
    });
  }

  /** Reset a FAILED row to PENDING so the next Sync click retries it. */
  async retry(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) return null;
    row.status = 'PENDING' as SyncQueueStatus;
    row.error = undefined;
    return this.repo.save(row);
  }

  save(entry: SyncQueueEntry) {
    return this.repo.save(entry);
  }
}
