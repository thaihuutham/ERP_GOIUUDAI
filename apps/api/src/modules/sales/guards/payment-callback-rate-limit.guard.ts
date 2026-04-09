import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

type CounterBucket = {
  windowStart: number;
  count: number;
};

type PaymentCallbackRequestLike = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
};

@Injectable()
export class PaymentCallbackRateLimitGuard implements CanActivate {
  private readonly counters = new Map<string, CounterBucket>();
  private readonly windowMs = 60_000;
  private readonly perIpLimit = 120;
  private readonly perIntentLimit = 40;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<PaymentCallbackRequestLike>();
    const now = Date.now();
    this.cleanup(now);

    const ip = this.resolveIp(request);
    this.bumpOrThrow(`ip:${ip}`, this.perIpLimit, now, 'IP callback rate exceeded');

    const intentCode = this.resolveIntentCode(request.body);
    if (intentCode) {
      this.bumpOrThrow(`intent:${ip}:${intentCode}`, this.perIntentLimit, now, 'Intent callback rate exceeded');
    }

    return true;
  }

  private bumpOrThrow(key: string, limit: number, now: number, message: string) {
    const current = this.counters.get(key);
    if (!current || now - current.windowStart >= this.windowMs) {
      this.counters.set(key, { windowStart: now, count: 1 });
      return;
    }

    const nextCount = current.count + 1;
    if (nextCount > limit) {
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }
    this.counters.set(key, { ...current, count: nextCount });
  }

  private cleanup(now: number) {
    for (const [key, value] of this.counters.entries()) {
      if (now - value.windowStart >= this.windowMs * 2) {
        this.counters.delete(key);
      }
    }
  }

  private resolveIp(request: PaymentCallbackRequestLike) {
    const fromForward = this.readHeader(request.headers, 'x-forwarded-for')
      .split(',')
      .map((item) => item.trim())
      .find(Boolean);
    const fromRealIp = this.readHeader(request.headers, 'x-real-ip');
    return fromForward || fromRealIp || String(request.ip || 'unknown').trim() || 'unknown';
  }

  private resolveIntentCode(body?: Record<string, unknown>) {
    const intentCode = String(body?.intentCode ?? '').trim().toUpperCase();
    return intentCode || '';
  }

  private readHeader(headers: PaymentCallbackRequestLike['headers'], key: string) {
    if (!headers) {
      return '';
    }
    const value = headers[key];
    if (Array.isArray(value)) {
      return String(value[0] ?? '').trim();
    }
    return String(value ?? '').trim();
  }
}
