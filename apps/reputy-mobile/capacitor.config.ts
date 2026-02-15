import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.reputyapp.app',
  appName: 'Reputy',
  server: {
    // Point d'entrée : le dashboard admin
    // Si pas de token → redirect auto vers reputyapp.fr/login
    // Si token valide → dashboard affiché directement
    url: 'https://admin.reputyapp.fr',
    cleartext: false,

    // SECURITE: whitelist stricte — PAS de wildcard
    // Toute URL hors liste s'ouvre dans le navigateur externe (Safari/Chrome)
    allowNavigation: [
      'admin.reputyapp.fr',   // Dashboard (reputy-admin)
      'reputyapp.fr',          // Login / signup (reputy-web)
      'api.reputyapp.fr',      // Backend API
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
