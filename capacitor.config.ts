import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.FORCELOCAL12345',  // Changed ID to force new app
  appName: 'PicotinhoNOVO',  // Changed name
  webDir: 'dist',
  // ABSOLUTELY NO SERVER - FORCE LOCAL ONLY
  plugins: {
    Camera: {
      permissions: ['camera']
    },
    CapacitorHttp: {
      enabled: true
    },
    BarcodeScanning: {
      permissions: ['camera'],
      enableAutoZoom: true,
      showCameraPermissionDialog: true
    }
  },
  android: {
    adaptiveIcon: {
      foreground: 'resources/android/icon/foreground.png',
      background: '#FFFFFF'
    }
  },
  ios: {
    icon: 'resources/ios/icon/icon.png'
  }
};

export default config;