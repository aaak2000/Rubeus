import { Injectable, Logger } from '@nestjs/common';
import type { Subscription, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** What the client needs to render the subscription surface. */
export interface BillingStatus {
  /** Whether ads should be suppressed for this user right now. */
  adFree: boolean;
  status: SubscriptionStatus | null;
  /** ISO instant the paid period runs to, when there is one. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plan: { priceCents: number; currency: string; interval: 'month' };
  /** False when no billing provider is configured on this deployment. */
  checkoutAvailable: boolean;
}

/**
 * Statuses that entitle the user.
 *
 * `canceled` is included deliberately: cancelling ends the renewal, not the
 * period already paid for. Turning ads back on the moment someone cancels
 * would be taking something they have already bought.
 */
const ENTITLED: SubscriptionStatus[] = ['active', 'trialing', 'pastDue', 'canceled'];

@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Price in agorot, so a few shekels a month is expressible exactly. */
  get plan() {
    return {
      priceCents: Number(process.env.SUBSCRIPTION_PRICE_AGOROT ?? 990),
      currency: process.env.SUBSCRIPTION_CURRENCY ?? 'ILS',
      interval: 'month' as const,
    };
  }

  get providerConfigured(): boolean {
    return Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_PRICE_ID);
  }

  /**
   * The single question the rest of the app asks: is this user ad-free?
   *
   * Note this is advisory to the client rather than enforced at the ad
   * endpoints: `/api/ads/*` takes no user identifier by design, so that
   * serving an ad cannot be joined to a person. Keeping that property is
   * worth more than making ad removal unspoofable — the worst case is
   * somebody sees fewer ads than they paid for the right to avoid.
   */
  async isAdFree(userId: string, now = new Date()): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    return this.entitled(sub, now);
  }

  private entitled(sub: Subscription | null, now: Date): boolean {
    if (!sub || !ENTITLED.includes(sub.status)) return false;
    // A period that has run out is not entitlement, whatever the status says —
    // a webhook can always be late or lost.
    if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < now.getTime()) return false;
    // A cancelled subscription is entitled only for the remainder of the paid
    // period, so it needs one. Without a period end there is nothing left to
    // run down, and treating that as open-ended would give the benefit away
    // for good.
    if (sub.status === 'canceled' && !sub.currentPeriodEnd) return false;
    return true;
  }

  async status(userId: string, now = new Date()): Promise<BillingStatus> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    return {
      adFree: this.entitled(sub, now),
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      plan: this.plan,
      checkoutAvailable: this.providerConfigured,
    };
  }

  /**
   * Record the state a provider reports for a subscription.
   *
   * The provider is the source of truth for status and dates; nothing here
   * infers them. Called by webhook handlers and by the manual grant path.
   */
  async upsertFromProvider(input: {
    userId: string;
    provider: string;
    status: SubscriptionStatus;
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
    priceCents?: number | null;
    currency?: string | null;
  }): Promise<Subscription> {
    const data = {
      provider: input.provider,
      status: input.status,
      providerCustomerId: input.providerCustomerId ?? null,
      providerSubscriptionId: input.providerSubscriptionId ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      priceCents: input.priceCents ?? null,
      currency: input.currency ?? null,
    };
    return this.prisma.subscription.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, ...data },
      update: data,
    });
  }

  /**
   * Claim a webhook event id. False means it has already been handled, so the
   * caller should do nothing — providers retry and do not promise to deliver
   * each event exactly once.
   */
  async claimEvent(id: string, provider: string, type: string): Promise<boolean> {
    try {
      await this.prisma.billingEvent.create({ data: { id, provider, type } });
      return true;
    } catch {
      return false;
    }
  }

  /** Resolve the user a provider event refers to. */
  async findUserByEmailOrSubscription(
    email: string | null,
    providerSubscriptionId: string | null,
  ): Promise<string | null> {
    if (providerSubscriptionId) {
      const sub = await this.prisma.subscription.findUnique({
        where: { providerSubscriptionId },
        select: { userId: true },
      });
      if (sub) return sub.userId;
    }
    if (email) {
      const user = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true },
      });
      if (user) return user.id;
    }
    this.log.warn('billing event could not be matched to a user');
    return null;
  }
}
