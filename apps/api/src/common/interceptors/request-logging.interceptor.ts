import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ClsService } from 'nestjs-cls';
import { AUTH_USER_CONTEXT_KEY, REQUEST_ID_CONTEXT_KEY } from '../request/request.constants';
import { TENANT_CONTEXT_KEY } from '../tenant/tenant.constants';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(@Inject(ClsService) private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<{
      method: string;
      originalUrl: string;
      ip?: string;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const response = http.getResponse<{ statusCode: number; setHeader?: (name: string, value: string) => void }>();

    const requestId = this.cls.get<string>(REQUEST_ID_CONTEXT_KEY) ?? '';
    if (requestId && response.setHeader) {
      response.setHeader('x-request-id', requestId);
    }

    return next.handle().pipe(
      tap({
        next: () => {
          this.logLine({
            level: 'info',
            method: request.method,
            path: request.originalUrl,
            statusCode: response.statusCode,
            durationMs: Date.now() - now,
            requestId,
            tenantId: this.cls.get<string>(TENANT_CONTEXT_KEY) ?? null,
            user: this.cls.get(AUTH_USER_CONTEXT_KEY) ?? null,
            ip: request.ip ?? null
          });
        },
        error: (error) => {
          this.logLine({
            level: 'error',
            method: request.method,
            path: request.originalUrl,
            statusCode: response.statusCode,
            durationMs: Date.now() - now,
            requestId,
            tenantId: this.cls.get<string>(TENANT_CONTEXT_KEY) ?? null,
            user: this.cls.get(AUTH_USER_CONTEXT_KEY) ?? null,
            ip: request.ip ?? null,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );
  }

  private logLine(payload: Record<string, unknown>) {
    const log = {
      timestamp: new Date().toISOString(),
      ...payload
    };

    if (payload.level === 'error') {
      console.error(JSON.stringify(log));
      return;
    }
    console.info(JSON.stringify(log));
  }
}
