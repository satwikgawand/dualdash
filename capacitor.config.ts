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
  },
};

export default config;
