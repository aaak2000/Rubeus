import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type AuthTokens } from './auth.service';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

/**
 * Sign-in scopes only.
 *
 * Not `.../auth/calendar`, which is what the sync connection in `OAuthService`
 * asks for. These three are non-sensitive, so signing in does not drag this
 * app into the review that calendar access needs — the two flows stay on
 * separate tracks on purpose.
 */
const SIGN_IN_SCOPE = 'openid email profile';

/** The provider key stored on AuthIdentity. */
const PROVIDER = 'google';

/** How long the browser has to redeem the one-time code. */
const CODE_TTL_MS = 2 * 60_000;

interface GoogleProfile {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class GoogleSignInService {
  private readonly log = new Logger(GoogleSignInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  get configured(): boolean {
    return Boolean(
      this.config.get<string>('GOOGLE_CLIENT_ID') &&
        this.config.get<string>('GOOGLE_CLIENT_SECRET') &&
        this.config.get<string>('GOOGLE_SIGNIN_REDIRECT_URI'),
    );
  }

  /**
   * Where to send the browser to start a sign-in.
   *
   * The state is a signed, short-lived token carrying a nonce. Unlike the
   * connection flow's state it holds no user id — there is no user yet, which
   * is the whole reason this cannot reuse OAuthService.
   */
  async authUrl(): Promise<string> {
    if (!this.configured) throw new BadRequestException('Google sign-in is not configured');
    const state = await this.jwt.signAsync(
      { nonce: randomBytes(16).toString('base64url') },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: '10m' },
    );
    const params = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      redirect_uri: this.config.getOrThrow<string>('GOOGLE_SIGNIN_REDIRECT_URI'),
      response_type: 'code',
      scope: SIGN_IN_SCOPE,
      state,
      // Prompts for account choice rather than silently reusing whichever
      // Google account the browser happens to be signed into.
      prompt: 'select_account',
    });
    return `${GOOGLE_AUTH}?${params}`;
  }

  /** Handle Google's redirect back, returning a one-time code for the browser. */
  async handleCallback(code: string, state: string): Promise<string> {
    await this.verifyState(state);
    const profile = await this.fetchProfile(code);
    const user = await this.resolveUser(profile);
    return this.issueLoginCode(user.id);
  }

  private async verifyState(state: string): Promise<void> {
    try {
      await this.jwt.verifyAsync(state, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired sign-in state');
    }
  }

  /**
   * Exchange the authorization code and read the profile.
   *
   * The profile comes from Google's userinfo endpoint rather than by decoding
   * the id_token. Both are fine, but this needs no JWT signature verification
   * and so no key-fetching dependency: the access token was obtained by this
   * server, over TLS, directly from Google, and is presented back to Google.
   */
  private async fetchProfile(code: string): Promise<GoogleProfile> {
    const body = new URLSearchParams({
      code,
      client_id: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      client_secret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      redirect_uri: this.config.getOrThrow<string>('GOOGLE_SIGNIN_REDIRECT_URI'),
      grant_type: 'authorization_code',
    });
    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenRes.ok) {
      this.log.warn(`Google token exchange failed: ${tokenRes.status}`);
      throw new UnauthorizedException('Google sign-in failed');
    }
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    if (!access_token) throw new UnauthorizedException('Google sign-in failed');

    const infoRes = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!infoRes.ok) {
      this.log.warn(`Google userinfo failed: ${infoRes.status}`);
      throw new UnauthorizedException('Google sign-in failed');
    }
    const profile = (await infoRes.json()) as GoogleProfile;
    if (!profile.sub) throw new UnauthorizedException('Google sign-in failed');
    return profile;
  }

  /**
   * Find or create the account this Google profile signs in as.
   *
   * The three cases, in order, and why:
   *
   * 1. We have seen this Google account before — sign in as whoever it is
   *    attached to. Matched on the provider's subject id, never the email,
   *    because people change their email address and the subject is stable.
   * 2. An account already exists with this address. Link them, but only if
   *    Google says the address is verified. Linking on an unverified address
   *    is account takeover: anyone who can persuade a provider to claim an
   *    address they do not own would inherit the account behind it.
   * 3. Nobody by that address — create the account. It gets no password, and
   *    signs in through Google from here on.
   */
  private async resolveUser(profile: GoogleProfile): Promise<{ id: string }> {
    const identity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerAccountId: { provider: PROVIDER, providerAccountId: profile.sub } },
      select: { userId: true },
    });
    if (identity) return { id: identity.userId };

    const email = profile.email?.toLowerCase();
    if (!email) throw new UnauthorizedException('Google did not report an email address');

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      if (!profile.email_verified) {
        this.log.warn('refusing to link an unverified provider address to an existing account');
        throw new UnauthorizedException('Google has not verified this address');
      }
      await this.prisma.authIdentity.create({
        data: { userId: existing.id, provider: PROVIDER, providerAccountId: profile.sub, email },
      });
      return existing;
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        // No password: this account is reached through Google.
        passwordHash: null,
        displayName: profile.name ?? null,
        settings: { create: {} },
        calendars: { create: { name: 'היומן שלי', isDefault: true, color: '#3b82f6' } },
        identities: { create: { provider: PROVIDER, providerAccountId: profile.sub, email } },
      },
      select: { id: true },
    });
    return user;
  }

  private async issueLoginCode(userId: string): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    await this.prisma.loginCode.create({
      data: { codeHash: hashCode(code), userId, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    });
    return code;
  }

  /**
   * Redeem the one-time code for a real token pair.
   *
   * Marked used inside the same statement that finds it, so two racing
   * requests cannot both succeed: `updateMany` with `usedAt: null` in the
   * filter either claims the row or reports nothing to claim.
   */
  async exchange(code: string): Promise<AuthTokens> {
    const claimed = await this.prisma.loginCode.updateMany({
      where: { codeHash: hashCode(code), usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw new UnauthorizedException('Invalid or expired sign-in code');

    const record = await this.prisma.loginCode.findUnique({
      where: { codeHash: hashCode(code) },
      include: { user: true },
    });
    if (!record) throw new UnauthorizedException('Invalid or expired sign-in code');
    return this.auth.issueTokensFor(record.user);
  }
}
