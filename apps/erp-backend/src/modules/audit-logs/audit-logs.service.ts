import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AuditAction, AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async record(entry: {
    entityType: string;
    entityId?: string;
    action: AuditAction;
    summary: string;
    changes?: unknown;
    source?: string;
  }): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          summary: entry.summary,
          source: entry.source ?? 'unknown',
          changes: entry.changes ? JSON.stringify(entry.changes) : undefined,
        }),
      );
    } catch {
      // Audit must never block the originating operation — swallow errors.
    }
  }

  findAll(opts: {
    entityType?: string;
    action?: AuditAction;
    from?: string;
    to?: string;
    limit?: number;
  }) {
    const where: any = {};
    if (opts.entityType) where.entityType = opts.entityType;
    if (opts.action) where.action = opts.action;
    if (opts.from && opts.to) {
      where.createdAt = Between(new Date(opts.from), new Date(opts.to));
    }
    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(opts.limit ?? 500, 5000),
    });
  }
}
