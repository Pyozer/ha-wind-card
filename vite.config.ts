/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig(({ mode }) => ({
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: true,
    cors: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: mode === 'development',
    minify: mode !== 'development',
    lib: {
      entry: 'src/live-wind-card.ts',
      formats: ['es'],
      fileName: () => 'live-wind-card.js',
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'html'],
      // Floors just under the current values, so coverage cannot silently drop. The pure modules
      // (maths, reading, history, chart, editor logic) are held to a higher bar than the DOM code.
      thresholds: {
        statements: 70,
        branches: 67,
        functions: 67,
        lines: 69,
        'src/{actions,chart,config,entities,history,reading,rose,streak-canvas,streaks,view,wind}.ts': {
          lines: 98,
          functions: 98,
        },
        'src/editor/{form,schema,validation}.ts': { lines: 98, functions: 98 },
        'src/localize/localize.ts': { lines: 98, functions: 98 },
      },
    },
  },
}));
