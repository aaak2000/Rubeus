import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { SubscriptionStatus } from '@prisma/client';

/** A provider event reduced to the fields the entitlement layer cares about. */
export interface NormalizedBillingEvent {
  eventId: string;
  type: string;
  email: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Paddle Billing webhooks.
 *
 * Paddle is the merchant of record, which is why it was chosen here: it
 * handles Israeli VAT and invoicing, and no payment licence is needed. Only
 * this file knows that — everything upstream sees `NormalizedBillingEvent`.
 */
@Injectable()
export class PaddleAdapter {
  private readonly log = new Logger(PaddleAdapter.name);

  readonly name = 'paddle';

  /**
   * Verify the `Paddle-Signature` header against the raw request body.
   *
   * The raw bytes matter: re-serializing the parsed JSON changes key order and
   * whitespace, and the signature would never match. Comparison is constant
   * time — a fast string compare leaks how much of the digest was right.
   */
  verify(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const secret = process.env.PADDLE_WEBHOOK_SECRET;
    if (!secret) {
      this.log.warn('PADDLE_WEBHOOK_SECRET not set — rejecting webhook');
      return false;
    }
    if (!signatureHeader) return false;

    // Format: `ts=1700000000;h1=<hex digest>`
    const parts = Object.fromEntries(
      signatureHeader.split(';').map((p) => {
        const i = p.indexOf('=');
        return [p.slice(0, i), p.slice(i + 1)];
      }),
    );
    const ts = parts.ts;
    const h1 = parts.h1;
    if (!ts || !h1) return false;

    // Reject a stale signature so a captured request cannot be replayed later.
    const ageSeconds = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

    const expected = createHmac('sha256', secret)
      .update(`${ts}:${rawBody.toString('utf8')}`)
      .digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(h1, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Sandbox and production are separate Paddle accounts with separate hosts. */
  private get apiBase(): string {
    return process.env.PADDLE_ENVIRONMENT === 'sandbox'
      ? 'https://sandbox-api.paddle.com'
      : 'https://api.paddle.com';
  }

  /**
   * Schedule a cancellation at the end of the paid period.
   *
   * Deliberately not `immediately`: the user has paid through the period, and
   * Paddle would prorate a refund we have no way to reconcile here. They keep
   * what they bought and simply are not billed again.
   *
   * A 404 counts as success. It means Paddle has no such subscription — it was
   * already cancelled, or the id is stale — and either way there is nothing
   * left to cancel, so failing would leave the user unable to complete a
   * cancellation they are entitled to.
   */
  async cancelAtPeriodEnd(providerSubscriptionId: string): Promise<void> {
    await this.request('POST', `/subscriptions/${providerSubscriptionId}/cancel`, {
      effective_from: 'next_billing_period',
    });
  }

  /**
   * Withdraw a scheduled cancellation, while the period is still running.
   *
   * Without this, changing your mind means cancelling and buying again — a
   * second transaction, a second invoice, and a gap if the period has lapsed
   * in between.
   */
  async resume(providerSubscriptionId: string): Promise<void> {
    await this.request('PATCH', `/subscriptions/${providerSubscriptionId}`, {
      scheduled_change: null,
    });
  }

  private async request(method: string, path: string, body: unknown): Promise<void> {
    const key = process.env.PADDLE_API_KEY;
    if (!key) throw new Error('PADDLE_API_KEY is not set');

    // Without a timeout a hung provider holds the request open until the
    // client gives up, and the user is left not knowing whether they cancelled.
    const abort = AbortSignal.timeout(15_000);
    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abort,
    });
    if (res.status === 404) {
      this.log.warn(`Paddle reports no such subscription for ${method} ${path}`);
      return;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Paddle ${method} ${path} failed: ${res.status} ${detail.slice(0, 300)}`);
    }
  }

  /** Reduce a Paddle event to the shape the entitlement layer stores. */
  normalize(body: unknown): NormalizedBillingEvent | null {
    const e = body as {
      event_id?: string;
      event_type?: string;
      data?: {
        id?: string;
        status?: string;
        scheduled_change?: { action?: string } | null;
        current_billing_period?: { ends_at?: string } | null;
        customer?: { email?: string } | null;
        customer_id?: string;
      };
    };
    if (!e.event_id || !e.event_type || !e.data) return null;
    if (!e.event_type.startsWith('subscription.')) return null;

    const ends = e.data.current_billing_period?.ends_at;
    return {
      eventId: e.event_id,
      type: e.event_type,
      email: e.data.customer?.email ?? null,
      providerCustomerId: e.data.customer_id ?? null,
      providerSubscriptionId: e.data.id ?? null,
      status: mapStatus(e.data.status),
      currentPeriodEnd: ends ? new Date(ends) : null,
      cancelAtPeriodEnd: e.data.scheduled_change?.action === 'cancel',
    };
  }
}

/**
 * Paddle's status vocabulary, mapped onto ours.
 *
 * The status alone decides this; the event type does not. A cancellation is
 * reported as `canceled` with the paid period still running, and it is
 * `currentPeriodEnd` — not the event — that ends the entitlement.
 *
 * Anything unrecognised becomes `expired` rather than a guess: withholding a
 * benefit that should have been granted is a support ticket, while granting
 * one that should not have been is unpaid service given away indefinitely.
 */
function mapStatus(status: string | undefined): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'pastDue';
    case 'paused':
    case 'canceled':
      return 'canceled';
    default:
      return 'expired';
  }
}
