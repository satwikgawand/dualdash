import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.satwik.dualdash',
  appName: 'DualDash',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Geolocation: {
      // Permission strings are declared by the plugin in the Android manifest.
    },
    // System-UI policy (SPEC M1-O6): immersive in both modes. The built-in
    // SystemBars plugin hides status + navigation bars at start, styles them
    // dark with light icons (no white flash at night), and publishes correct
    // safe-area insets for edge-to-edge on Android 15 (targetSdk 36).
    SystemBars: {
      hidden: true,
      style: 'DARK',
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
