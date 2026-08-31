import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/dto';
import { YahrzeitsService } from './yahrzeits.service';
import { CreateYahrzeitDto, UpdateYahrzeitDto } from './dto';

@ApiTags('yahrzeits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('yahrzeits')
export class YahrzeitsController {
  constructor(private readonly yahrzeits: YahrzeitsService) {}

  /** The user's register, soonest occurrence first. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.yahrzeits.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateYahrzeitDto) {
    return this.yahrzeits.create(user.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateYahrzeitDto) {
    return this.yahrzeits.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.yahrzeits.remove(user.userId, id);
  }
}
