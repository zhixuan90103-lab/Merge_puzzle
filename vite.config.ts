import { defineConfig } from 'vite';

/**
 * base: './' is REQUIRED for Capacitor (capacitor:// / file:// asset loading).
 * Absolute /assets/... paths break inside the iOS WebView.
 */
export default defineConfig({
  base: './',
  server: {
    host: true,
    // 5190/5191 often taken by other shells; Merge_puzzle uses 5200
    port: 5200,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 5200,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  esbuild: {
    target: 'es2022',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
});
