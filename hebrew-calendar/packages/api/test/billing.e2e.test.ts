import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BillingService } from '../src/billing/billing.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, uniqueEmail } from './setup';

let app: INestApplication;
let token: string;
let userId: string;
let email: string;
let billing: BillingService;
let prisma: PrismaService;

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

const SECRET = 'test-webhook-secret';

/** Sign a body exactly as Paddle does, so the real verifier is exercised. */
function signed(body: unknown, at = Date.now()) {
  const raw = JSON.stringify(body);
  const ts = Math.floor(at / 1000);
  const h1 = createHmac('sha256', SECRET).update(`${ts}:${raw}`).digest('hex');
  return { raw, header: `ts=${ts};h1=${h1}` };
}

function subscriptionEvent(over: Record<string, unknown> = {}) {
  return {
    event_id: `evt_${Math.random().toString(36).slice(2)}`,
    event_type: 'subscription.activated',
    data: {
      id: `sub_${Math.random().toString(36).slice(2)}`,
      status: 'active',
      customer_id: 'ctm_1',
      customer: { email },
      current_billing_period: { ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString() },
      scheduled_change: null,
      ...over,
    },
  };
}

/** POST a raw body so the signature is checked against the exact bytes. */
function postWebhook(raw: string, header?: string) {
  const r = request(app.getHttpServer())
    .post('/api/billing/webhook/paddle')
    .set('Content-Type', 'application/json');
  if (header) r.set('Paddle-Signature', header);
  return r.send(raw);
}

beforeAll(async () => {
  process.env.PADDLE_WEBHOOK_SECRET = SECRET;
  ({ app } = await createTestApp());
  billing = app.get(BillingService);
  prisma = app.get(PrismaService);

  email = uniqueEmail('billing');
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password: 'password123' })
    .expect(201);
  token = res.body.accessToken;
  const me = await auth(request(app.getHttpServer()).get('/api/me')).expect(200);
  userId = me.body.id;
});
afterAll(async () => {
  await app?.close();
  delete process.env.PADDLE_WEBHOOK_SECRET;
});

describe('subscription status', () => {
  it('starts with no subscription and ads showing', async () => {
    const res = await auth(request(app.getHttpServer()).get('/api/billing/status')).expect(200);
    expect(res.body.adFree).toBe(false);
    expect(res.body.status).toBeNull();
    expect(res.body.plan.currency).toBe('ILS');
    expect(res.body.plan.priceCents).toBeGreaterThan(0);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/billing/status').expect(401);
  });
});

describe('paddle webhook', () => {
  it('rejects an unsigned request', async () => {
    const { raw } = signed(subscriptionEvent());
    await postWebhook(raw).expect(401);
  });

  it('rejects a tampered body', async () => {
    const event = subscriptionEvent();
    const { header } = signed(event);
    // Same signature, different bytes.
    await postWebhook(
      JSON.stringify({ ...event, event_type: 'subscription.canceled' }),
      header,
    ).expect(401);
  });

  it('rejects a replayed signature from an hour ago', async () => {
    const { raw, header } = signed(subscriptionEvent(), Date.now() - 3600_000);
    await postWebhook(raw, header).expect(401);
  });

  it('grants the subscription on a valid event', async () => {
    const { raw, header } = signed(subscriptionEvent());
    const res = await postWebhook(raw, header).expect(200);
    expect(res.body).toEqual({ applied: true });

    const status = await auth(request(app.getHttpServer()).get('/api/billing/status')).expect(200);
    expect(status.body.adFree).toBe(true);
    expect(status.body.status).toBe('active');
  });

  it('ignores a replayed event id rather than applying it twice', async () => {
    const event = subscriptionEvent();
    const first = signed(event);
    await postWebhook(first.raw, first.header).expect(200);
    // Re-sign the identical event with a fresh timestamp: the signature is
    // valid, but the event id has already been handled.
    const again = signed(event);
    const res = await postWebhook(again.raw, again.header).expect(200);
    expect(res.body).toEqual({ duplicate: true });
  });

  it('acknowledges an event type it does not model', async () => {
    const { raw, header } = signed({
      event_id: 'evt_other',
      event_type: 'transaction.completed',
      data: { id: 'txn_1' },
    });
    const res = await postWebhook(raw, header).expect(200);
    expect(res.body).toEqual({ ignored: true });
  });

  it('reports an event it cannot match to an account', async () => {
    const { raw, header } = signed(
      subscriptionEvent({ customer: { email: 'nobody@example.test' }, id: 'sub_unknown' }),
    );
    const res = await postWebhook(raw, header).expect(200);
    expect(res.body).toEqual({ unmatched: true });
  });
});

