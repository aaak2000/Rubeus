import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/dto';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto } from './dto';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calendars/:calendarId/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** Occurrences intersecting [?start, ?end] (ISO instants). */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('calendarId') calendarId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    if (!start || !end) throw new BadRequestException('?start= and ?end= (ISO) are required');
    return this.events.listRange(user.userId, calendarId, start, end);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Param('calendarId') calendarId: string, @Body() dto: CreateEventDto) {
    return this.events.create(user.userId, calendarId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('calendarId') calendarId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(user.userId, calendarId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('calendarId') calendarId: string, @Param('id') id: string) {
    return this.events.remove(user.userId, calendarId, id);
  }
}
