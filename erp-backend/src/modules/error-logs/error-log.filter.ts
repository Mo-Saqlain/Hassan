import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorLogsService } from './error-logs.service';

/**
 * Global exception filter: preserves Nest's default response shape (so
 * existing 4xx validation errors and 404s look the same to the frontend)
 * but writes a row to `error_logs` for every error, with the request
 * method/path and a JSON snapshot of the body/query.
 *
 * Installed in main.ts via app.useGlobalFilters(...).
 */
@Catch()
export class ErrorLogFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorLogFilter');

  constructor(private readonly errorLogs: ErrorLogsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? (exception as HttpException).getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp
      ? (exception as HttpException).getResponse()
      : { statusCode: status, message: 'Internal server error' };
    const message =
      (exception as Error)?.message ??
      (typeof body === 'string' ? body : (body as any)?.message) ??
      'Unknown error';
    const stack = (exception as Error)?.stack;

    // Skip noise: validation 400s and 404s still get logged for visibility,
    // but we tag them as WARN instead of ERROR so the user can filter.
    const level = status >= 500 ? 'ERROR' : 'WARN';

    this.errorLogs.record({
      level,
      source: 'http',
      method: req?.method,
      path: req?.originalUrl ?? req?.url,
      statusCode: status,
      message:
        Array.isArray((body as any)?.message)
          ? (body as any).message.join(', ')
          : String(message),
      stack,
      context: {
        body: req?.body,
        query: req?.query,
        params: req?.params,
      },
    });

    if (status >= 500) {
      this.logger.error(`${req?.method} ${req?.originalUrl} → ${status}: ${message}`);
      if (stack) this.logger.error(stack);
    }

    res.status(status).json(body);
  }
}
