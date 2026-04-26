import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.meetyoulive.app',
  appName: 'MeetYouLive',
  // Static export output directory (used when building locally with `next build`)
  webDir: 'out',
  server: {
    // Load the live production web app instead of a local static bundle.
    // Remove this block (or set to undefined) if you want to ship a fully
    // self-contained static build instead.
    url: 'https://meetyoulive.net',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0f0821',
      showSpinner: false,
      androidSpinnerStyle: 'small',
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    // Allow the WebView to load content from the server URL over HTTPS
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;
