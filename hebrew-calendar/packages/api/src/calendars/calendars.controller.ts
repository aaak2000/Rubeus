import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CalendarsService } from './calendars.service';

class CreateCalendarDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsHexColor() color?: string;
}
class UpdateCalendarDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsHexColor() color?: string;
}

@ApiTags('calendars')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calendars')
export class CalendarsController {
  constructor(private readonly calendars: CalendarsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.calendars.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCalendarDto) {
    return this.calendars.create(user.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCalendarDto) {
    return this.calendars.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.calendars.remove(user.userId, id);
  }
}
