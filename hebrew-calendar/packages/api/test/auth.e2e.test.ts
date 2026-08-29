import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, uniqueEmail } from './setup';

let app: INestApplication;

beforeAll(async () => {
  ({ app } = await createTestApp());
});
afterAll(async () => {
  await app?.close();
});

const server = () => request(app.getHttpServer());

async function registerUser(email = uniqueEmail('auth')) {
  const res = await server().post('/api/auth/register').send({ email, password: 'password123' }).expect(201);
  return { email, ...res.body };
}

describe('auth', () => {
  it('registers a user and returns a token pair', async () => {
    const body = await registerUser();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.email).toContain('@example.test');
  });

  it('rejects a duplicate registration', async () => {
    const { email } = await registerUser();
    await server().post('/api/auth/register').send({ email, password: 'password123' }).expect(409);
  });

  it('rejects a weak password', async () => {
    await server().post('/api/auth/register').send({ email: uniqueEmail(), password: 'short' }).expect(400);
  });

  it('signs in with the right password and refuses the wrong one', async () => {
    const { email } = await registerUser();
    await server().post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    await server().post('/api/auth/login').send({ email, password: 'not-the-password' }).expect(401);
  });

  // The regression this suite exists for: with whitelist:true and no
  // validation decorator, refreshToken was stripped and every refresh failed.
  it('exchanges a valid refresh token for a new pair', async () => {
    const { refreshToken } = await registerUser();
    const res = await server().post('/api/auth/refresh').send({ refreshToken }).expect(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it('rejects reuse of a rotated refresh token and revokes the family', async () => {
    const { refreshToken } = await registerUser();
    const rotated = (await server().post('/api/auth/refresh').send({ refreshToken }).expect(201)).body.refreshToken;
    // Replaying the old token signals a leak.
    await server().post('/api/auth/refresh').send({ refreshToken }).expect(401);
    // ...so the token issued from it is revoked too.
    await server().post('/api/auth/refresh').send({ refreshToken: rotated }).expect(401);
  });

  it('rejects a refresh token that was never issued', async () => {
    await server().post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' }).expect(401);
  });

  it('revokes a session on logout', async () => {
    const { refreshToken } = await registerUser();
    await server().post('/api/auth/logout').send({ refreshToken }).expect(200);
    await server().post('/api/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('requires a bearer token for protected routes', async () => {
    await server().get('/api/calendars').expect(401);
    await server().get('/api/calendars').set('Authorization', 'Bearer nonsense').expect(401);
  });
});

describe('health', () => {
  it('reports liveness and readiness', async () => {
    await server().get('/api/health').expect(200);
    const ready = await server().get('/api/health/ready').expect(200);
    expect(ready.body.database).toBe('up');
  });
});
