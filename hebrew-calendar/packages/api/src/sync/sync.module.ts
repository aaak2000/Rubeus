import { Module } from '@nestjs/common';
import { CalendarsModule } from '../calendars/calendars.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [CalendarsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
