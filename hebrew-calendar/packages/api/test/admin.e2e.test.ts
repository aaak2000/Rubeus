import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, uniqueEmail } from './setup';

let app: INestApplication;
let prisma: PrismaService;
let adminToken: string;
let plainToken: string;
let adminEmail: string;

const server = () => request(app.getHttpServer());
const asAdmin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
const asUser = (r: request.Test) => r.set('Authorization', `Bearer ${plainToken}`);

async function register(prefix: string): Promise<{ email: string; token: string }> {
  const email = uniqueEmail(prefix);
  const res = await server()
    .post('/api/auth/register')
    .send({ email, password: 'password123' })
    .expect(201);
  return { email, token: res.body.accessToken };
}

const campaign = {
  advertiser: 'test-admin-advertiser',
  title: 'מודעה מהממשק',
  targetUrl: 'https://example.test/landing',
};

beforeAll(async () => {
  // Register first, then put that address on the allowlist: the guard reads
  // the variable per call, so the order does not matter to it — but this makes
  // it obvious that being an admin is not a property of the account.
  ({ app, prisma } = await createTestApp());
  const admin = await register('admin');
  adminEmail = admin.email;
  adminToken = admin.token;
  plainToken = (await register('plain')).token;
  process.env.ADMIN_EMAILS = `someone-else@example.test, ${adminEmail.toUpperCase()}`;
  await prisma.adCampaign.deleteMany({ where: { advertiser: { startsWith: 'test-admin' } } });
});
afterAll(async () => {
  await prisma?.adCampaign.deleteMany({ where: { advertiser: { startsWith: 'test-admin' } } });
  delete process.env.ADMIN_EMAILS;
  await app?.close();
});

describe('who may manage campaigns', () => {
  it('lets an allowlisted operator in, whatever the casing', async () => {
    await asAdmin(server().get('/api/admin/ads')).expect(200);
  });

  it('refuses an ordinary signed-in account', async () => {
    await asUser(server().get('/api/admin/ads')).expect(403);
    await asUser(server().post('/api/admin/ads')).send(campaign).expect(403);
  });

  it('refuses an anonymous caller before it looks at the allowlist', async () => {
    await server().get('/api/admin/ads').expect(401);
  });

  it('refuses everyone when no allowlist is configured', async () => {
    // The dangerous reading of an empty list is "no admins configured, so
    // allow" — that would hand campaign management to every account on a
    // fresh deployment.
    const saved = process.env.ADMIN_EMAILS;
    delete process.env.ADMIN_EMAILS;
    try {
      await asAdmin(server().get('/api/admin/ads')).expect(403);
    } finally {
      process.env.ADMIN_EMAILS = saved;
    }
  });
});

describe('managing campaigns', () => {
  let id: string;

  it('creates one and reports it with empty counters', async () => {
    const res = await asAdmin(server().post('/api/admin/ads'))
      .send({ ...campaign, body: 'תיאור', weight: 3 })
      .expect(201);
    id = res.body.id;
    expect(res.body.advertiser).toBe(campaign.advertiser);
    expect(res.body.weight).toBe(3);
    expect(res.body.active).toBe(true);
    expect(res.body.impressions).toBe(0);
    // Not zero: there is nothing to divide by yet, and 0% would read as
    // "nobody clicked" rather than "nobody has seen it".
    expect(res.body.clickRate).toBeNull();
  });

  it('lists it with the counters the operator needs', async () => {
    const res = await asAdmin(server().get('/api/admin/ads')).expect(200);
    const row = res.body.find((c: { id: string }) => c.id === id);
    expect(row).toBeTruthy();
    expect(row).toMatchObject({ impressions: 0, clicks: 0, placement: 'interstitial' });
  });

  it('pauses a campaign without deleting it', async () => {
    const res = await asAdmin(server().patch(`/api/admin/ads/${id}`))
      .send({ active: false })
      .expect(200);
    expect(res.body.active).toBe(false);
    // Paused means not served, which is the whole point of the switch.
    const served = await server().get('/api/ads/next?placement=interstitial').expect(200);
    expect(served.body.ad?.id).not.toBe(id);
  });

  it('leaves untouched fields alone when one is edited', async () => {
    await asAdmin(server().patch(`/api/admin/ads/${id}`))
      .send({ imageUrl: 'https://example.test/pic.png' })
      .expect(200);
    const res = await asAdmin(server().patch(`/api/admin/ads/${id}`))
      .send({ title: 'כותרת חדשה' })
      .expect(200);
    expect(res.body.title).toBe('כותרת חדשה');
    // Editing a title must not wipe the picture.
    expect(res.body.imageUrl).toBe('https://example.test/pic.png');
    expect(res.body.body).toBe('תיאור');
  });

  it('clears a field that is explicitly sent as null', async () => {
    const res = await asAdmin(server().patch(`/api/admin/ads/${id}`))
      .send({ imageUrl: null })
      .expect(200);
    expect(res.body.imageUrl).toBeNull();
  });

  it('reports a click rate once there is something to divide by', async () => {
    await prisma.adCampaign.update({
      where: { id },
      data: { impressions: 200, clicks: 4 },
    });
    const res = await asAdmin(server().get('/api/admin/ads')).expect(200);
    const row = res.body.find((c: { id: string }) => c.id === id);
    expect(row.clickRate).toBeCloseTo(0.02);
  });

  it('deletes one', async () => {
    await asAdmin(server().delete(`/api/admin/ads/${id}`)).expect(200);
    await asAdmin(server().patch(`/api/admin/ads/${id}`))
      .send({ title: 'x' })
      .expect(404);
  });
});

describe('what a campaign may contain', () => {
  it('refuses a javascript: target', async () => {
    // targetUrl becomes an href in the client, so this would run in the page
    // of everyone shown the ad.
    await asAdmin(server().post('/api/admin/ads'))
      .send({ ...campaign, targetUrl: 'javascript:alert(1)' })
      .expect(400);
  });

  it('refuses a javascript: image source', async () => {
    await asAdmin(server().post('/api/admin/ads'))
      .send({ ...campaign, imageUrl: 'javascript:alert(1)' })
      .expect(400);
  });

  it('refuses a flight window that ends before it starts', async () => {
    await asAdmin(server().post('/api/admin/ads'))
      .send({
        ...campaign,
        startsAt: '2026-05-01T00:00:00.000Z',
        endsAt: '2026-04-01T00:00:00.000Z',
      })
      .expect(400);
  });

  it('requires an advertiser and a target', async () => {
    await asAdmin(server().post('/api/admin/ads')).send({ title: 'רק כותרת' }).expect(400);
  });

  it('refuses a weight that would swamp every other campaign', async () => {
    await asAdmin(server().post('/api/admin/ads'))
      .send({ ...campaign, weight: 100_000 })
      .expect(400);
  });
});
