import { Body, Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MinLength } from 'class-validator';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto';
import { GoogleSignInService } from './google-sign-in.service';

// Every field needs a validation decorator: the global ValidationPipe runs
// with `whitelist: true`, which strips any property that has none.
class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

class ExchangeDto {
  @IsString()
  @MinLength(1)
  code!: string;
}

// Credential endpoints are the prime target for brute force: allow far fewer
// attempts per minute than the global default. Configurable so automated
// suites, which register many accounts in quick succession, can raise it.
const AUTH_ATTEMPTS_PER_MINUTE = Number(process.env.AUTH_RATE_LIMIT ?? 10);

@Throttle({ default: { ttl: 60_000, limit: AUTH_ATTEMPTS_PER_MINUTE } })
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleSignInService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Which sign-in methods this deployment offers.
   *
   * The login page asks before drawing a Google button, so a deployment with
   * no Google credentials shows no button rather than one that fails.
   */
  @Get('methods')
  methods() {
    return { password: true, google: this.google.configured };
  }

  /** Start a Google sign-in. Returns the URL for the browser to visit. */
  @Get('google/url')
  async googleUrl() {
    return { url: await this.google.authUrl() };
  }

  /**
   * Google's redirect back.
   *
   * Hands the browser a single-use code in the query string rather than the
   * token pair itself: a refresh token in a URL ends up in history, referrer
   * headers and proxy logs, and is valid for thirty days.
   */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const web = this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';
    // Someone who declines the consent screen is not an error to shout about;
    // send them back to the login page.
    if (error || !code || !state) {
      return res.redirect(`${web}/login?error=google`);
    }
    try {
      const loginCode = await this.google.handleCallback(code, state);
      return res.redirect(`${web}/auth/callback?code=${encodeURIComponent(loginCode)}`);
    } catch {
      return res.redirect(`${web}/login?error=google`);
    }
  }

  /** Redeem the single-use code from the redirect for a real session. */
  @Post('google/exchange')
  @HttpCode(200)
  exchange(@Body() dto: ExchangeDto) {
    return this.google.exchange(dto.code);
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  /** Revoke a session's refresh token. */
  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