describe('entitlement rules', () => {
  const future = () => new Date(Date.now() + 10 * 86_400_000);
  const past = () => new Date(Date.now() - 1000);

  async function set(status: string, currentPeriodEnd: Date | null) {
    await billing.upsertFromProvider({
      userId,
      provider: 'test',
      status: status as never,
      currentPeriodEnd,
    });
  }

  it('entitles an active subscription', async () => {
    await set('active', future());
    expect(await billing.isAdFree(userId)).toBe(true);
  });

  it('entitles a trial', async () => {
    await set('trialing', future());
    expect(await billing.isAdFree(userId)).toBe(true);
  });

  it('keeps entitlement while a payment is being retried', async () => {
    // Cutting service off the moment a card is declined punishes the user for
    // the provider's retry schedule.
    await set('pastDue', future());
    expect(await billing.isAdFree(userId)).toBe(true);
  });

  it('keeps entitlement after cancellation until the paid period ends', async () => {
    await set('canceled', future());
    expect(await billing.isAdFree(userId)).toBe(true);
  });

  it('drops entitlement once that period has passed', async () => {
    await set('canceled', past());
    expect(await billing.isAdFree(userId)).toBe(false);
  });

  it('drops entitlement for an active subscription whose period has lapsed', async () => {
    // A renewal webhook can be late or lost; the date is the backstop.
    await set('active', past());
    expect(await billing.isAdFree(userId)).toBe(false);
  });

  it('does not entitle a cancellation with no period to run down', async () => {
    await set('canceled', null);
    expect(await billing.isAdFree(userId)).toBe(false);
  });

  it('does not entitle an expired subscription', async () => {
    await set('expired', future());
    expect(await billing.isAdFree(userId)).toBe(false);
  });

  it('records the webhook events it has seen', async () => {
    const count = await prisma.billingEvent.count({ where: { provider: 'paddle' } });
    expect(count).toBeGreaterThan(0);
  });
});

describe('checkout', () => {
  it('refuses when no provider is configured', async () => {
    // PADDLE_API_KEY / PADDLE_PRICE_ID are unset in the test environment.
    await auth(request(app.getHttpServer()).get('/api/billing/checkout')).expect(400);
  });
});

