import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ErrorLogFilter } from './modules/error-logs/error-log.filter';

// Private-network IPv4 ranges — used to allow LAN origins (e.g. a phone on
// 192.168.x.x:3000) without opening CORS to the whole internet. CIDRs:
// 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.
const LAN_ORIGIN_RE =
  /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

const EXACT_ORIGIN_ALLOWLIST = new Set([
  'app://localhost', // Electron renderer (custom protocol)
  'http://localhost:3000', // CRA dev server
  'http://localhost:3001', // backend hitting itself (rare)
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
]);

function isAllowedOrigin(origin: string | undefined): boolean {
  // Same-origin requests / curl / server-to-server have no Origin header.
  // Allowing those is fine because the AuthGuard still applies.
  if (!origin) return true;
  if (EXACT_ORIGIN_ALLOWLIST.has(origin)) return true;
  return LAN_ORIGIN_RE.test(origin);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Body limit is scoped, not global. /api/backup/restore alone can ship
  // the entire DB as JSON in one POST (multi-megabyte), so it gets a 100 MB
  // ceiling. Every other endpoint (login, request-access, sync/push, the
  // CRUD routes) holds at 256 kB so an unauthenticated POST cannot be turned
  // into a memory-pressure DoS by sending a huge body the server has to
  // buffer and parse before AuthGuard rejects it.
  //
  // body-parser is no-op when req._body is already set, so the prefix-scoped
  // middleware below "wins" for the restore route and the global one is
  // skipped for that path.
  app.use('/api/backup/restore', json({ limit: '100mb' }));
  app.use(json({ limit: '256kb' }));
  app.use(urlencoded({ limit: '256kb', extended: true }));

  // Helmet ships a sensible bundle of HTTP security headers
  // (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, …). CSP is
  // enabled with an explicit, restrictive policy now that the inline theme-
  // bootstrap <script> in index.html has been extracted to a separate file.
  // The matching document-level CSP lives in
  // erp-frontend/public/index.html as a <meta http-equiv> tag — the policy
  // here applies to API responses only (defense in depth) and the one in the
  // HTML governs script execution in the renderer.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          scriptSrc: ["'self'"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
        },
      },
    }),
  );

  app.enableCors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global exception filter writes every error response to error_logs so
  // we can review them from the System → Errors tab. Defaults preserved
  // for the response shape so existing clients keep working.
  app.useGlobalFilters(app.get(ErrorLogFilter));

  app.setGlobalPrefix('api');

  // Apply any pending TypeORM migrations BEFORE we open the port — the
  // Electron main process sets DB_MIGRATE_ON_BOOT=true so installed
  // deployments self-update their schema on launch. Dev (`npm run start:dev`)
  // leaves it unset, falling back to TypeORM's `synchronize` behaviour.
  if (process.env.DB_MIGRATE_ON_BOOT === 'true') {
    const logger = new Logger('Migrations');
    const ds = app.get(DataSource);
    const pending = await ds.showMigrations();
    if (pending) {
      logger.log('Applying pending TypeORM migrations…');
      const applied = await ds.runMigrations();
      logger.log(
        `Applied ${applied.length} migration${applied.length === 1 ? '' : 's'}: ` +
          applied.map((m) => m.name).join(', '),
      );
    } else {
      logger.log('Schema is up to date — no migrations to apply.');
    }
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`ERP backend listening on http://localhost:${port}/api`);
}
bootstrap();
