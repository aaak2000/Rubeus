import type { SyncDirection } from '@hcal/sync';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SyncService } from './sync.service';

// See the note in auth.controller: undecorated fields are stripped by the
// global ValidationPipe's whitelist.
class ImportIcsDto {
  @IsString()
  @MinLength(1)
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
    @Query('direction') direction?: string,
  ) {
    const allowed: SyncDirection[] = ['push', 'pull', 'two-way'];
    if (direction && !allowed.includes(direction as SyncDirection)) {
      throw new BadRequestException(`direction must be one of: ${allowed.join(', ')}`);
    }
    return this.sync.run(user.userId, calendarId, (direction as SyncDirection) ?? 'two-way');
  }

  @Get('export.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async exportIcs(@CurrentUser() user: AuthUser, @Param('calendarId') calendarId: string) {
    return this.sync.exportIcs(user.userId, calendarId);
  }

  @Post('import.ics')
  importIcs(
    @CurrentUser() user: AuthUser,
    @Param('calendarId') calendarId: string,
    @Body() dto: ImportIcsDto,
  ) {
    return this.sync.importIcs(user.userId, calendarId, dto.ics);
  }
}
