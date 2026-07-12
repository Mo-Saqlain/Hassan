/**
 * Shared helpers for the master-data CSV import endpoints (`POST /<entity>/import`).
 *
 * The frontend parses the user's CSV into an array of plain `{ column: value }`
 * rows (all values are strings) and posts them as `{ rows: [...] }`. Each entity
 * service maps a row onto its Create DTO using the coercion helpers below, runs
 * class-validator against the real DTO so the same rules as the live form apply,
 * then calls its normal `create()`. Failures are isolated per row — one bad line
 * never aborts the whole import — and reported back with a 1-based CSV line
 * number so the owner can fix the spreadsheet and re-upload.
 */
import { IsArray } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/** Body shape for every `POST /<entity>/import` route. */
export class ImportRowsDto {
  @IsArray()
  rows: Record<string, unknown>[];
}

export interface ImportFailure {
  /** 1-based CSV line number (row 1 is the header, so data starts at 2). */
  row: number;
  /** Best-effort label for the offending row (name / modelNo / code). */
  label?: string;
  error: string;
}

export interface ImportResult {
  total: number;
  created: number;
  failed: ImportFailure[];
}

/** Trim a cell to a non-empty string, or `undefined` when blank/missing. */
export function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/**
 * Coerce a cell to a number. Blank → `undefined` (so the DTO default applies).
 * Unparseable → `NaN`, which trips `@IsNumber` and surfaces as a row error
 * rather than silently importing a 0.
 */
export function num(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).replace(/,/g, '').trim();
  if (s === '') return undefined;
  return Number(s);
}

/** Truthy/falsy text → boolean. Blank/unknown → `undefined`. */
export function bool(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (s === '') return undefined;
  if (['true', 'yes', 'y', '1', 'active', 'on'].includes(s)) return true;
  if (['false', 'no', 'n', '0', 'inactive', 'off'].includes(s)) return false;
  return undefined;
}

/**
 * Validate a mapped DTO against its class-validator decorators. Throws an Error
 * with a human-readable, joined message on the first failing row so it lands in
 * `ImportResult.failed`.
 */
export async function validateDto(
  DtoClass: new () => object,
  plain: object,
): Promise<void> {
  const instance = plainToInstance(DtoClass, plain);
  const errors = await validate(instance, {
    whitelist: false,
    forbidNonWhitelisted: false,
    skipMissingProperties: false,
  });
  if (errors.length) {
    const msg = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .filter(Boolean)
      .join('; ');
    throw new Error(msg || 'Validation failed');
  }
}

/**
 * Run `perRow` over each raw CSV row, isolating per-row failures and tallying a
 * summary. `perRow` should map + validate + create; throwing inside it records
 * the row as failed and continues.
 */
export async function runImport(
  rows: Record<string, unknown>[] | undefined,
  perRow: (raw: Record<string, unknown>) => Promise<void>,
): Promise<ImportResult> {
  const list = Array.isArray(rows) ? rows : [];
  const result: ImportResult = { total: list.length, created: 0, failed: [] };
  for (let i = 0; i < list.length; i++) {
    const raw = list[i] ?? {};
    try {
      await perRow(raw);
      result.created++;
    } catch (e) {
      result.failed.push({
        row: i + 2,
        label: str(raw.name) ?? str(raw.modelNo) ?? str(raw.code),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
}
