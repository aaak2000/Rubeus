import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

/** What a notification carries, whatever channel delivers it. */
export interface NotificationPayload {
  title: string;
  body: string;
  /** Path to open when the notification is activated. */
  url: string;
  /** Collapses repeats of the same reminder into one notification. */
  tag: string;
}

/**
 * Web push delivery.
 *
 * VAPID keys come from the environment. Without them push is simply off — the
 * app still works and the other channels still deliver, so a missing key is a
 * disabled feature rather than a broken one.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  private readonly configured: boolean;

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
    this.configured = Boolean(publicKey && privateKey);
    if (this.configured) {
      webpush.setVapidDetails(subject, publicKey!, privateKey!);
    } else {
      this.log.log('VAPID keys not set — web push is disabled');
    }
  }

  get enabled(): boolean {
    return this.configured;
  }

  /** The key the browser needs to create a subscription. */
  publicKey(): string | null {
    return this.configured ? (process.env.VAPID_PUBLIC_KEY ?? null) : null;
  }

  /**
   * Register a browser endpoint. Keyed on the endpoint itself, so
   * re-subscribing the same device updates rather than duplicating.
   */
  async subscribe(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent ?? null,
      },
      // An endpoint can be reassigned when a browser profile changes hands.
      update: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        lastSeenAt: new Date(),
      },
    });
    return { subscribed: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { unsubscribed: true };
  }

  /**
   * Send to every device a user has registered.
   *
   * Returns how many landed. A 404 or 410 means the browser has discarded the
   * subscription — that endpoint is dead forever, so it is deleted rather than
   * retried on every future run.
   */
  async sendToUser(userId: string, payload: NotificationPayload): Promise<number> {
    if (!this.configured) return 0;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        } else {
          this.log.warn(`push to ${s.endpoint.slice(0, 40)}… failed: ${String(err)}`);
        }
      }
    }
    return sent;
  }
}
