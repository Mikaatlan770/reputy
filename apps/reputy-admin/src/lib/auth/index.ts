/**
 * Auth module exports
 * 
 * Usage:
 * - Wrap your app with <AuthProvider>
 * - Use useAuth() to get auth state and actions
 * - Use useIsClient() / useIsSuperAdmin() for role checks
 * - Use authedFetch() for API calls with auto 401 handling
 * - Use getSecureToken() / setSecureToken() / removeSecureToken() for direct token access
 */

export {
  AuthProvider,
  useAuth,
  useIsClient,
  useIsSuperAdmin,
  useClientOrg,
  type AuthMode,
  type AuthState,
  type AuthContextValue,
  type ClientUser,
  type ClientOrg,
} from './auth-context'

// Secure token storage (Keychain/Keystore on mobile, localStorage on web)
export { getSecureToken, setSecureToken, removeSecureToken } from './secure-token'

// Authenticated fetch wrapper (anti-boucle 401 + mutex)
export { authedFetch } from './authed-fetch'

// Re-export multi-establishment types from @/types for convenience
export type { Membership, OrgSummary, TeamMember, MembershipRole } from '@/types'
