/**
 * Auth module exports
 * 
 * Usage:
 * - Wrap your app with <AuthProvider>
 * - Use useAuth() to get auth state and actions
 * - Use useIsClient() / useIsSuperAdmin() for role checks
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

// Re-export multi-establishment types from @/types for convenience
export type { Membership, OrgSummary, TeamMember, MembershipRole } from '@/types'
