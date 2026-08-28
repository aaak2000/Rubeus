import { Module } from '@nestjs/common';
import { CalendarsModule } from '../calendars/calendars.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [CalendarsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
