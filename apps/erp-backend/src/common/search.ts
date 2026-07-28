import { Brackets, SelectQueryBuilder } from 'typeorm';

/** Query shape every searchable list endpoint accepts. */
export interface ListQuery {
  search?: string;
  limit?: string | number;
  offset?: string | number;
}

export interface Page<T> {
  rows: T[];
  total: number;
  limit: number;
  offset: number;
  /** Echoed back so a client can tell which term produced the page. */
  search?: string;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function parseLimit(value: unknown, fallback = DEFAULT_LIMIT): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

export function parseOffset(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Case-insensitive contains-match across several columns, ORed together.
 *
 * `LOWER(col) LIKE :term` rather than ILIKE: ILIKE is Postgres-only and this
 * codebase runs the same queries on SQLite (desktop) and Postgres (cloud).
 * Wrapped in Brackets so the ORs cannot leak out and swallow the caller's other
 * conditions — an `AND (a OR b)` becoming `AND a OR b` would quietly widen a
 * filtered list to the whole table.
 *
 * `fields` are qualified column expressions, e.g. `s.invoice_no` or
 * `customer.name`.
 */
export function applySearch<T extends object>(
  qb: SelectQueryBuilder<T>,
  search: string | undefined,
  fields: string[],
): SelectQueryBuilder<T> {
  const term = (search ?? '').trim().toLowerCase();
  if (!term || fields.length === 0) return qb;

  const like = `%${term}%`;
  return qb.andWhere(
    new Brackets((w) => {
      fields.forEach((field, i) => {
        const param = `search_${i}`;
        const clause = `LOWER(CAST(${field} AS TEXT)) LIKE :${param}`;
        if (i === 0) w.where(clause, { [param]: like });
        else w.orWhere(clause, { [param]: like });
      });
    }),
  );
}

/**
 * Run a query builder as a page: total first (same filters, no window), then the
 * window itself.
 *
 * Returning the total is what makes a searchable list honest — without it the UI
 * cannot tell "these are all 12 matches" from "here are the first 100 of
 * thousands", and the old unbounded endpoints gave the caller no way to know.
 */
export async function paginate<T extends object>(
  qb: SelectQueryBuilder<T>,
  query: ListQuery,
): Promise<Page<T>> {
  const limit = parseLimit(query.limit);
  const offset = parseOffset(query.offset);
  const total = await qb.getCount();
  const rows = await qb.skip(offset).take(limit).getMany();
  return {
    rows,
    total,
    limit,
    offset,
    search: query.search?.trim() || undefined,
  };
}
