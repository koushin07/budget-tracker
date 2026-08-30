import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppState } from '../types'

export interface SupabaseConfig {
  url: string
  anonKey: string
}

const CONFIG_KEY = 'pesowise.supabase'

export function getSupabaseConfig(): SupabaseConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SupabaseConfig
    return parsed.url && parsed.anonKey ? parsed : null
  } catch {
    return null
  }
}

export function saveSupabaseConfig(config: SupabaseConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  resetClient()
}

export function clearSupabaseConfig() {
  localStorage.removeItem(CONFIG_KEY)
  resetClient()
}

let client: SupabaseClient | null = null

export function getClient(): SupabaseClient | null {
  if (client) return client
  const config = getSupabaseConfig()
  if (!config) return null
  client = createClient(config.url, config.anonKey)
  return client
}

export function resetClient() {
  client = null
}

export interface CloudBudget {
  data: AppState
  updated_at: string
}

/** The user's single cloud row, or null when none exists yet. */
export async function pullBudget(sb: SupabaseClient, userId: string): Promise<CloudBudget | null> {
  const { data, error } = await sb.from('budgets').select('data, updated_at').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { data: data.data as AppState, updated_at: data.updated_at as string } : null
}

/** Upsert the whole budget as one row (last write wins). */
export async function pushBudget(sb: SupabaseClient, userId: string, state: AppState): Promise<string> {
  const updated_at = new Date().toISOString()
  const { error } = await sb.from('budgets').upsert({ user_id: userId, data: state, updated_at })
  if (error) throw new Error(error.message)
  return updated_at
}
