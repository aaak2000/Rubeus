import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload, LoginDto, RegisterDto } from './dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; displayName: string | null };
}

/** Refresh tokens are opaque random strings; only their hash is stored. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function refreshTtlMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 30 * 24 * 3600_000;
  const n = Number(m[1]);
  const unit = m[2] as 's' | 'm' | 'h' | 'd';
  return n * { s: 1000, m: 60_000, h: 3600_000, d: 86_400_000 }[unit];
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
    const passwordHash = await bcrypt.hash(dto.password, 12);

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
    // Compare unconditionally so a missing account and a wrong password take
    // comparable time and cannot be distinguished by timing.
    const hash =
      user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    const ok = await bcrypt.compare(dto.password, hash);
    if (!user || !ok) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user.id, user.email, user.displayName);
  }

  /**
   * Exchange a refresh token for a fresh pair, rotating the old one.
   *
   * Reuse of an already-rotated token indicates the token leaked, so every
   * outstanding session for that user is revoked.
   */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!record) throw new UnauthorizedException('Invalid refresh token');

    if (record.revokedAt) {
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException('Refresh token has already been used');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const tokens = await this.issueTokens(
      record.user.id,
      record.user.email,
      record.user.displayName,
    );
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedById: hashToken(tokens.refreshToken) },
    });
    return tokens;
  }

  /** Revoke a single session (sign-out). Unknown tokens are a no-op. */
  async logout(refreshToken: string): Promise<{ revoked: boolean }> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count > 0 };
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Issue a session for a user already established by some other means — a
   * provider sign-in, where there is no password to check.
   */
  async issueTokensFor(user: {
    id: string;
    email: string;
    displayName: string | null;
  }): Promise<AuthTokens> {
    return this.issueTokens(user.id, user.email, user.displayName);
  }

  private async issueTokens(
    id: string,
    email: string,
    displayName: string | null,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: id, email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const ttl = refreshTtlMs(this.config.get<string>('JWT_REFRESH_TTL') ?? '30d');
    await this.prisma.refreshToken.create({
      data: {
        userId: id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ttl),
      },
    });

    return { accessToken, refreshToken, user: { id, email, displayName } };
  }
}
