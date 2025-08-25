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
    }
  }
};

export default config;