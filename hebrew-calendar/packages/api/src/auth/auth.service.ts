import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload, LoginDto, RegisterDto } from './dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; displayName: string | null };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        settings: { create: {} },
        calendars: { create: { name: 'היומן שלי', isDefault: true, color: '#3b82f6' } },
      },
    });
    return this.issueTokens(user.id, user.email, user.displayName);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user.id, user.email, user.displayName);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.issueTokens(user.id, user.email, user.displayName);
  }

  private async issueTokens(id: string, email: string, displayName: string | null): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: id, email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? '30d',
    });
    return { accessToken, refreshToken, user: { id, email, displayName } };
  }
}
