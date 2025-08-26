import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.b5ea6089d5bc4939b83e6c590c392e34',
  appName: 'Picotinho',
  webDir: 'dist',
  server: {
    url: 'https://b5ea6089-d5bc-4939-b83e-6c590c392e34.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    Camera: {
      permissions: ['camera']
    },
    CapacitorHttp: {
      enabled: true
    },
    BarcodeScanning: {
      permissions: ['camera']
    },
    Browser: {
      androidCustomTabs: true,
      iosCustomTabs: true
    }
  },
  android: {
    webContentsDebuggingEnabled: true,
    allowMixedContent: true,
    overrideUserAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    backgroundColor: '#ffffff',
    allowNavigation: ['*'],
    adaptiveIcon: {
      foreground: '/lovable-uploads/d0696503-d278-461c-8618-c676ca4fcfb7.png',
      background: '#FFFFFF'
    }
  },
  ios: {
    contentInset: 'automatic',
    allowsInlineMediaPlayback: true,
    allowsBackForwardNavigationGestures: true,
    backgroundColor: '#ffffff',
    overrideUserAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    icon: '/lovable-uploads/d0696503-d278-461c-8618-c676ca4fcfb7.png'
  }
};

export default config;