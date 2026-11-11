import { defineConfig } from 'vitest/config';

// base is relative so the build can be served from any sub-path of GitHub
// Pages.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
