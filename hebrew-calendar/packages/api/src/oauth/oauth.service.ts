import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { TOKEN_CRYPTO } from '../common/common.module';
import { TokenCrypto } from '../common/token-crypto';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar openid email';

/** OAuth authorization-code flow for Google and Microsoft. */
@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    @Inject(TOKEN_CRYPTO) private readonly crypto: TokenCrypto,
  ) {}

  /** A signed, short-lived state token binding the callback to a user. */
  private async makeState(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId }, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '10m',
    });
  }

  private async readState(state: string): Promise<string> {
    try {
      const p = await this.jwt.verifyAsync<{ sub: string }>(state, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      return p.sub;
    } catch {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
  }

  async googleAuthUrl(userId: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      redirect_uri: this.config.getOrThrow<string>('GOOGLE_REDIRECT_URI'),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPE,
      state: await this.makeState(userId),
    });
    return `${GOOGLE_AUTH}?${params}`;
  }

  async handleGoogleCallback(code: string, state: string): Promise<{ connectionId: string }> {
    const userId = await this.readState(state);
    const body = new URLSearchParams({
      code,
      client_id: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      client_secret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      redirect_uri: this.config.getOrThrow<string>('GOOGLE_REDIRECT_URI'),
      grant_type: 'authorization_code',
    });
    const tokens = await this.exchange(GOOGLE_TOKEN, body);
    return this.persist(userId, 'google', tokens);
  }

  async microsoftAuthUrl(userId: string): Promise<string> {
    const tenant = this.config.get<string>('MS_TENANT') ?? 'common';
    const params = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('MS_CLIENT_ID'),
      redirect_uri: this.config.getOrThrow<string>('MS_REDIRECT_URI'),
      response_type: 'code',
      response_mode: 'query',
      scope: 'offline_access Calendars.ReadWrite openid email',
      state: await this.makeState(userId),
    });
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
  }

  async handleMicrosoftCallback(code: string, state: string): Promise<{ connectionId: string }> {
    const userId = await this.readState(state);
    const tenant = this.config.get<string>('MS_TENANT') ?? 'common';
    const body = new URLSearchParams({
      code,
      client_id: this.config.getOrThrow<string>('MS_CLIENT_ID'),
      client_secret: this.config.getOrThrow<string>('MS_CLIENT_SECRET'),
      redirect_uri: this.config.getOrThrow<string>('MS_REDIRECT_URI'),
      grant_type: 'authorization_code',
    });
    const tokens = await this.exchange(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, body);
    return this.persist(userId, 'microsoft', tokens);
  }

  /** Store a CalDAV connection (basic auth) and create its mirror calendar. */
  async connectCaldav(
    userId: string,
    input: { url: string; username: string; password: string },
  ): Promise<{ connectionId: string }> {
    if (!input.url || !input.username || !input.password) {
      throw new BadRequestException('url, username and password are required');
    }
    const connection = await this.prisma.providerConnection.create({
      data: {
        userId,
        provider: 'caldav',
        accountEmail: input.username,
        accessTokenEnc: this.crypto.encrypt(input.password),
        caldavUrl: input.url,
      },
    });
    await this.prisma.calendar.create({
      data: { userId, name: 'CalDAV', connectionId: connection.id, color: '#10b981' },
    });
    return { connectionId: connection.id };
  }

  private async exchange(url: string, body: URLSearchParams): Promise<TokenResponse> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw new BadRequestException(`Token exchange failed: ${await res.text()}`);
    return (await res.json()) as TokenResponse;
  }

  private async persist(
    userId: string,
    provider: 'google' | 'microsoft',
    tokens: TokenResponse,
  ): Promise<{ connectionId: string }> {
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    const connection = await this.prisma.providerConnection.create({
      data: {
        userId,
        provider,
        accessTokenEnc: this.crypto.encrypt(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? this.crypto.encrypt(tokens.refresh_token) : null,
        expiresAt,
        scope: tokens.scope,
      },
    });
    // Create a local mirror calendar for this connection.
    await this.prisma.calendar.create({
      data: {
        userId,
        name: provider === 'google' ? 'Google Calendar' : 'Outlook',
        connectionId: connection.id,
        providerCalendarId: provider === 'google' ? 'primary' : null,
        color: provider === 'google' ? '#0ea5e9' : '#6366f1',
      },
    });
    return { connectionId: connection.id };
  }
}
