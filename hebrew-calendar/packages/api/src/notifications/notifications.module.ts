import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { YahrzeitsModule } from '../yahrzeits/yahrzeits.module';
import { MailService } from './mail.service';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { RemindersService } from './reminders.service';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';

@Module({
  imports: [PrismaModule, YahrzeitsModule],
  controllers: [NotificationsController, UnsubscribeController],
  providers: [PushService, MailService, RemindersService, UnsubscribeService],
  exports: [PushService, MailService, RemindersService, UnsubscribeService],
})
export class NotificationsModule {}
