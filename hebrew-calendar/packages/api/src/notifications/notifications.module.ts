import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { YahrzeitsModule } from '../yahrzeits/yahrzeits.module';
import { NotificationsController } from './notifications.controller';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';
import { PushService } from './push.service';
import { MailService } from './mail.service';
import { RemindersService } from './reminders.service';

@Module({
  imports: [PrismaModule, YahrzeitsModule],
  controllers: [NotificationsController, UnsubscribeController],
  providers: [PushService, MailService, RemindersService, UnsubscribeService],
  exports: [PushService, MailService, RemindersService, UnsubscribeService],
})
export class NotificationsModule {}
