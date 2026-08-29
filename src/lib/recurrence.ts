import type { IncomeRule, Payable } from '../types'
import { addDays, dateWithDay, monthKey, parseISO, toISO, todayISO } from './dates'

/** Next run date for an income rule strictly after `afterISO`. */
export function nextRunAfter(rule: IncomeRule, afterISO: string): string {
  const after = parseISO(afterISO)
  switch (rule.frequency) {
    case 'monthly': {
      let candidate = dateWithDay(after.getFullYear(), after.getMonth(), rule.dayOfMonth)
      if (candidate <= after) {
        candidate = dateWithDay(after.getFullYear(), after.getMonth() + 1, rule.dayOfMonth)
      }
      return toISO(candidate)
    }
    case 'semimonthly': {
      const d2 = rule.secondDayOfMonth ?? 30
      const candidates = [
        dateWithDay(after.getFullYear(), after.getMonth(), rule.dayOfMonth),
        dateWithDay(after.getFullYear(), after.getMonth(), d2),
        dateWithDay(after.getFullYear(), after.getMonth() + 1, rule.dayOfMonth),
        dateWithDay(after.getFullYear(), after.getMonth() + 1, d2),
      ].sort((a, b) => a.getTime() - b.getTime())
      const next = candidates.find((c) => c > after)!
      return toISO(next)
    }
    case 'biweekly':
    case 'weekly': {
      const step = rule.frequency === 'weekly' ? 7 : 14
      let cursor = rule.anchorDate ?? todayISO()
      while (parseISO(cursor) <= after) cursor = addDays(cursor, step)
      return cursor
    }
  }
}

/** All run dates due on or before today (catch-up for days the app was closed). */
export function dueRuns(rule: IncomeRule, todayIso: string): string[] {
  if (!rule.active) return []
  const runs: string[] = []
  let cursor = rule.nextRunDate
  while (parseISO(cursor) <= parseISO(todayIso) && runs.length < 60) {
    runs.push(cursor)
    cursor = nextRunAfter(rule, cursor)
  }
  return runs
}

/** Monthly equivalent of an income rule, in the rule's own currency. */
export function monthlyEquivalent(rule: IncomeRule): number {
  switch (rule.frequency) {
    case 'monthly':
      return rule.amount
    case 'semimonthly':
      return rule.amount * 2
    case 'biweekly':
      return (rule.amount * 26) / 12
    case 'weekly':
      return (rule.amount * 52) / 12
  }
}

export interface Occurrence {
  payable: Payable
  dueDate: string
  periodKey: string // for `once`: the due date; for monthly: YYYY-MM
  paid: boolean
}

/** Upcoming (and overdue-unpaid) occurrences for a payable within the next `horizonDays`. */
export function occurrencesWithin(p: Payable, todayIso: string, horizonDays: number): Occurrence[] {
  if (!p.active) return []
  const horizon = addDays(todayIso, horizonDays)
  if (p.schedule === 'once') {
    if (!p.dueDate) return []
    const paid = p.paidPeriods.includes(p.dueDate)
    if (paid) return []
    if (parseISO(p.dueDate) > parseISO(horizon)) return []
    return [{ payable: p, dueDate: p.dueDate, periodKey: p.dueDate, paid }]
  }
  const day = p.dueDay ?? 1
  const start = parseISO(todayIso)
  const out: Occurrence[] = []
  for (let i = -1; ; i++) {
    const due = dateWithDay(start.getFullYear(), start.getMonth() + i, day)
    if (due > parseISO(horizon)) break
    const key = monthKey(toISO(due))
    const paid = p.paidPeriods.includes(key)
    if (p.endDate && due > parseISO(p.endDate)) break
    // include overdue-unpaid from last month, and everything from today forward
    if ((due >= start || !paid) && toISO(due) >= addDays(todayIso, -35)) {
      if (!paid) out.push({ payable: p, dueDate: toISO(due), periodKey: key, paid })
    }
  }
  return out
}

/** Total monthly outflow commitment of a payable, in its own currency. */
export function monthlyOutflow(p: Payable): number {
  return p.active && p.schedule === 'monthly' ? p.amount : 0
}
