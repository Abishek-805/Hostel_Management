type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  dayKey: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheStore = new Map<string, CacheEntry<unknown>>();

function getDayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function readMealCountCache<T>(key: string): T | null {
  const entry = cacheStore.get(key);
  if (!entry) {
    return null;
  }

  const now = Date.now();
  const todayKey = getDayKey();
  if (entry.expiresAt <= now || entry.dayKey !== todayKey) {
    cacheStore.delete(key);
    return null;
  }

  return entry.value as T;
}

export function writeMealCountCache<T>(key: string, value: T): void {
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
    dayKey: getDayKey(),
  });
}

export function invalidateMealCountCache(): void {
  cacheStore.clear();
}
