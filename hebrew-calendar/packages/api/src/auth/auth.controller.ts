import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto';

// Every field needs a validation decorator: the global ValidationPipe runs
// with `whitelist: true`, which strips any property that has none.
class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

// Credential endpoints are the prime target for brute force: allow far fewer
// attempts per minute than the global default.
@Throttle({ default: { ttl: 60_000, limit: 10 } })
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
