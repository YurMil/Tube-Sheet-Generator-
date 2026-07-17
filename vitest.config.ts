import {defineConfig} from 'vitest/config';

// Unit tests here are pure (geometry + transforms), so the default node
// environment is enough — no jsdom, no React plugin needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
