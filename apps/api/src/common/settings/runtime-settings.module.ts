import { Global, Module } from '@nestjs/common';
import { RuntimeSettingsService } from './runtime-settings.service';

@Global()
@Module({
  providers: [RuntimeSettingsService],
  exports: [RuntimeSettingsService]
})
export class RuntimeSettingsModule {}

