import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import * as path from 'path';

loadEnv();

/**
 * DataSource for the TypeORM CLI — used by:
 *
 *   npm run db:migrate              -- apply pending migrations
 *   npm run db:migrate:revert       -- roll the last migration back
 *   npm run db:migrate:generate -- src/migrations/AddX  -- diff entities vs DB
 *
 * AppModule has its own runtime DataSource configuration. Both must stay
 * pointed at the same DB (DATABASE_URL or SQLITE_PATH) and use the same
 * entity glob, otherwise the CLI will generate spurious diffs.
 *
 * Postgres is the production target. SQLite is supported for local dev so
 * `migration:generate` works against a populated dev DB without a Postgres
 * round-trip.
 */
const isPostgres = !!process.env.DATABASE_URL;

const entityGlob = path.join(__dirname, '**/*.entity{.ts,.js}');
const migrationsGlob = path.join(__dirname, 'migrations/*{.ts,.js}');

export const AppDataSource = new DataSource(
  isPostgres
    ? {
        type: 'postgres',
        url: process.env.DATABASE_URL,
        ssl:
          process.env.DB_SSL === 'true'
            ? { rejectUnauthorized: false }
            : false,
        entities: [entityGlob],
        migrations: [migrationsGlob],
        migrationsTableName: 'typeorm_migrations',
        synchronize: false,
        logging: process.env.DB_LOG === 'true',
      }
    : {
        type: 'better-sqlite3',
        database: process.env.SQLITE_PATH ?? 'erp.sqlite',
        entities: [entityGlob],
        migrations: [migrationsGlob],
        migrationsTableName: 'typeorm_migrations',
        synchronize: false,
      },
);
