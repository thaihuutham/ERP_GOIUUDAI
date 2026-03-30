import { Module } from '@nestjs/common';
import { ScmController } from './scm.controller';
import { ScmService } from './scm.service';

@Module({
  controllers: [ScmController],
  providers: [ScmService]
})
export class ScmModule {}
