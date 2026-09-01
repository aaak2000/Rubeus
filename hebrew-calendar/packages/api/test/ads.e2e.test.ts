import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './setup';

let app: INestApplication;
let prisma: PrismaService;
const server = () => request(app.getHttpServer());

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await prisma.adCampaign.deleteMany({ where: { advertiser: { startsWith: 'test-' } } });
});
afterAll(async () => {
  await prisma?.adCampaign.deleteMany({ where: { advertiser: { startsWith: 'test-' } } });
  await app?.close();
});

async function makeCampaign(over: Record<string, unknown> = {}) {
  return prisma.adCampaign.create({
    data: {
      advertiser: 'test-advertiser',
      title: 'מודעה לבדיקה',
      targetUrl: 'https://example.test/landing',
      placement: 'interstitial',
      ...over,
    } as never,
  });
}

describe('ad configuration', () => {
  it('reports whether network fill is available', async () => {
    const res = await server().get('/api/ads/config').expect(200);
    expect(res.body.network).toHaveProperty('enabled');
    // Nothing is configured in tests, so network fill stays off.
    expect(res.body.network.enabled).toBe(false);
    expect(res.body.network.clientId).toBeNull();
  });

  it('states the interstitial pacing rules', async () => {
    const res = await server().get('/api/ads/config').expect(200);
    expect(res.body.interstitial.minNavigations).toBeGreaterThan(0);
    expect(res.body.interstitial.maxPerDay).toBeGreaterThan(0);
  });
});

describe('serving house ads', () => {
  it('returns null when no campaign is eligible', async () => {
    await prisma.adCampaign.deleteMany({});
    const res = await server().get('/api/ads/next?placement=interstitial').expect(200);
    expect(res.body.ad).toBeNull();
  });

  it('serves an active campaign and counts the impression', async () => {
    const campaign = await makeCampaign();
    const res = await server().get('/api/ads/next?placement=interstitial').expect(200);
    expect(res.body.ad.id).toBe(campaign.id);
    expect(res.body.ad.advertiser).toBe('test-advertiser');
    const after = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(after!.impressions).toBe(1);
  });

  it('never serves an inactive campaign', async () => {
    await prisma.adCampaign.deleteMany({});
    await makeCampaign({ active: false });
    const res = await server().get('/api/ads/next?placement=interstitial').expect(200);
    expect(res.body.ad).toBeNull();
  });

  it('respects the flight window', async () => {
    await prisma.adCampaign.deleteMany({});
    await makeCampaign({ endsAt: new Date(Date.now() - 86_400_000) }); // ended yesterday
    expect(
      (await server().get('/api/ads/next?placement=interstitial').expect(200)).body.ad,
    ).toBeNull();

    await prisma.adCampaign.deleteMany({});
    await makeCampaign({ startsAt: new Date(Date.now() + 86_400_000) }); // starts tomorrow
    expect(
      (await server().get('/api/ads/next?placement=interstitial').expect(200)).body.ad,
    ).toBeNull();
  });

  it('keeps placements separate', async () => {
    await prisma.adCampaign.deleteMany({});
    await makeCampaign({ placement: 'inline', title: 'שקע בתוך העמוד' });
    expect(
      (await server().get('/api/ads/next?placement=interstitial').expect(200)).body.ad,
    ).toBeNull();
    const inline = await server().get('/api/ads/next?placement=inline').expect(200);
    expect(inline.body.ad.title).toBe('שקע בתוך העמוד');
  });

  it('rejects an unknown placement', async () => {
    await server().get('/api/ads/next?placement=popup').expect(400);
  });

  it('records a click and returns the destination', async () => {
    await prisma.adCampaign.deleteMany({});
    const campaign = await makeCampaign();
    const res = await server().post(`/api/ads/${campaign.id}/click`).expect(201);
    expect(res.body.targetUrl).toBe('https://example.test/landing');
    const after = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(after!.clicks).toBe(1);
  });

  it('404s a click on an unknown campaign', async () => {
    await server().post('/api/ads/does-not-exist/click').expect(404);
  });

  it('honours weighting across many draws', async () => {
    await prisma.adCampaign.deleteMany({});
    const heavy = await makeCampaign({ advertiser: 'test-heavy', weight: 9 });
    await makeCampaign({ advertiser: 'test-light', weight: 1 });
    let heavyCount = 0;
    for (let i = 0; i < 60; i++) {
      const res = await server().get('/api/ads/next?placement=interstitial').expect(200);
      if (res.body.ad.id === heavy.id) heavyCount++;
    }
    // A 9:1 split should land far above half even allowing for randomness.
    expect(heavyCount).toBeGreaterThan(35);
  });
});
