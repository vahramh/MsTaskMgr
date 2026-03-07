type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  lastAccessedAt: number;
};

export class MemoryTtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number
  ) {}

  get(key: string): T | undefined {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return undefined;
    }

    entry.lastAccessedAt = now;
    return entry.value;
  }

  set(key: string, value: T): void {
    const now = Date.now();

    this.evictExpired(now);

    if (this.store.size >= this.maxEntries) {
      this.evictLeastRecentlyUsed();
    }

    this.store.set(key, {
      value,
      expiresAt: now + this.ttlMs,
      lastAccessedAt: now,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  private evictExpired(now: number): void {
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | undefined;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.store.entries()) {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }
}