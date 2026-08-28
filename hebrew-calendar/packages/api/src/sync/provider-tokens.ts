import type { TokenSource } from '@hcal/sync';
import type { ProviderConnection } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { TokenCrypto } from '../common/token-crypto';

/**
 * A {@link TokenSource} for a stored provider connection that decrypts the
 * access token and transparently refreshes it (Google / Microsoft) when
 * expired, persisting the new token.
 */
export class ConnectionTokenSource implements TokenSource {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: TokenCrypto,
    private connection: ProviderConnection,
  ) {}

  async getAccessToken(): Promise<string> {
    const notExpired = !this.connection.expiresAt || this.connection.expiresAt.getTime() > Date.now() + 60_000;
    if (notExpired) return this.crypto.decrypt(this.connection.accessTokenEnc);
    return this.refresh();
  }

  private async refresh(): Promise<string> {
    if (!this.connection.refreshTokenEnc) {
      // No refresh token — return the (possibly stale) access token and let the API surface a 401.
      return this.crypto.decrypt(this.connection.accessTokenEnc);
    }
    const refreshToken = this.crypto.decrypt(this.connection.refreshTokenEnc);
    const { url, body } = this.refreshRequest(refreshToken);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`Token refresh failed for ${this.connection.provider}: ${await res.text()}`);
    const tokens = (await res.json()) as { access_token: string; expires_in?: number; refresh_token?: string };

    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    this.connection = await this.prisma.providerConnection.update({
      where: { id: this.connection.id },
      data: {
        accessTokenEnc: this.crypto.encrypt(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? this.crypto.encrypt(tokens.refresh_token) : this.connection.refreshTokenEnc,
        expiresAt,
      },
    });
    return tokens.access_token;
  }

  private refreshRequest(refreshToken: string): { url: string; body: URLSearchParams } {
    if (this.connection.provider === 'google') {
      return {
        url: 'https://oauth2.googleapis.com/token',
        body: new URLSearchParams({
          client_id: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
          client_secret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      };
    }
    const tenant = this.config.get<string>('MS_TENANT') ?? 'common';
    return {
      url: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      body: new URLSearchParams({
        client_id: this.config.getOrThrow<string>('MS_CLIENT_ID'),
        client_secret: this.config.getOrThrow<string>('MS_CLIENT_SECRET'),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'offline_access Calendars.ReadWrite',
      }),
    };
  }
}
