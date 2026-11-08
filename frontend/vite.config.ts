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
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep resources synchronous, but emit each locale/namespace separately.
          const locale = id.match(/\/i18n\/locales\/([^/]+)\/([^/]+)\.json$/);
          if (locale) return `locale-${locale[1]}-${locale[2]}`;
          // uiLanguage accesses the initializer lazily for isolated consumers/tests.
          // Keep that singleton in a real shared boundary rather than folding it into App.
          if (id.endsWith('/src/i18n/index.ts')) return 'i18n';
          if (!id.includes('/node_modules/')) return;
          // Group dependency families, not individual entry points: splitting shared
          // internals across chunks can introduce circular chunk dependencies.
          if (/\/(?:@tiptap|prosemirror-[^/]+|orderedmap|rope-sequence|w3c-keyname)\//.test(id)) return 'vendor-editor';
          if (/\/(?:@codemirror|@lezer|codemirror|@uiw)\//.test(id)) return 'vendor-codemirror';
          if (/\/dockview[^/]*\//.test(id)) return 'vendor-dockview';
          if (/\/(?:recharts|recharts-scale|d3-[^/]+|victory-vendor)\//.test(id)) return 'vendor-charts';
          if (/\/(?:reactflow|@reactflow|@xyflow)\//.test(id)) return 'vendor-graph';
          if (/\/onnxruntime[^/]*\//.test(id)) return 'vendor-onnx';
          if (/\/node_modules\/(?:react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id)) return 'vendor-react';
          if (id.includes('/@tanstack/')) return 'vendor-query';
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
