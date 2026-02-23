/**
 * Constantes globales de l'application ReputyBoard
 * 
 * ⚠️ NE PAS MODIFIER SANS RAISON ⚠️
 * Ces constantes définissent l'architecture multi-app
 */

// ============================================================
// URLS DES APPLICATIONS
// ============================================================

/**
 * URL du site web principal (reputy-web) - Port 3001
 * C'est le SEUL endroit où les clients peuvent :
 * - Se connecter (login)
 * - S'inscrire (signup)
 * - Voir les pages publiques
 */
export const REPUTY_WEB_URL = process.env.NEXT_PUBLIC_REPUTY_WEB_URL || 'http://localhost:3001'

/**
 * URL du backend API - Port 8787
 * Toutes les requêtes API passent par ce serveur
 */
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787'

// ============================================================
// FLUX D'AUTHENTIFICATION
// ============================================================

/**
 * URL de la page de connexion
 * TOUJOURS sur le site web (3001), jamais sur le dashboard (3002)
 */
export const LOGIN_URL = `${REPUTY_WEB_URL}/login`

/**
 * URL de la page d'inscription
 * TOUJOURS sur le site web (3001)
 */
export const SIGNUP_URL = `${REPUTY_WEB_URL}/signup`

/**
 * URL de redirection après déconnexion
 * Retour vers le site web principal
 */
export const LOGOUT_REDIRECT_URL = REPUTY_WEB_URL

// ============================================================
// CAPACITOR (APP MOBILE)
// ============================================================

/**
 * Détecte si l'app tourne dans le shell natif Capacitor (WebView iOS/Android).
 * Le bridge Capacitor est injecté automatiquement dans la WebView.
 * Sur le web classique, c'est toujours false → aucun impact.
 */
export const IS_CAPACITOR: boolean =
  typeof window !== 'undefined' &&
  !!(window as any).Capacitor?.isNativePlatform?.()

/**
 * Détecte iOS Capacitor spécifiquement.
 * Utilisé pour la compliance App Store (Guideline 3.1.1) :
 * masquer les CTA d'achat/upgrade dans l'app iOS.
 */
export const IS_IOS_CAPACITOR: boolean =
  typeof window !== 'undefined' &&
  !!(window as any).Capacitor?.isNativePlatform?.() &&
  (window as any).Capacitor?.getPlatform?.() === 'ios'
