import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/auth/auth.decorators';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      ok: true,
      service: 'erp-api',
      timestamp: new Date().toISOString()
    };
  }
}
