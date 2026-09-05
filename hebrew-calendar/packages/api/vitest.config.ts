import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one database; running files in parallel would
    // let the auth rate-limit and unique constraints interfere across suites.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // These suites register many accounts in seconds; the production
    // brute-force limit would reject them. The limiter itself is exercised
    // separately rather than by every test that needs a fresh user.
    env: { AUTH_RATE_LIMIT: '1000' },
  },
  // Vitest's default esbuild transform drops `emitDecoratorMetadata`, so Nest
  // cannot resolve constructor parameter types and dependency injection fails.
  // SWC emits the metadata the container needs.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
