import { TypeOrmModuleAsyncOptions, TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * In-memory SQLite TypeORM configuration for fast isolated unit tests.
 * Pass the entities you need for the spec.
 */
export function inMemoryTypeOrm(
  entities: any[],
): TypeOrmModuleOptions {
  return {
    type: 'better-sqlite3',
    database: ':memory:',
    entities,
    synchronize: true,
    dropSchema: true,
    logging: false,
  };
}

export const inMemoryTypeOrmAsync = (entities: any[]): TypeOrmModuleAsyncOptions => ({
  useFactory: () => inMemoryTypeOrm(entities),
});
