import { Body, Controller, Get, Header, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { SyncDirection } from '@hcal/sync';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/dto';
import { SyncService } from './sync.service';

class ImportIcsDto {
  ics!: string;
}

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calendars/:calendarId')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Trigger a two-way (or push/pull) sync with the linked provider. */
  @Post('sync')
  run(
    @CurrentUser() user: AuthUser,
    @Param('calendarId') calendarId: string,
    @Query('direction') direction?: SyncDirection,
  ) {
    return this.sync.run(user.userId, calendarId, direction ?? 'two-way');
  }

  @Get('export.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async exportIcs(@CurrentUser() user: AuthUser, @Param('calendarId') calendarId: string) {
    return this.sync.exportIcs(user.userId, calendarId);
  }

  @Post('import.ics')
  importIcs(@CurrentUser() user: AuthUser, @Param('calendarId') calendarId: string, @Body() dto: ImportIcsDto) {
    return this.sync.importIcs(user.userId, calendarId, dto.ics);
  }
}