describe('cancelling from inside the app', () => {
  const future = () => new Date(Date.now() + 10 * 86_400_000);

  async function set(over: Partial<Parameters<BillingService['upsertFromProvider']>[0]> = {}) {
    await billing.upsertFromProvider({
      userId,
      provider: 'test',
      status: 'active',
      currentPeriodEnd: future(),
      cancelAtPeriodEnd: false,
      ...over,
    });
  }

  it('keeps the paid period and stops the renewal', async () => {
    await set();
    const res = await auth(request(app.getHttpServer()).post('/api/billing/cancel')).expect(200);
    expect(res.body.cancelAtPeriodEnd).toBe(true);
    // Cancelling ends the renewal, not the period already bought.
    expect(res.body.adFree).toBe(true);
  });

  it('ends a comped account now, since it has no period to run down', async () => {
    // The case that would otherwise set a flag meaning nothing and leave the
    // user entitled for good, having just been told they cancelled.
    await set({ currentPeriodEnd: null });
    const res = await auth(request(app.getHttpServer()).post('/api/billing/cancel')).expect(200);
    expect(res.body.adFree).toBe(false);
    expect(res.body.status).toBe('expired');
  });

  it('takes the cancellation back while the period is still running', async () => {
    await set({ cancelAtPeriodEnd: true });
    const res = await auth(request(app.getHttpServer()).post('/api/billing/resume')).expect(200);
    expect(res.body.cancelAtPeriodEnd).toBe(false);
    expect(res.body.adFree).toBe(true);
  });

  it('has nothing to resume once the period has passed', async () => {
    await set({ currentPeriodEnd: new Date(Date.now() - 1000), cancelAtPeriodEnd: true });
    await auth(request(app.getHttpServer()).post('/api/billing/resume')).expect(404);
  });

  it('has nothing to cancel when the subscription is already over', async () => {
    await set({ status: 'expired' });
    await auth(request(app.getHttpServer()).post('/api/billing/cancel')).expect(404);
  });

  it('reports nothing to cancel for an account that never subscribed', async () => {
    const fresh = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail('nosub'), password: 'password123' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/billing/cancel')
      .set('Authorization', `Bearer ${fresh.body.accessToken}`)
      .expect(404);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).post('/api/billing/cancel').expect(401);
    await request(app.getHttpServer()).post('/api/billing/resume').expect(401);
  });
});

describe('cancelling a provider-backed subscription', () => {
  const realFetch = globalThis.fetch;
  // Unique per run: providerSubscriptionId is globally unique, so a fixed id
  // collides with the row an earlier run of this suite left behind.
  const subId = `sub_cancel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let calls: { url: string; method: string; body: unknown }[];

  /** Stand in for Paddle, so the outbound call itself can be asserted. */
  function stubPaddle(respond: () => Response) {
    calls = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return respond();
    }) as typeof fetch;
  }

  beforeAll(() => {
    process.env.PADDLE_API_KEY = 'test-api-key';
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
    delete process.env.PADDLE_API_KEY;
  });

  async function paddleSub(cancelAtPeriodEnd = false) {
    await billing.upsertFromProvider({
      userId,
      provider: 'paddle',
      status: 'active',
      providerSubscriptionId: subId,
      currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000),
      cancelAtPeriodEnd,
    });
  }

  it('tells Paddle to stop at the end of the period, not immediately', async () => {
    stubPaddle(() => new Response('{}', { status: 200 }));
    await paddleSub();
    await auth(request(app.getHttpServer()).post('/api/billing/cancel')).expect(200);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`https://api.paddle.com/subscriptions/${subId}/cancel`);
    // Not `immediately`: that would prorate a refund nothing here reconciles.
    expect(calls[0]!.body).toEqual({ effective_from: 'next_billing_period' });
  });

  it('does not record a cancellation the provider refused', async () => {
    // The failure that matters: telling the user they cancelled while Paddle
    // still bills them next month.
    stubPaddle(() => new Response('rate limited', { status: 429 }));
    await paddleSub();
    await auth(request(app.getHttpServer()).post('/api/billing/cancel')).expect(500);

    const status = await auth(request(app.getHttpServer()).get('/api/billing/status')).expect(200);
    expect(status.body.cancelAtPeriodEnd).toBe(false);
  });

  it('accepts a subscription Paddle no longer has', async () => {
    // 404 means there is nothing left to cancel; refusing would leave the user
    // unable to complete a cancellation they are entitled to.
    stubPaddle(() => new Response('not found', { status: 404 }));
    await paddleSub();
    const res = await auth(request(app.getHttpServer()).post('/api/billing/cancel')).expect(200);
    expect(res.body.cancelAtPeriodEnd).toBe(true);
  });

  it('asks Paddle to drop the scheduled change on resume', async () => {
    stubPaddle(() => new Response('{}', { status: 200 }));
    await paddleSub(true);
    await auth(request(app.getHttpServer()).post('/api/billing/resume')).expect(200);

    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toBe(`https://api.paddle.com/subscriptions/${subId}`);
    expect(calls[0]!.body).toEqual({ scheduled_change: null });
  });
});
