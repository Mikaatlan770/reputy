import type { CapacitorConfig } from '@capacitor/cli'

const IS_DEV = process.env.CAP_ENV === 'dev'

const config: CapacitorConfig = {
  appId: 'com.reputyapp.app',
  appName: 'Reputy',
  server: IS_DEV
    ? {
        // Simulateur iOS : localhost pointe vers le Mac directement
        url: 'http://localhost:3002',
        cleartext: true,
        allowNavigation: [
          'localhost:3002',
          'localhost:3001',
          'localhost:8787',
          '127.0.0.1:3002',
          '127.0.0.1:3001',
          '127.0.0.1:8787',
        ],
      }
    : {
        url: 'https://admin.reputyapp.com',
        cleartext: false,
        allowNavigation: [
          'admin.reputyapp.com',
          'reputyapp.com',
          'api.reputyapp.com',
        ],
      },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#242c34',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
    },
  },
  ios: {
    scheme: 'Reputy',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
