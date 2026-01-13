export interface OrgStore {
  getOrgIdByCustomer(customerId: string): Promise<string | null>
  linkCustomerToOrg(customerId: string, orgId: string): Promise<void>
}

// In-memory mapping (dev)
class InMemoryOrgStore implements OrgStore {
  private map = new Map<string, string>() // customerId -> orgId

  async getOrgIdByCustomer(customerId: string): Promise<string | null> {
    return this.map.get(customerId) || null
  }

  async linkCustomerToOrg(customerId: string, orgId: string): Promise<void> {
    this.map.set(customerId, orgId)
  }
}

export const orgStore: OrgStore = new InMemoryOrgStore()




