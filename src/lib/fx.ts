import type { FxCache } from '../types'

const CACHE_KEY = 'pesowise.fx'
const MAX_AGE_MS = 30 * 60 * 1000 // refresh every 30 minutes

function readCache(): FxCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as FxCache) : null
  } catch {
    return null
  }
}

function writeCache(cache: FxCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // storage unavailable — live rate still returned for this call
  }
}

async function fetchFromErApi(): Promise<FxCache> {
  const res = await fetch('https://open.er-api.com/v6/latest/USD')
  if (!res.ok) throw new Error(`er-api ${res.status}`)
  const data = await res.json()
  const rate = data?.rates?.PHP
  if (typeof rate !== 'number') throw new Error('er-api: no PHP rate')
  return { usdToPhp: rate, fetchedAt: new Date().toISOString(), source: 'open.er-api.com' }
}

async function fetchFromFrankfurter(): Promise<FxCache> {
  const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=PHP')
  if (!res.ok) throw new Error(`frankfurter ${res.status}`)
  const data = await res.json()
  const rate = data?.rates?.PHP
  if (typeof rate !== 'number') throw new Error('frankfurter: no PHP rate')
  return { usdToPhp: rate, fetchedAt: new Date().toISOString(), source: 'frankfurter.dev' }
}

/**
 * Returns the live USD→PHP rate, using a 30-minute cache and two independent
 * providers. Falls back to the last known rate, then to `fallbackRate`.
 */
export async function getUsdToPhp(fallbackRate: number): Promise<FxCache> {
  const cached = readCache()
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < MAX_AGE_MS) {
    return cached
  }
  for (const provider of [fetchFromErApi, fetchFromFrankfurter]) {
    try {
      const fresh = await provider()
      writeCache(fresh)
      return fresh
    } catch {
      // try next provider
    }
  }
  if (cached) return { ...cached, source: `${cached.source} (stale)` }
  return { usdToPhp: fallbackRate, fetchedAt: new Date(0).toISOString(), source: 'fallback rate' }
}

/** Synchronous best-known rate for rendering before the async fetch lands. */
export function lastKnownUsdToPhp(fallbackRate: number): number {
  return readCache()?.usdToPhp ?? fallbackRate
}

/** User-entered rate: cached like a live fetch so the whole app uses it. */
export function setManualUsdToPhp(rate: number): FxCache {
  const cache: FxCache = { usdToPhp: rate, fetchedAt: new Date().toISOString(), source: 'manual' }
  writeCache(cache)
  return cache
}
