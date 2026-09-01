import { Controller, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UnsubscribeService } from './unsubscribe.service';

/**
 * Unsubscribing from reminder email, without a login.
 *
 * Its own controller precisely so it sits outside the `JwtAuthGuard` that
 * covers the rest of notifications. Requiring a session to stop unwanted mail
 * is how a message gets marked as spam instead of unsubscribed — and the
 * signed token in the link is the authorization, good for nothing else.
 */
@ApiTags('notifications')
@Controller('notifications')
export class UnsubscribeController {
  constructor(private readonly unsub: UnsubscribeService) {}

  @Post('unsubscribe')
  @HttpCode(200)
  unsubscribe(@Query('token') token?: string) {
    return this.unsub.unsubscribe(token ?? '');
  }
}
