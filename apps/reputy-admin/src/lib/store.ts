import { create } from 'zustand'
import type { Location, User, OrgSettings, AiQuota, Membership } from '@/types'

interface AppState {
  // Current user
  currentUser: User | null
  setCurrentUser: (user: User | null) => void
  
  // Current location (mapped from membership for rétrocompat)
  currentLocation: Location | null
  setCurrentLocation: (location: Location | null) => void
  
  // All locations for the user (mapped from memberships for rétrocompat)
  userLocations: Location[]
  setUserLocations: (locations: Location[]) => void
  
  // PR-8c: Memberships (real data from backend)
  memberships: Membership[]
  setMemberships: (memberships: Membership[]) => void
  
  // Sidebar state
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  
  // Organization settings (AI, plan, etc.)
  orgSettings: OrgSettings | null
  setOrgSettings: (settings: OrgSettings | null) => void
  
  // Update AI quota
  updateAiQuota: (quota: Partial<AiQuota>) => void
  incrementAiUsage: () => void
  
  // Initialize (no longer loads mocks — data comes from auth-context via app-layout)
  initialize: () => void
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  
  currentLocation: null,
  setCurrentLocation: (location) => set({ currentLocation: location }),
  
  userLocations: [],
  setUserLocations: (locations) => set({ userLocations: locations }),
  
  memberships: [],
  setMemberships: (memberships) => set({ memberships }),
  
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  
  orgSettings: null,
  setOrgSettings: (settings) => set({ orgSettings: settings }),
  
  updateAiQuota: (quota) => set((state) => ({
    orgSettings: state.orgSettings 
      ? { 
          ...state.orgSettings, 
          aiQuota: { ...state.orgSettings.aiQuota, ...quota } 
        } 
      : null
  })),
  
  incrementAiUsage: () => set((state) => {
    if (!state.orgSettings) return {}
    return {
      orgSettings: {
        ...state.orgSettings,
        aiQuota: {
          ...state.orgSettings.aiQuota,
          usedThisMonth: state.orgSettings.aiQuota.usedThisMonth + 1,
        },
      },
    }
  }),
  
  // PR-8c: initialize no longer loads mocks.
  // Real data is hydrated from auth-context in app-layout.tsx useEffect.
  initialize: () => {
    // No-op: data comes from auth-context
  },
}))
