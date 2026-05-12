import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Between, MoreThanOrEqual, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Backup, BackupTrigger } from './entities/backup.entity';
import { Setting } from '../../common/entities/setting.entity';

const DEFAULT_HOUR = 20;
const SCHEDULE_KEY = 'backup.scheduledHour';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;

  constructor(
    @InjectRepository(Backup) private readonly repo: Repository<Backup>,
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    // Override with BACKUP_DIR env var (Electron does this with userData).
    this.backupDir =
      process.env.BACKUP_DIR ?? path.join(process.cwd(), 'backups');
  }

  // ─── Snapshot ────────────────────────────────────────────────────────

  /**
   * Walk every registered entity and dump its rows. Includes M2M join
   * tables (item_categories) so a restore can rebuild the graph. Skips
   * the `backups` table itself to avoid recursive snapshots.
   */
  async dumpAll(): Promise<{
    version: number;
    generatedAt: string;
    data: Record<string, any[]>;
  }> {
    const data: Record<string, any[]> = {};
    const seenTables = new Set<string>();

    for (const meta of this.dataSource.entityMetadatas) {
      if (meta.tableName === 'backups') continue;
      if (seenTables.has(meta.tableName)) continue;
      seenTables.add(meta.tableName);

      const repo = this.dataSource.getRepository(meta.target as any);
      const rows = await repo.find();
      data[meta.tableName] = rows;
    }

    // M2M join tables (e.g. item_categories) aren't separate entities —
    // pull them via raw query so a restore has the relationship rows too.
    for (const meta of this.dataSource.entityMetadatas) {
      for (const rel of meta.manyToManyRelations) {
        const join = rel.junctionEntityMetadata;
        if (!join || seenTables.has(join.tableName)) continue;
        seenTables.add(join.tableName);
        try {
          const rows = await this.dataSource.query(
            `SELECT * FROM "${join.tableName}"`,
          );
          data[join.tableName] = rows;
        } catch {
          // table might not exist on this DB yet — ignore
        }
      }
    }

    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      data,
    };
  }

  // ─── Backup files ───────────────────────────────────────────────────

  async createBackup(
    trigger: BackupTrigger,
    notes?: string,
  ): Promise<Backup> {
    const snapshot = await this.dumpAll();
    const json = JSON.stringify(snapshot, null, 2);
    await fs.promises.mkdir(this.backupDir, { recursive: true });
    const fileName = `hassan-backup-${this.timestamp()}.json`;
    const filePath = path.join(this.backupDir, fileName);
    await fs.promises.writeFile(filePath, json, 'utf8');
    const sizeBytes = Buffer.byteLength(json, 'utf8');
    const row = this.repo.create({
      fileName,
      filePath,
      sizeBytes,
      format: 'JSON',
      trigger,
      notes,
    });
    const saved = await this.repo.save(row);
    this.logger.log(
      `Created ${trigger} backup ${fileName} (${(sizeBytes / 1024).toFixed(1)} KB) at ${filePath}`,
    );
    return saved;
  }

  /**
   * In-memory dump used for the "download now" endpoint — produces the
   * JSON without persisting a file or recording metadata.
   */
  async streamSnapshot(): Promise<{ filename: string; json: string }> {
    const snapshot = await this.dumpAll();
    return {
      filename: `hassan-backup-${this.timestamp()}.json`,
      json: JSON.stringify(snapshot, null, 2),
    };
  }

  list() {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  async findOne(id: string) {
    const b = await this.repo.findOne({ where: { id } });
    if (!b) throw new NotFoundException(`Backup ${id} not found`);
    return b;
  }

  async readFile(id: string): Promise<{ row: Backup; stream: fs.ReadStream }> {
    const row = await this.findOne(id);
    if (!fs.existsSync(row.filePath)) {
      throw new NotFoundException(
        `Backup file ${row.fileName} is missing from disk at ${row.filePath}`,
      );
    }
    return { row, stream: fs.createReadStream(row.filePath) };
  }

  async remove(id: string) {
    const row = await this.findOne(id);
    if (fs.existsSync(row.filePath)) {
      try {
        await fs.promises.unlink(row.filePath);
      } catch (e: any) {
        this.logger.warn(
          `Could not delete backup file ${row.filePath}: ${e.message}`,
        );
      }
    }
    await this.repo.remove(row);
    return { deleted: true, id };
  }

  // ─── Schedule + status ─────────────────────────────────────────────

  async getScheduledHour(): Promise<number> {
    const row = await this.settings.findOne({ where: { key: SCHEDULE_KEY } });
    if (!row) return DEFAULT_HOUR;
    const n = parseInt(row.value, 10);
    return Number.isFinite(n) && n >= 0 && n <= 23 ? n : DEFAULT_HOUR;
  }

  async setScheduledHour(hour: number): Promise<{ hour: number }> {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new BadRequestException('hour must be an integer 0–23');
    }
    const existing = await this.settings.findOne({ where: { key: SCHEDULE_KEY } });
    if (existing) {
      existing.value = String(hour);
      await this.settings.save(existing);
    } else {
      await this.settings.save(
        this.settings.create({ key: SCHEDULE_KEY, value: String(hour) }),
      );
    }
    return { hour };
  }

  /**
   * Status reported to the frontend so it can show an overdue banner
   * when the user hasn't taken today's backup by the scheduled time.
   */
  async status() {
    const hour = await this.getScheduledHour();
    const latest = await this.repo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const scheduledToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      0,
      0,
    );

    const hasTodayBackup = latest
      ? new Date(latest.createdAt) >= todayStart
      : false;
    const overdue = !hasTodayBackup && now >= scheduledToday;

    return {
      scheduledHour: hour,
      backupDir: this.backupDir,
      latest,
      hasTodayBackup,
      overdue,
      now: now.toISOString(),
    };
  }

  /** Called by the scheduler — runs daily only if a fresh one isn't already taken. */
  async runScheduledIfDue(): Promise<Backup | null> {
    const hour = await this.getScheduledHour();
    const now = new Date();
    if (now.getHours() !== hour) return null;

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todays = await this.repo.findOne({
      where: { createdAt: MoreThanOrEqual(todayStart) },
      order: { createdAt: 'DESC' },
    });
    if (todays) return null;

    return this.createBackup('AUTO', `Scheduled daily backup at ${hour}:00`);
  }

  // ─── Restore ────────────────────────────────────────────────────

  /**
   * Wipe every table covered by `dumpAll()` and replay the snapshot.
   * Destructive — the caller must pass `confirm === 'RESTORE'` so an
   * accidental call can never go through.
   *
   * Returns a per-table row count so the caller can show what landed.
   */
  async restoreFromSnapshot(
    snapshot: { version?: number; data: Record<string, any[]> },
    confirm: string,
  ) {
    if (confirm !== 'RESTORE') {
      throw new BadRequestException(
        'Restore requires confirm="RESTORE" to prevent accidental wipes.',
      );
    }
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.data) {
      throw new BadRequestException(
        'Invalid snapshot — expected { version, data }.',
      );
    }

    const dataset = snapshot.data;
    const driverType = this.dataSource.options.type;

    // Collect every entity table + every M2M join table (in dependency
    // order for delete: reverse for inserts).
    const entityTables: string[] = [];
    const joinTables: string[] = [];
    for (const meta of this.dataSource.entityMetadatas) {
      if (meta.tableName === 'backups') continue;
      entityTables.push(meta.tableName);
      for (const rel of meta.manyToManyRelations) {
        const j = rel.junctionEntityMetadata;
        if (j && !joinTables.includes(j.tableName)) {
          joinTables.push(j.tableName);
        }
      }
    }

    const counts: Record<string, number> = {};

    return this.dataSource.transaction(async (manager) => {
      // Toggle FK enforcement so we can clear+reinsert without ordering
      // every table by dependency.
      const fkOff = async () => {
        if (driverType === 'better-sqlite3' || driverType === 'sqlite') {
          await manager.query('PRAGMA foreign_keys = OFF');
        } else if (driverType === 'postgres') {
          await manager.query(`SET session_replication_role = 'replica'`);
        }
      };
      const fkOn = async () => {
        if (driverType === 'better-sqlite3' || driverType === 'sqlite') {
          await manager.query('PRAGMA foreign_keys = ON');
        } else if (driverType === 'postgres') {
          await manager.query(`SET session_replication_role = 'origin'`);
        }
      };
      await fkOff();

      try {
        // 1) Wipe — entity tables in reverse order, then M2M join tables.
        for (const t of [...entityTables].reverse()) {
          await manager.query(`DELETE FROM "${t}"`);
        }
        for (const t of joinTables) {
          await manager.query(`DELETE FROM "${t}"`);
        }

        // 2) Replay — entities first (forward order is fine with FK off),
        //    then M2M rows.
        for (const meta of this.dataSource.entityMetadatas) {
          if (meta.tableName === 'backups') continue;
          const rows = dataset[meta.tableName];
          if (!Array.isArray(rows) || rows.length === 0) {
            counts[meta.tableName] = 0;
            continue;
          }
          // Strip relation-loaded sub-objects so we only insert real columns.
          const cleaned = rows.map((r) => stripRelations(r, meta));
          await manager
            .createQueryBuilder()
            .insert()
            .into(meta.target)
            .values(cleaned)
            .updateEntity(false)
            .execute();
          counts[meta.tableName] = cleaned.length;
        }

        // 3) M2M join tables — these are NOT TypeORM entities, so we
        //    insert via raw values with explicit column names.
        for (const meta of this.dataSource.entityMetadatas) {
          for (const rel of meta.manyToManyRelations) {
            const j = rel.junctionEntityMetadata;
            if (!j) continue;
            const rows = dataset[j.tableName];
            if (!Array.isArray(rows) || rows.length === 0) {
              counts[j.tableName] = 0;
              continue;
            }
            const cols = Object.keys(rows[0]);
            await manager
              .createQueryBuilder()
              .insert()
              .into(j.tableName, cols)
              .values(rows)
              .updateEntity(false)
              .execute();
            counts[j.tableName] = rows.length;
          }
        }
      } finally {
        await fkOn();
      }

      const totalRows = Object.values(counts).reduce((s, n) => s + n, 0);
      this.logger.warn(
        `Restore completed — ${totalRows} rows across ${Object.keys(counts).length} tables`,
      );

      return {
        restored: true,
        totalRows,
        tableCounts: counts,
        completedAt: new Date().toISOString(),
      };
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /** YYYY-MM-DD_HHMMSS in local time for human-readable filenames. */
  timestamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    );
  }
}

/**
 * `dumpAll()` saves rows in TypeORM's hydrated shape — that means eager
 * relations come back as nested objects (e.g. `item.brand: { … }`). When we
 * replay the rows we only want the literal column values, not the nested
 * objects, otherwise TypeORM tries to re-save the joined entity and trips.
 * Strip anything that isn't a known column for the target entity.
 */
function stripRelations(row: any, meta: { columns: Array<{ propertyName: string }> }): any {
  const allowed = new Set(meta.columns.map((c) => c.propertyName));
  const out: Record<string, any> = {};
  for (const k of Object.keys(row)) {
    if (allowed.has(k)) out[k] = row[k];
  }
  return out;
}
