import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AdCampaign, AdPlacement } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** What the client needs to know to decide whether and how to show ads. */
export interface AdConfig {
  /** Network fill is only attempted when a publisher id is configured. */
  network: { enabled: boolean; provider: 'adsense' | null; clientId: string | null };
  /** Interstitial pacing, enforced client-side and stated here so it is auditable. */
  interstitial: { minNavigations: number; minMinutesBetween: number; maxPerDay: number };
}

/** A campaign as the operator sees it, counters included. */
export interface CampaignView extends ServedAd {
  placement: AdPlacement;
  weight: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  impressions: number;
  clicks: number;
  /** Clicks per impression, or null before there is anything to divide by. */
  clickRate: number | null;
  createdAt: string;
}

function toView(c: AdCampaign): CampaignView {
  return {
    ...toServed(c),
    placement: c.placement,
    weight: c.weight,
    active: c.active,
    startsAt: c.startsAt?.toISOString() ?? null,
    endsAt: c.endsAt?.toISOString() ?? null,
    impressions: c.impressions,
    clicks: c.clicks,
    clickRate: c.impressions > 0 ? c.clicks / c.impressions : null,
    createdAt: c.createdAt.toISOString(),
  };
}

/** An ad as served to the client. */
export interface ServedAd {
  id: string;
  advertiser: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  targetUrl: string;
}

function toServed(c: AdCampaign): ServedAd {
  return {
    id: c.id,
    advertiser: c.advertiser,
    title: c.title,
    body: c.body,
    imageUrl: c.imageUrl,
    targetUrl: c.targetUrl,
  };
}

@Injectable()
export class AdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Client-facing ad configuration.
   *
   * Network fill stays off unless a publisher id is present, so a deployment
   * that has not signed up for a network simply serves house inventory.
   */
  getConfig(): AdConfig {
    const clientId = this.config.get<string>('ADSENSE_CLIENT_ID') || null;
    return {
      network: { enabled: Boolean(clientId), provider: clientId ? 'adsense' : null, clientId },
      interstitial: {
        minNavigations: Number(this.config.get<string>('AD_INTERSTITIAL_MIN_NAVIGATIONS') ?? 4),
        minMinutesBetween: Number(this.config.get<string>('AD_INTERSTITIAL_MIN_MINUTES') ?? 30),
        maxPerDay: Number(this.config.get<string>('AD_INTERSTITIAL_MAX_PER_DAY') ?? 4),
      },
    };
  }

  /**
   * Pick one eligible campaign, weighted, or null when none apply.
   *
   * Only campaigns that are active and inside their flight dates are eligible;
   * selection is weighted so a campaign with weight 3 is drawn three times as
   * often as one with weight 1.
   */
  async pick(placement: AdPlacement, now: Date = new Date()): Promise<ServedAd | null> {
    const eligible = await this.prisma.adCampaign.findMany({
      where: {
        placement,
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
    });
    if (eligible.length === 0) return null;

    const total = eligible.reduce((sum, c) => sum + Math.max(1, c.weight), 0);
    let ticket = Math.random() * total;
    for (const campaign of eligible) {
      ticket -= Math.max(1, campaign.weight);
      if (ticket <= 0) {
        await this.prisma.adCampaign.update({
          where: { id: campaign.id },
          data: { impressions: { increment: 1 } },
        });
        return toServed(campaign);
      }
    }
    return toServed(eligible[eligible.length - 1]!);
  }

  /** Record a click and hand back the destination, so clicks are attributable. */
  async registerClick(id: string): Promise<{ targetUrl: string }> {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    await this.prisma.adCampaign.update({ where: { id }, data: { clicks: { increment: 1 } } });
    return { targetUrl: campaign.targetUrl };
  }
  // --- operator-facing campaign management ---

  /** Every campaign, newest first, with its counters. */
  async listCampaigns(): Promise<CampaignView[]> {
    const rows = await this.prisma.adCampaign.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toView);
  }

  async createCampaign(input: CampaignInput): Promise<CampaignView> {
    const { startsAt, endsAt } = this.flightDates(input.startsAt, input.endsAt);
    const row = await this.prisma.adCampaign.create({
      data: {
        advertiser: input.advertiser as string,
        title: input.title as string,
        body: input.body ?? null,
        imageUrl: input.imageUrl ?? null,
        targetUrl: input.targetUrl as string,
        placement: input.placement ?? AdPlacement.interstitial,
        weight: input.weight ?? 1,
        active: input.active ?? true,
        startsAt,
        endsAt,
      },
    });
    return toView(row);
  }

  async updateCampaign(id: string, input: CampaignInput): Promise<CampaignView> {
    const existing = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');

    // A field absent from the body is left alone; one sent as null is cleared.
    // Collapsing those two into "falsy means clear" would wipe a campaign's
    // picture every time someone edited its title.
    const data: Record<string, unknown> = {};
    for (const key of [
      'advertiser',
      'title',
      'targetUrl',
      'placement',
      'weight',
      'active',
    ] as const) {
      if (input[key] !== undefined) data[key] = input[key];
    }
    for (const key of ['body', 'imageUrl'] as const) {
      if (input[key] !== undefined) data[key] = input[key] ?? null;
    }

    const { startsAt, endsAt } = this.flightDates(
      input.startsAt === undefined ? (existing.startsAt?.toISOString() ?? null) : input.startsAt,
      input.endsAt === undefined ? (existing.endsAt?.toISOString() ?? null) : input.endsAt,
    );
    if (input.startsAt !== undefined) data.startsAt = startsAt;
    if (input.endsAt !== undefined) data.endsAt = endsAt;

    return toView(await this.prisma.adCampaign.update({ where: { id }, data }));
  }

  async deleteCampaign(id: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    await this.prisma.adCampaign.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Parse the flight window, refusing one that can never run.
   *
   * A campaign ending before it starts is silently ineligible forever: it is
   * accepted, appears in the list as active, and never serves. Better to
   * refuse it than to let the operator wonder why nothing shows.
   */
  private flightDates(
    startsAt: string | null | undefined,
    endsAt: string | null | undefined,
  ): { startsAt: Date | null; endsAt: Date | null } {
    const start = startsAt ? new Date(startsAt) : null;
    const end = endsAt ? new Date(endsAt) : null;
    if (start && end && end.getTime() < start.getTime()) {
      throw new BadRequestException('endsAt is before startsAt, so the campaign could never run');
    }
    return { startsAt: start, endsAt: end };
  }
}

/** The writable shape of a campaign; every field optional at this layer. */
export interface CampaignInput {
  advertiser?: string;
  title?: string;
  body?: string | null;
  imageUrl?: string | null;
  targetUrl?: string;
  placement?: AdPlacement;
  weight?: number;
  active?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}
