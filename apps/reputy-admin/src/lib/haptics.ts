/**
 * Haptics wrapper — feedback tactile natif sur iOS/Android.
 *
 * ⚠️ Zéro import statique de @capacitor/haptics.
 * Utilise new Function() pour cacher l'import du bundler Next.js.
 * Voir secure-token.ts pour le même pattern.
 *
 * En web (IS_CAPACITOR === false), les fonctions sont des no-op silencieux.
 */

import { IS_CAPACITOR } from '@/lib/constants'

type ImpactStyle = 'light' | 'medium' | 'heavy'

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

const ALLOWED_MODULES = new Set(['@capacitor/haptics'])

/**
 * Import dynamique invisible à webpack/Next.js.
 * Le module n'est chargé QUE au runtime, dans le shell natif Capacitor.
 * Whitelist stricte pour éviter l'injection de code arbitraire.
 */
async function dynamicImport(specifier: string): Promise<any> {
  if (!ALLOWED_MODULES.has(specifier)) {
    throw new Error(`Module "${specifier}" not in allowlist`)
  }
  // eslint-disable-next-line no-new-func
  const importer = new Function('s', 'return import(s)')
  return importer(specifier)
}

/**
 * Déclenche un feedback haptique (vibration courte).
 * No-op silencieux en web ou si le plugin n'est pas disponible.
 *
 * Usage :
 *   await hapticImpact('light')  // pull-to-refresh
 *   await hapticImpact('medium') // action importante
 */
export async function hapticImpact(style: ImpactStyle = 'light'): Promise<void> {
  if (!isBrowser()) return
  if (!IS_CAPACITOR) return

  try {
    const mod = await dynamicImport('@capacitor/haptics')
    const Haptics = mod?.Haptics
    const ImpactStyleEnum = mod?.ImpactStyle
    if (!Haptics || !ImpactStyleEnum) return

    const map: Record<ImpactStyle, any> = {
      light: ImpactStyleEnum.Light,
      medium: ImpactStyleEnum.Medium,
      heavy: ImpactStyleEnum.Heavy,
    }

    await Haptics.impact({ style: map[style] })
  } catch {
    // Plugin non dispo ou erreur — silencieux
  }
}

/**
 * Notification haptique (succès/erreur/warning).
 * Utilisé pour les confirmations d'action (archiver, répondre, etc.)
 */
export async function hapticNotification(
  type: 'success' | 'warning' | 'error' = 'success'
): Promise<void> {
  if (!isBrowser()) return
  if (!IS_CAPACITOR) return

  try {
    const mod = await dynamicImport('@capacitor/haptics')
    const Haptics = mod?.Haptics
    const NotificationType = mod?.NotificationType
    if (!Haptics || !NotificationType) return

    const map: Record<string, any> = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error,
    }

    await Haptics.notification({ type: map[type] })
  } catch {
    // silencieux
  }
}
