import type { CapacitorConfig } from '@capacitor/cli';

// Mobile shells are production-first in Sprint 0. NEXT_PUBLIC_APP_URL allows
// staging builds, while the fallback keeps local `npx cap sync` deterministic.
// This file is intentionally touched here so that the Android Debug APK workflow
// triggers automatically on this PR (paths filter requires a watched file change).
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.meetyoulive.net';
const appHost = new URL(appUrl).hostname;
const webViewHosts = Array.from(new Set([appHost, 'meetyoulive.net', 'www.meetyoulive.net']));

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
    allowNavigation: webViewHosts,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
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
    SocialLogin: {
      // Google Sign-In on Android now goes through the native
      // MeetYouLiveGoogleAuth Capacitor plugin (Credential Manager +
      // GetSignInWithGoogleOption) instead of this plugin's Google provider.
      // Kept here (disabled) so Apple/Facebook/Twitter can still adopt this
      // plugin later without additional wiring.
      providers: {
        google: false,
        facebook: false,
        apple: false,
        twitter: false,
      },
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
