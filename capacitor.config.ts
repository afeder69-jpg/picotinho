import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.b5ea6089d5bc4939b83e6c590c392e34',
  appName: 'Picotinho',
  webDir: 'dist',
  // Remove server config for production builds
  // server: {
  //   url: 'https://b5ea6089-d5bc-4939-b83e-6c590c392e34.lovableproject.com?forceHideBadge=true',
  //   cleartext: true
  // },
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