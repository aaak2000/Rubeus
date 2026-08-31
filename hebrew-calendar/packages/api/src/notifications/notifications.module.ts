import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { YahrzeitsModule } from '../yahrzeits/yahrzeits.module';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { MailService } from './mail.service';
import { RemindersService } from './reminders.service';

@Module({
  imports: [PrismaModule, YahrzeitsModule],
  controllers: [NotificationsController],
  providers: [PushService, MailService, RemindersService],
  exports: [PushService, MailService, RemindersService],
})
export class NotificationsModule {}
