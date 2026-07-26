import type { CapacitorConfig } from '@capacitor/cli';

// Mobile shells are production-first in Sprint 0. NEXT_PUBLIC_APP_URL allows
// staging builds, while the fallback keeps local `npx cap sync` deterministic.
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://meetyoulive.net';

const config: CapacitorConfig = {
  appId: 'com.meetyoulive.app',
  appName: 'MeetYouLive',
  // Capacitor still requires a webDir during sync. The native shells load the
  // production Next.js app through server.url, so public assets are sufficient.
  webDir: 'public',
  server: {
    // Load the live production web app instead of a local static bundle.
    // Remove this block (or set to undefined) if you want to ship a fully
    // self-contained static build instead.
    url: appUrl,
    cleartext: false,
  },
  plugins: {
    App: {
      launchUrl: appUrl,
    },
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 1200,
      backgroundColor: '#0f0821',
      showSpinner: false,
      androidSpinnerStyle: 'small',
      splashFullScreen: false,
      splashImmersive: false,
      layoutName: 'launch_screen',
      useDialog: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f0821',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
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
    scheme: 'MeetYouLive',
  },
};

export default config;
