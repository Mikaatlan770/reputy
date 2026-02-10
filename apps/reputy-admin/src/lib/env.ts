/**
 * Détection d'environnement centralisée.
 *
 * IS_PRODUCTION
 *   true dès que NODE_ENV === 'production'
 *   (inclut le build ET le runtime)
 *
 * IS_RUNTIME_PRODUCTION
 *   true UNIQUEMENT quand le code tourne en runtime production
 *   (serveur Node / Edge). False pendant `next build`, false en dev.
 *
 * ⚠️ Utiliser IS_RUNTIME_PRODUCTION (et non IS_PRODUCTION) pour tout
 * fail-fast qui ne doit PAS se déclencher au build-time.
 */

export const IS_PRODUCTION = process.env.NODE_ENV === 'production'

export const IS_RUNTIME_PRODUCTION =
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build'
