import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdPlacement, type AdCampaign } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** What the client needs to know to decide whether and how to show ads. */
export interface AdConfig {
  /** Network fill is only attempted when a publisher id is configured. */
  network: { enabled: boolean; provider: 'adsense' | null; clientId: string | null };
  /** Interstitial pacing, enforced client-side and stated here so it is auditable. */
  interstitial: { minNavigations: number; minMinutesBetween: number; maxPerDay: number };
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
}
