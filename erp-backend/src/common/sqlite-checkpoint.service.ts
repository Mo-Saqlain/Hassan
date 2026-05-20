import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Truncates the SQLite write-ahead log before the process exits.
 *
 * Why: SQLite in WAL mode appends every write to a `.sqlite-wal` sidecar
 * file. On the next open, SQLite "replays" the WAL into the main DB
 * before accepting queries — replay time is proportional to WAL size.
 * If the process exits cleanly, SQLite already checkpoints the WAL on
 * close, so this hook is a no-op on a normal shutdown. The value shows
 * up after a crash / force-quit / OS power-off, where the previous
 * boot didn't get a chance to flush. We checkpoint defensively on
 * every shutdown so the next start is always fast.
 *
 * No-op on Postgres (no WAL exposed at the SQL level — managed by the
 * server). We gate on `dataSource.options.type` rather than env so the
 * service self-disables when DATABASE_URL is set.
 */
@Injectable()
export class SqliteCheckpointService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(SqliteCheckpointService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async beforeApplicationShutdown() {
    if (this.ds.options.type !== 'better-sqlite3') return;
    if (!this.ds.isInitialized) return;
    try {
      // TRUNCATE mode: checkpoints the WAL, then zeroes the file (instead
      // of letting it grow). Cheapest next-boot.
      await this.ds.query('PRAGMA wal_checkpoint(TRUNCATE);');
      this.logger.log('SQLite WAL checkpointed and truncated.');
    } catch (e) {
      // Best-effort — never block shutdown on a checkpoint failure.
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`WAL checkpoint failed (ignored): ${msg}`);
    }
  }
}
