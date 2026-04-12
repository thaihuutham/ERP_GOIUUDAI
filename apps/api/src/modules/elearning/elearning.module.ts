import { Module } from '@nestjs/common';
import { ElearningController } from './elearning.controller';
import { ElearningService } from './elearning.service';
import { DailyQuizService } from './daily-quiz.service';

@Module({
  controllers: [ElearningController],
  providers: [ElearningService, DailyQuizService],
  exports: [ElearningService, DailyQuizService]
})
export class ElearningModule {}
