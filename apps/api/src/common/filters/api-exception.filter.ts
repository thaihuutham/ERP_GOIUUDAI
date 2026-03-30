import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { REQUEST_ID_CONTEXT_KEY } from '../request/request.constants';
import { TENANT_CONTEXT_KEY } from '../tenant/tenant.constants';

@Injectable()
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(@Inject(ClsService) private readonly cls: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<any>();
    const request = ctx.getRequest<any>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse = exception instanceof HttpException ? exception.getResponse() : null;

    let message = 'Internal server error';
    let details: unknown = undefined;

    if (typeof rawResponse === 'string') {
      message = rawResponse;
    } else if (rawResponse && typeof rawResponse === 'object') {
      const payload = rawResponse as Record<string, unknown>;
      if (typeof payload.message === 'string') {
        message = payload.message;
      } else if (Array.isArray(payload.message)) {
        message = payload.message.map((item) => String(item)).join('; ');
      }
      details = payload;
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    const requestId = this.cls.get<string>(REQUEST_ID_CONTEXT_KEY) ?? null;
    const tenantId = this.cls.get<string>(TENANT_CONTEXT_KEY) ?? null;
    if (requestId) {
      response.setHeader('x-request-id', requestId);
    }

    response.status(status).json({
      success: false,
      error: {
        code: status,
        message,
        details
      },
      meta: {
        requestId,
        tenantId,
        path: request.originalUrl,
        method: request.method,
        timestamp: new Date().toISOString()
      }
    });
  }
}
