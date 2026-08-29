/** Date helpers. All app dates are local-time ISO `YYYY-MM-DD` strings. */

export function todayISO(): string {
  return toISO(new Date())
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Clamp a desired day-of-month to what the month actually has (e.g. 31 → Feb 28). */
export function dateWithDay(year: number, monthIndex: number, day: number): Date {
  const last = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(day, last))
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

export function addMonthsKeepDay(iso: string, months: number, preferredDay: number): string {
  const d = parseISO(iso)
  return toISO(dateWithDay(d.getFullYear(), d.getMonth() + months, preferredDay))
}

export function daysBetween(fromISO: string, toISOStr: string): number {
  return Math.round((parseISO(toISOStr).getTime() - parseISO(fromISO).getTime()) / 86400000)
}

/** `YYYY-MM` key for a date, used to mark monthly occurrences as paid. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function formatDate(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatMonth(iso: string): string {
  return parseISO(iso + (iso.length === 7 ? '-01' : '')).toLocaleDateString('en-PH', { year: 'numeric', month: 'short' })
}
