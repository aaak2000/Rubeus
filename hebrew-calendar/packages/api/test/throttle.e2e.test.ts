import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The auth limit is read when the controller class is defined, so it has to be
// set before the module graph is imported. Other suites raise it to stay out of
// their own way; this one pins it low and proves the limiter still bites.
process.env.AUTH_RATE_LIMIT = '3';

let app: INestApplication;

beforeAll(async () => {
  const { createTestApp } = await import('./setup');
  ({ app } = await createTestApp());
});
afterAll(async () => {
  await app?.close();
});

describe('brute-force protection', () => {
  it('rejects credential attempts beyond the configured limit', async () => {
    const server = () => request(app.getHttpServer());
    const attempt = () =>
      server()
        .post('/api/auth/login')
        .send({ email: 'nobody@example.test', password: 'wrong-password' });

    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await attempt()).status);

    // The first few are ordinary auth failures...
    expect(statuses.slice(0, 3).every((s) => s === 401)).toBe(true);
    // ...after which the limiter takes over.
    expect(statuses.slice(3).every((s) => s === 429)).toBe(true);
  });

  it('does not throttle health probes', async () => {
    for (let i = 0; i < 8; i++) {
      await request(app.getHttpServer()).get('/api/health').expect(200);
    }
  });
});
