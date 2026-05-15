import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Sequence } from './entities/sequence.entity';

@Injectable()
export class SequenceService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /**
   * Atomically allocates and returns the next formatted voucher number for
   * a given prefix (e.g. `INV-000124`).
   *
   * Concurrency:
   *   - Postgres: TypeORM's `pessimistic_write` lock translates to
   *     `SELECT … FOR UPDATE`, blocking concurrent allocators on the same
   *     prefix until the row is committed.
   *   - SQLite: better-sqlite3 serialises writes per process. The lock mode
   *     is a no-op there but the single-writer guarantee prevents races.
   *
   * Seeding: the first call for a prefix that has no row yet uses
   * `seedFromMax()` to compute the starting `nextValue` from the existing
   * MAX numeric part of vouchers already in the source table. If no callback
   * is given, the sequence starts at 1.
   */
  async next(
    prefix: string,
    seedFromMax?: () => Promise<number>,
  ): Promise<string> {
    // better-sqlite3 has no row locks (it's single-writer at the connection
    // level, so the enclosing transaction already serialises every increment
    // for this prefix). Postgres needs SELECT … FOR UPDATE to block other
    // connections trying to allocate the same prefix.
    const usePessimisticLock = this.ds.options.type === 'postgres';
    return this.ds.transaction(async (tx) => {
      const repo = tx.getRepository(Sequence);
      let row = await repo.findOne({
        where: { prefix },
        ...(usePessimisticLock
          ? { lock: { mode: 'pessimistic_write' as const } }
          : {}),
      });
      if (!row) {
        const existing = seedFromMax ? await seedFromMax() : 0;
        row = repo.create({ prefix, nextValue: existing + 1 });
      }
      const value = row.nextValue;
      row.nextValue = value + 1;
      await repo.save(row);
      return `${prefix}-${String(value).padStart(6, '0')}`;
    });
  }
}
