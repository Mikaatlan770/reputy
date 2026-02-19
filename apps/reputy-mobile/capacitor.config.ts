import type { CapacitorConfig } from '@capacitor/cli'

/**
 * ⚠️ DEV LOCAL — Pour la prod, remettre :
 *   url: 'https://admin.reputyapp.fr'
 *   cleartext: false
 *   allowNavigation: ['admin.reputyapp.fr', 'reputyapp.fr', 'api.reputyapp.fr']
 */
const DEV_IP = '192.168.0.14'

const config: CapacitorConfig = {
  appId: 'com.reputyapp.app',
  appName: 'Reputy',
  server: {
    // DEV: pointe vers le serveur Next.js local (reputy-admin :3002)
    url: `http://${DEV_IP}:3002`,
    cleartext: true, // nécessaire pour HTTP local

    allowNavigation: [
      // DEV: serveurs locaux
      `${DEV_IP}:3002`,   // reputy-admin
      `${DEV_IP}:3001`,   // reputy-web (login)
      `${DEV_IP}:8787`,   // backend API
      'localhost:3002',
      'localhost:3001',
      'localhost:8787',
      // PROD (gardé pour ne pas casser si on oublie de re-sync)
      'admin.reputyapp.fr',
      'reputyapp.fr',
      'api.reputyapp.fr',
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
    // WKWebView par défaut — OK pour Capacitor 6+
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
