/**
 * Point d'entrée natif Capacitor
 *
 * Phase A : shell charge l'URL distante (admin.reputyapp.com)
 * Phase B : deep links (@capacitor/app listener)
 * Phase C : push notifications (@capacitor/push-notifications) + bridge registration
 */

import { App } from '@capacitor/app'

/**
 * Normalise un deeplink vers admin.reputyapp.com.
 * V1 : seuls les liens vers admin.reputyapp.com sont acceptés.
 * reputyapp.com (login/signup) → return null → s'ouvre dans Safari/Chrome.
 */
function toAdminUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl)
    if (u.hostname !== 'admin.reputyapp.com') return null
    return u.href
  } catch {
    return null
  }
}

function navigateInWebView(url: string) {
  const adminUrl = toAdminUrl(url)
  if (!adminUrl) return
  // Navigation dans la WebView
  window.location.href = adminUrl
}

// App ouverte (foreground/background) via deeplink
App.addListener('appUrlOpen', (event) => {
  if (event?.url) navigateInWebView(event.url)
})

// Cold start via deeplink (selon plateforme/OS)
;(async () => {
  try {
    const launch = await App.getLaunchUrl()
    if (launch?.url) navigateInWebView(launch.url)
  } catch {
    // ignore — getLaunchUrl peut échouer sur certaines plateformes
  }
})()

console.log('[Reputy Mobile] Native bridge initialized — Phase B (deep links)')
