import type { CapacitorConfig } from '@capacitor/cli';

/**
 * iOS portrait game shell:
 * - contentInset never → Safe Area only via CSS env() / --safe-*
 * - base './' on Vite → relative assets for offline WebView
 */
const config: CapacitorConfig = {
  // Unique — do not reuse portrait-webgpu-base / com.example.* from other shells
  appId: 'lab.zhixuan.mergepuzzle',
  appName: 'Merge Puzzle',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    backgroundColor: '#74b7ea',
    scrollEnabled: false,
  },
};

export default config;
