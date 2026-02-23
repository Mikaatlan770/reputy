import type { CapacitorConfig } from '@capacitor/cli'

const IS_DEV = process.env.CAP_ENV === 'dev'
const DEV_IP = '192.168.0.14'

const config: CapacitorConfig = {
  appId: 'com.reputyapp.app',
  appName: 'Reputy',
  server: IS_DEV
    ? {
        url: `http://${DEV_IP}:3002`,
        cleartext: true,
        allowNavigation: [
          `${DEV_IP}:3002`,
          `${DEV_IP}:3001`,
          `${DEV_IP}:8787`,
          'localhost:3002',
          'localhost:3001',
          'localhost:8787',
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
