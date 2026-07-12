import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ErrorLevel, ErrorLog } from './entities/error-log.entity';

@Injectable()
export class ErrorLogsService {
  constructor(
    @InjectRepository(ErrorLog)
    private readonly repo: Repository<ErrorLog>,
  ) {}

  async record(entry: {
    level?: ErrorLevel;
    source?: string;
    method?: string;
    path?: string;
    statusCode?: number;
    message: string;
    stack?: string;
    context?: unknown;
  }): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          level: entry.level ?? 'ERROR',
          source: entry.source ?? 'unknown',
          method: entry.method,
          path: entry.path,
          statusCode: entry.statusCode,
          message: entry.message,
          stack: entry.stack,
          context: entry.context ? safeStringify(entry.context) : undefined,
        }),
      );
    } catch {
      // never let error-logging itself crash the app
    }
  }

  findAll(opts: {
    level?: ErrorLevel;
    source?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) {
    const where: any = {};
    if (opts.level) where.level = opts.level;
    if (opts.source) where.source = opts.source;
    if (opts.from && opts.to) {
      where.createdAt = Between(new Date(opts.from), new Date(opts.to));
    }
    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(opts.limit ?? 500, 5000),
    });
  }

  async clear() {
    await this.repo.clear();
    return { cleared: true };
  }
}

function safeStringify(obj: unknown): string | undefined {
  try {
    return JSON.stringify(obj);
  } catch {
    return undefined;
  }
}
