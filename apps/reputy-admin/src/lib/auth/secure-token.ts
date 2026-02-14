/**
 * Secure Token Storage
 *
 * - Capacitor (mobile) : Keychain iOS / Keystore Android via capacitor-secure-storage-plugin
 * - Web (navigateur)   : localStorage (fallback — pas de Keychain disponible)
 *
 * Clé par environnement (_prod / _staging) pour éviter les collisions
 * si on teste staging sur le même appareil.
 *
 * ⚠️ Toutes les fonctions sont async (le plugin Capacitor est async).
 */

import { IS_CAPACITOR } from '../constants'

// Clé unique par environnement
const ENV_SUFFIX = process.env.NEXT_PUBLIC_ENV === 'staging' ? '_staging' : '_prod'
const TOKEN_KEY = `reputy_client_token${ENV_SUFFIX}`

/**
 * Charge le plugin Capacitor dynamiquement.
 * Le commentaire webpackIgnore empêche Next.js / webpack de résoudre
 * le module au build time (il n'est disponible que dans le shell natif).
 */
async function getCapacitorPlugin() {
  // @ts-ignore — module disponible uniquement dans le shell Capacitor
  const mod = await import(/* webpackIgnore: true */ 'capacitor-secure-storage-plugin')
  return mod.SecureStoragePlugin
}

/**
 * Récupère le JWT depuis le stockage sécurisé.
 * Retourne null si aucun token n'est stocké.
 */
export async function getSecureToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null

  if (IS_CAPACITOR) {
    try {
      const plugin = await getCapacitorPlugin()
      const { value } = await plugin.get({ key: TOKEN_KEY })
      return value
    } catch {
      // Clé non trouvée ou plugin indisponible
      return null
    }
  }

  // Fallback web : localStorage
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * Stocke le JWT dans le stockage sécurisé.
 */
export async function setSecureToken(token: string): Promise<void> {
  if (typeof window === 'undefined') return

  if (IS_CAPACITOR) {
    const plugin = await getCapacitorPlugin()
    await plugin.set({ key: TOKEN_KEY, value: token })
    return
  }

  // Fallback web
  localStorage.setItem(TOKEN_KEY, token)
}

/**
 * Supprime le JWT du stockage sécurisé.
 * Appelé au logout — important car le Keychain iOS peut persister
 * après désinstallation de l'app.
 */
export async function removeSecureToken(): Promise<void> {
  if (typeof window === 'undefined') return

  if (IS_CAPACITOR) {
    try {
      const plugin = await getCapacitorPlugin()
      await plugin.remove({ key: TOKEN_KEY })
    } catch {
      // Clé peut ne pas exister — ignoré
    }
    return
  }

  // Fallback web
  localStorage.removeItem(TOKEN_KEY)
}
