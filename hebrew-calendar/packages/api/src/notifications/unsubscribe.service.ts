import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * One-click unsubscribe from reminder email.
 *
 * The link has to work without logging in — someone who wants the mail to stop
 * should not have to remember a password first, and a link that demands one is
 * a link most people ignore in favour of marking the message as spam. So the
 * token is a signed statement of "this address opted out", verifiable without
 * a session and useless for anything else: it carries no session, grants no
 * read access, and can only ever turn email off.
 */
@Injectable()
export class UnsubscribeService {
  constructor(private readonly prisma: PrismaService) {}

  private secret(): string {
    // Derived from the refresh secret rather than adding another required
    // variable to configure — one less thing to get wrong at deploy time.
    return process.env.JWT_REFRESH_SECRET ?? 'unsubscribe-dev-secret';
  }

  /** `<userId>.<signature>` — no expiry, because the wish does not expire. */
  tokenFor(userId: string): string {
    const sig = createHmac('sha256', this.secret()).update(userId).digest('base64url');
    return `${userId}.${sig}`;
  }

  private verify(token: string): string | null {
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;
    const userId = token.slice(0, dot);
    const given = Buffer.from(token.slice(dot + 1), 'utf8');
    const expected = Buffer.from(
      createHmac('sha256', this.secret()).update(userId).digest('base64url'),
      'utf8',
    );
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return userId;
  }

  /**
   * Turn reminder email off for the token's owner.
   *
   * Reports success for any well-formed token whose user no longer exists too:
   * the outcome the sender wanted — no more mail — already holds, and saying
   * "no such account" would turn the link into a way to test which addresses
   * are registered.
   */
  async unsubscribe(token: string): Promise<{ unsubscribed: boolean }> {
    const userId = this.verify(token);
    if (!userId) return { unsubscribed: false };
    await this.prisma.userSettings
      .upsert({
        where: { userId },
        create: { userId, emailReminders: false },
        update: { emailReminders: false },
      })
      .catch(() => undefined);
    return { unsubscribed: true };
  }
}
