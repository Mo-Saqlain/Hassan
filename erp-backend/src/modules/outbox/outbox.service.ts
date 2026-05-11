import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  enqueue(type: string, payload: Record<string, unknown>) {
    return this.repo.save(
      this.repo.create({
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

  pending(limit = 50) {
    return this.repo.find({
      where: { status: 'PENDING' as SyncQueueStatus },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  save(entry: SyncQueueEntry) {
    return this.repo.save(entry);
  }
}
