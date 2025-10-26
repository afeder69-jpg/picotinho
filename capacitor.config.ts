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
    Browser: {
      androidCustomTabs: false,
      iosCustomTabs: false,
      presentationStyle: 'fullscreen'
    },
    FilePicker: {
      permissions: ['photos', 'camera']
    },
    BarcodeScanner: {
      enabled: true
    }
  },
  android: {
    webContentsDebuggingEnabled: true,
    allowMixedContent: false,
    overrideUserAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    backgroundColor: '#ffffff',
    allowNavigation: ['*'],
    appendUserAgent: ' Picotinho/1.0 NoCache/' + Date.now(),
    permissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.MANAGE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO'
    ],
    adaptiveIcon: {
      foreground: '/lovable-uploads/62443b56-2f57-4ca1-8797-db67febf5108.png',
      background: '#FFFFFF'
    }
  },
  ios: {
    contentInset: 'automatic',
    allowsInlineMediaPlayback: true,
    allowsBackForwardNavigationGestures: true,
    backgroundColor: '#ffffff',
    overrideUserAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    icon: '/lovable-uploads/62443b56-2f57-4ca1-8797-db67febf5108.png'
  }
};

export default config;