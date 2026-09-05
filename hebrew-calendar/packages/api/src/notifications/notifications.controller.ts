import { Body, Controller, Delete, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, IsString, MinLength, ValidateNested } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MailService } from './mail.service';
import { PushService } from './push.service';

// Decorated so the global ValidationPipe (whitelist: true) keeps the fields.
class PushKeysDto {
  @IsString() @MinLength(1) p256dh!: string;
  @IsString() @MinLength(1) auth!: string;
}
class PushSubscriptionDto {
  @IsString() @MinLength(1) endpoint!: string;
  @IsObject() @ValidateNested() @Type(() => PushKeysDto) keys!: PushKeysDto;
}
class UnsubscribeDto {
  @IsString() @MinLength(1) endpoint!: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly push: PushService,
    private readonly mail: MailService,
  ) {}

  /**
   * What the client needs to offer notifications: the VAPID key, and which
   * channels this deployment can actually deliver on. A UI that offers a
   * switch for a channel the server cannot send is worse than no switch.
   */
  @Get('config')
  config() {
    return {
      push: { enabled: this.push.enabled, publicKey: this.push.publicKey() },
      email: { enabled: this.mail.enabled },
    };
  }

  @Post('push')
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: PushSubscriptionDto,
    @Headers('user-agent') ua?: string,
  ) {
    return this.push.subscribe(user.userId, dto, ua);
  }

  @Delete('push')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribeDto) {
    return this.push.unsubscribe(user.userId, dto.endpoint);
  }
}
