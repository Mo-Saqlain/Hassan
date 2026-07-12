import { ConflictException } from '@nestjs/common';

/**
 * Translate a DB-level foreign-key violation into a friendly 409 Conflict.
 *
 * Master-data rows (items, customers, suppliers, brands, stores, accounts)
 * are referenced by transaction tables (sales, purchases, payments, …).
 * A hard DELETE on a row that's still referenced will raise a FK violation
 * — Postgres uses SQLSTATE 23503, SQLite says "FOREIGN KEY constraint
 * failed". Both surface as 500 Internal Server Error by default, which is
 * an awful UX. Wrap the delete with this helper to redirect users to the
 * "Close / mark inactive" workflow instead.
 *
 * @param run  the actual delete to attempt
 * @param label  human label used in the error message ("item", "supplier", …)
 */
export async function deleteOrConflict<T>(
  run: () => Promise<T>,
  label: string,
): Promise<T> {
  try {
    return await run();
  } catch (err: any) {
    if (isForeignKeyViolation(err)) {
      throw new ConflictException(
        `Cannot delete this ${label} — it is referenced by existing transactions. Mark it as Closed instead to preserve history.`,
      );
    }
    throw err;
  }
}

function isForeignKeyViolation(err: any): boolean {
  if (!err) return false;
  // Postgres
  if (err.code === '23503') return true;
  // TypeORM QueryFailedError driver-specific wrapping
  if (err.driverError?.code === '23503') return true;
  // SQLite / better-sqlite3 / mysql / generic ORM messages
  const msg: string = err.message ?? err.driverError?.message ?? '';
  return /foreign key constraint|FOREIGN KEY|REFERENCE constraint/i.test(msg);
}
