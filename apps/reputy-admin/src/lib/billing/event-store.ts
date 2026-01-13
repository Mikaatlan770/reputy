export interface StoredEvent {
  eventId: string
  type: string
  created: number
  orgId?: string
  hash?: string
  processedAt: number
}

export interface EventStore {
  has(eventId: string): Promise<boolean>
  save(event: StoredEvent): Promise<void>
}

// In-memory fallback (dev)
class InMemoryEventStore implements EventStore {
  private store = new Set<string>()

  async has(eventId: string): Promise<boolean> {
    return this.store.has(eventId)
  }

  async save(event: StoredEvent): Promise<void> {
    this.store.add(event.eventId)
  }
}

export const eventStore: EventStore = new InMemoryEventStore()




