import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, uniqueEmail } from './setup';

let app: INestApplication;
let prisma: PrismaService;

const server = () => request(app.getHttpServer());
const realFetch = globalThis.fetch;

/**
 * Stand in for Google's token and userinfo endpoints.
 *
 * Only these two are stubbed; everything from the state check inward is the
 * real code, so what the tests exercise is our account resolution rather than
 * a mock of it.
 */
function stubGoogle(profile: Record<string, unknown> | null, tokenOk = true) {
  globalThis.fetch = (async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes('oauth2.googleapis.com/token')) {
      return tokenOk
        ? new Response(JSON.stringify({ access_token: 'stub-access-token' }), { status: 200 })
        : new Response('nope', { status: 400 });
    }
    if (href.includes('openidconnect.googleapis.com/v1/userinfo')) {
      return profile
        ? new Response(JSON.stringify(profile), { status: 200 })
        : new Response('nope', { status: 401 });
    }
    throw new Error(`unexpected fetch to ${href}`);
  }) as typeof fetch;
}

/**
 * A state token the real verifier accepts.
 *
 * Taken from the real start endpoint rather than signed here, so the test does
 * not carry its own copy of how state is made — and the two staying in step is
 * itself part of what is under test.
 */
async function validState(): Promise<string> {
  const res = await server().get('/api/auth/google/url').expect(200);
  const state = new URL(res.body.url).searchParams.get('state');
  if (!state) throw new Error('no state in the authorization URL');
  return state;
}

/** Walk the callback and hand back the one-time code it redirects with. */
async function callback(state?: string): Promise<string> {
  const res = await server()
    .get('/api/auth/google/callback')
    .query({ code: 'google-auth-code', state: state ?? (await validState()) })
    .expect(302);
  const location = res.headers.location as string;
  const url = new URL(location, 'http://localhost');
  const code = url.searchParams.get('code');
  if (!code) throw new Error(`no code in redirect: ${location}`);
  return code;
}

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_SIGNIN_REDIRECT_URI = 'http://localhost:3001/api/auth/google/callback';
  ({ app, prisma } = await createTestApp());
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
afterAll(async () => {
  globalThis.fetch = realFetch;
  for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_SIGNIN_REDIRECT_URI']) {
    delete process.env[k];
  }
  await app?.close();
});

describe('what the login page is told', () => {
  it('reports Google as available when it is configured', async () => {
    const res = await server().get('/api/auth/methods').expect(200);
    expect(res.body).toEqual({ password: true, google: true });
  });

  it('reports it unavailable when it is not', async () => {
    const saved = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_SECRET;
    try {
      const res = await server().get('/api/auth/methods').expect(200);
      expect(res.body.google).toBe(false);
      // And the start endpoint refuses rather than building a broken URL.
      await server().get('/api/auth/google/url').expect(400);
    } finally {
      process.env.GOOGLE_CLIENT_SECRET = saved;
    }
  });

  it('asks Google only for sign-in scopes, never the calendar', async () => {
    const res = await server().get('/api/auth/google/url').expect(200);
    const url = new URL(res.body.url);
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    // The calendar scope is what needs the long review; sign-in must not drag
    // the app into it.
    expect(res.body.url).not.toContain('auth/calendar');
    expect(url.searchParams.get('state')).toBeTruthy();
  });
});

