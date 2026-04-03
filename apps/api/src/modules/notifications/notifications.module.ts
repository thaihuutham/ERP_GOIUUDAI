import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsDispatchSchedulerService } from './notifications-dispatch-scheduler.service';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsDispatchSchedulerService],
  exports: [NotificationsService]
})
export class NotificationsModule {}
