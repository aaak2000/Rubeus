import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/dto';
import { OAuthService } from './oauth.service';

@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly config: ConfigService,
  ) {}

  /** Returns the provider consent URL for the signed-in user to visit. */
  @Get('google/url')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async googleUrl(@CurrentUser() user: AuthUser) {
    return { url: await this.oauth.googleAuthUrl(user.userId) };
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    await this.oauth.handleGoogleCallback(code, state);
    res.redirect(`${this.webOrigin()}/settings?connected=google`);
  }

  @Get('microsoft/url')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async microsoftUrl(@CurrentUser() user: AuthUser) {
    return { url: await this.oauth.microsoftAuthUrl(user.userId) };
  }

  @Get('microsoft/callback')
  async microsoftCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    await this.oauth.handleMicrosoftCallback(code, state);
    res.redirect(`${this.webOrigin()}/settings?connected=microsoft`);
  }

  @Post('caldav/connect')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  connectCaldav(
    @CurrentUser() user: AuthUser,
    @Body() dto: { url: string; username: string; password: string },
  ) {
    return this.oauth.connectCaldav(user.userId, dto);
  }

  private webOrigin(): string {
    return this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';
  }
}