describe('signing in with Google', () => {
  it('creates an account for a Google user we have not seen', async () => {
    const email = uniqueEmail('gnew');
    stubGoogle({ sub: `sub-${Date.now()}`, email, email_verified: true, name: 'ישראל ישראלי' });

    const res = await server()
      .post('/api/auth/google/exchange')
      .send({ code: await callback() })
      .expect(200);

    expect(res.body.user.email).toBe(email);
    expect(res.body.user.displayName).toBe('ישראל ישראלי');
    expect(res.body.accessToken).toBeTruthy();

    // The account works like any other, and has no password to guess.
    const me = await server()
      .get('/api/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(email);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.passwordHash).toBeNull();
    // And it starts with a calendar, exactly as a registered account does.
    expect(await prisma.calendar.count({ where: { userId: user?.id } })).toBe(1);
  });

  it('signs the same person back in rather than making a second account', async () => {
    const sub = `sub-repeat-${Date.now()}`;
    const email = uniqueEmail('grepeat');
    stubGoogle({ sub, email, email_verified: true });
    const first = await server()
      .post('/api/auth/google/exchange')
      .send({ code: await callback() })
      .expect(200);

    // Same Google account, different address: people change their email, and
    // the subject id is what identifies them.
    stubGoogle({ sub, email: uniqueEmail('gmoved'), email_verified: true });
    const second = await server()
      .post('/api/auth/google/exchange')
      .send({ code: await callback() })
      .expect(200);

    expect(second.body.user.id).toBe(first.body.user.id);
    expect(await prisma.authIdentity.count({ where: { providerAccountId: sub } })).toBe(1);
  });

  it('links to an existing password account when Google verified the address', async () => {
    const email = uniqueEmail('glink');
    const registered = await server()
      .post('/api/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);

    stubGoogle({ sub: `sub-link-${Date.now()}`, email, email_verified: true });
    const res = await server()
      .post('/api/auth/google/exchange')
      .send({ code: await callback() })
      .expect(200);

    expect(res.body.user.id).toBe(registered.body.user.id);
    // Linking must not cost them the password they already had.
    await server().post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
  });

  it('refuses to link an address Google has not verified', async () => {
    // The takeover: anyone who can get a provider to assert an address they
    // do not own would otherwise inherit the account behind it.
    const email = uniqueEmail('gunverified');
    await server().post('/api/auth/register').send({ email, password: 'password123' }).expect(201);

    stubGoogle({ sub: `sub-unver-${Date.now()}`, email, email_verified: false });
    const res = await server()
      .get('/api/auth/google/callback')
      .query({ code: 'google-auth-code', state: await validState() })
      .expect(302);
    expect(res.headers.location).toContain('/login?error=google');
    expect(await prisma.authIdentity.count({ where: { email } })).toBe(0);
  });

  it('refuses a profile with no address at all', async () => {
    stubGoogle({ sub: `sub-noemail-${Date.now()}` });
    const res = await server()
      .get('/api/auth/google/callback')
      .query({ code: 'google-auth-code', state: await validState() })
      .expect(302);
    expect(res.headers.location).toContain('/login?error=google');
  });
});

describe('the one-time code', () => {
  it('cannot be spent twice', async () => {
    stubGoogle({
      sub: `sub-once-${Date.now()}`,
      email: uniqueEmail('gonce'),
      email_verified: true,
    });
    const code = await callback();
    await server().post('/api/auth/google/exchange').send({ code }).expect(200);
    // A code left in browser history is worth nothing on the second attempt.
    await server().post('/api/auth/google/exchange').send({ code }).expect(401);
  });

  it('is refused once it has expired', async () => {
    stubGoogle({ sub: `sub-exp-${Date.now()}`, email: uniqueEmail('gexp'), email_verified: true });
    const code = await callback();
    // Age it past the two-minute window without waiting for one.
    await prisma.loginCode.updateMany({
      where: { usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await server().post('/api/auth/google/exchange').send({ code }).expect(401);
  });

  it('refuses a code nobody issued', async () => {
    await server().post('/api/auth/google/exchange').send({ code: 'made-up' }).expect(401);
  });
});

describe('the callback itself', () => {
  it('rejects a forged state', async () => {
    stubGoogle({ sub: 'sub-forged', email: uniqueEmail('gforged'), email_verified: true });
    const res = await server()
      .get('/api/auth/google/callback')
      .query({ code: 'google-auth-code', state: 'not-a-real-state' })
      .expect(302);
    expect(res.headers.location).toContain('/login?error=google');
  });

  it('sends someone who declined back to the login page', async () => {
    const res = await server()
      .get('/api/auth/google/callback')
      .query({ error: 'access_denied' })
      .expect(302);
    expect(res.headers.location).toContain('/login?error=google');
  });

  it('does not leak a token pair in the redirect URL', async () => {
    stubGoogle({
      sub: `sub-leak-${Date.now()}`,
      email: uniqueEmail('gleak'),
      email_verified: true,
    });
    const res = await server()
      .get('/api/auth/google/callback')
      .query({ code: 'google-auth-code', state: await validState() })
      .expect(302);
    const location = res.headers.location as string;
    expect(location).not.toMatch(/refreshToken|accessToken/);
  });
});
