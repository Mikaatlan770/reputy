import { create } from 'zustand'
import type { Location, User, OrgSettings, AiQuota } from '@/types'
import { locations, users } from './mock-data'

// ===== MOCK ORG SETTINGS =====
const mockOrgSettings: OrgSettings = {
  id: 'org-1',
  name: 'Cabinet Dr. Atlan',
  plan: 'pro',
  aiEnabled: true,
  aiQuota: {
    monthlyLimit: 100,
    usedThisMonth: 23,
    resetDate: '2026-02-01',
  },
  healthModeDefault: true,
  createdAt: '2024-01-15',
}

interface AppState {
  // Current user
  currentUser: User | null
  setCurrentUser: (user: User | null) => void
  
  // Current location
  currentLocation: Location | null
  setCurrentLocation: (location: Location | null) => void
  
  // All locations for the user
  userLocations: Location[]
  setUserLocations: (locations: Location[]) => void
  
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
  
  // Initialize
  initialize: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  
  currentLocation: null,
  setCurrentLocation: (location) => set({ currentLocation: location }),
  
  userLocations: [],
  setUserLocations: (locations) => set({ userLocations: locations }),
  
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
  
  initialize: () => {
    // Mock: set first user and their locations
    const user = users[0]
    const userLocs = locations.filter((l) => user.locationIds.includes(l.id))
    set({
      currentUser: user,
      userLocations: userLocs,
      currentLocation: userLocs[0] || null,
      orgSettings: mockOrgSettings,
    })
  },
}))
