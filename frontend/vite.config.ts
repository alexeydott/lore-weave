/// <reference types="vitest/config" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        // VAD worklet + ONNX models
        { src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', dest: 'vad' },
        { src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx', dest: 'vad' },
        { src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx', dest: 'vad' },
        // ONNX Runtime WASM + MJS (required for WebAssembly initialization)
        { src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', dest: 'vad' },
        { src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', dest: 'vad' },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      // MED-8 single-domain: serve the game client under /game on THIS origin.
      // Not a convenience — localStorage is partitioned per origin, so this is
      // what lets a session (`lw_auth`) and a language (`lw_language`) chosen
      // here carry into the game with no code shared between the two apps.
      // Mirrors the prod `location /game/` block in frontend/nginx.conf.
      // `ws: true` forwards vite's HMR socket so the game still hot-reloads.
      '/game': {
        target: 'http://localhost:5176',
        changeOrigin: false,
        ws: true,
      },
      '/v1': {
        target: 'http://localhost:3123',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3123',
        ws: true,
        changeOrigin: true,
      },
      '/languagetool': {
        target: 'http://localhost:8875',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/languagetool/, ''),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    // vite 8 = rolldown: function-form `manualChunks` is deprecated (and the
    // rollup object form is unsupported) — the canonical seam is
    // `rolldownOptions.output.codeSplitting.groups`. Declaration order +
    // priority preserve the old first-match-wins: a module is claimed by the
    // first group whose `test` matches, and everything else (app code, `src/`)
    // falls back to automatic chunking exactly like the old `return undefined`.
    // Regexes use [\\/] so the graph is identical on POSIX and Windows IDs.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // Keep resources synchronous, but emit each locale/namespace separately.
              name: (id: string) => {
                const locale = id.match(/\/i18n\/locales\/([^/]+)\/([^/]+)\.json$/);
                return locale ? `locale-${locale[1]}-${locale[2]}` : null;
              },
              test: /\/i18n\/locales\/[^/]+\/[^/]+\.json$/,
              priority: 10,
            },
            {
              // uiLanguage accesses the initializer lazily for isolated consumers/tests.
              // Keep that singleton in a real shared boundary rather than folding it into App.
              name: 'i18n',
              test: /\/src\/i18n\/index\.ts$/,
              priority: 9,
            },
            {
              // Group dependency families, not individual entry points: splitting shared
              // internals across chunks can introduce circular chunk dependencies.
              name: 'vendor-editor',
              test: /\/(?:@tiptap|prosemirror-[^/]+|orderedmap|rope-sequence|w3c-keyname)\//,
              priority: 1,
            },
            { name: 'vendor-codemirror', test: /\/(?:@codemirror|@lezer|codemirror|@uiw)\//, priority: 1 },
            { name: 'vendor-dockview', test: /\/dockview[^/]*\//, priority: 1 },
            { name: 'vendor-charts', test: /\/(?:recharts|recharts-scale|d3-[^/]+|victory-vendor)\//, priority: 1 },
            { name: 'vendor-graph', test: /\/(?:reactflow|@reactflow|@xyflow)\//, priority: 1 },
            { name: 'vendor-onnx', test: /\/onnxruntime[^/]*\//, priority: 1 },
            {
              name: 'vendor-react',
              test: /\/node_modules\/(?:react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//,
              priority: 1,
            },
            { name: 'vendor-query', test: /\/@tanstack\//, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // codemirror-json-schema's ESM dist uses extensionless relative imports — node's resolver
    // (vitest external deps) chokes; inlining lets vite's resolver handle it (build/dev already do).
    server: { deps: { inline: ['codemirror-json-schema'] } },
    // Unit tests only. Playwright e2e specs live under tests/e2e and run via
    // their own runner — excluding them keeps vitest fast and its output clean
    // (they otherwise get swept in as "0 test" files).
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'tests/e2e/**', '**/*.spec.ts'],
  },
});
