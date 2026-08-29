import type { Account, AppState, Payable, SavingsGoal, Transaction } from '../types'
import { addMonthsKeepDay, daysBetween, monthKey, todayISO } from './dates'
import { monthlyEquivalent, monthlyOutflow, occurrencesWithin } from './recurrence'

export function toPHP(amount: number, currency: 'PHP' | 'USD', rate: number): number {
  return currency === 'USD' ? amount * rate : amount
}

export function accountBalancePHP(a: Account, rate: number): number {
  return toPHP(a.balance, a.currency, rate)
}

export function totalCashPHP(accounts: Account[], rate: number): number {
  return accounts.reduce((s, a) => s + accountBalancePHP(a, rate), 0)
}

export function monthlyIncomePHP(state: AppState, rate: number): number {
  return state.incomeRules
    .filter((r) => r.active)
    .reduce((s, r) => s + toPHP(monthlyEquivalent(r), r.currency, rate), 0)
}

export function monthlyPayablesPHP(state: AppState, rate: number): number {
  return state.payables.reduce((s, p) => s + toPHP(monthlyOutflow(p), p.currency, rate), 0)
}

export function monthlySavingsCommitmentPHP(state: AppState): number {
  return state.goals.filter((g) => g.active).reduce((s, g) => s + g.monthlyContribution, 0)
}

/** Loan remaining balance in its own currency. */
export function loanRemaining(p: Payable): number {
  if (p.kind !== 'loan' || p.totalPayable == null) return 0
  return Math.max(0, p.totalPayable - (p.paidSoFar ?? 0))
}

/** "How much will I need to pay in total": everything still owed, in PHP. */
export function totalOutstandingPHP(state: AppState, rate: number, horizonMonths = 12): number {
  let total = 0
  for (const p of state.payables) {
    if (!p.active) continue
    if (p.schedule === 'once') {
      if (p.dueDate && !p.paidPeriods.includes(p.dueDate)) total += toPHP(p.amount, p.currency, rate)
    } else if (p.kind === 'loan' && p.totalPayable != null) {
      total += toPHP(loanRemaining(p), p.currency, rate)
    } else {
      // open-ended monthly bill: count the horizon
      const months = p.endDate
        ? Math.max(0, Math.min(horizonMonths, Math.ceil(daysBetween(todayISO(), p.endDate) / 30)))
        : horizonMonths
      total += toPHP(p.amount * months, p.currency, rate)
    }
  }
  return total
}

/** Months until a loan is fully paid at its current payment amount. */
export function loanMonthsLeft(p: Payable): number | null {
  if (p.kind !== 'loan' || p.totalPayable == null || p.amount <= 0) return null
  return Math.ceil(loanRemaining(p) / p.amount)
}

/** "When will I be free of payments": last payoff date across loans and dated payables. */
export function debtFreeDate(state: AppState): string | null {
  let latest: string | null = null
  const today = todayISO()
  for (const p of state.payables) {
    if (!p.active) continue
    let end: string | null = null
    if (p.schedule === 'once') {
      if (p.dueDate && !p.paidPeriods.includes(p.dueDate)) end = p.dueDate < today ? today : p.dueDate
    } else if (p.kind === 'loan') {
      const months = loanMonthsLeft(p)
      if (months != null && months > 0) end = addMonthsKeepDay(today, months, p.dueDay ?? 1)
    } else if (p.endDate) {
      end = p.endDate
    }
    if (end && (!latest || end > latest)) latest = end
  }
  return latest
}

export interface MonthProjection {
  month: string // YYYY-MM
  incomePHP: number
  payablesPHP: number
  savingsPHP: number
  netPHP: number
  cumulativeCashPHP: number
}

/** 12-month cash projection: income minus payables minus planned savings. */
export function projectMonths(state: AppState, rate: number, months = 12): MonthProjection[] {
  const income = monthlyIncomePHP(state, rate)
  const savings = monthlySavingsCommitmentPHP(state)
  let cash = totalCashPHP(state.accounts, rate)
  const out: MonthProjection[] = []
  const today = todayISO()
  for (let i = 0; i < months; i++) {
    const mStart = addMonthsKeepDay(today, i, 1)
    const m = monthKey(mStart)
    let payables = 0
    for (const p of state.payables) {
      if (!p.active) continue
      if (p.schedule === 'monthly') {
        const stillRunning =
          (!p.endDate || monthKey(p.endDate) >= m) &&
          (p.kind !== 'loan' || (loanMonthsLeft(p) ?? Infinity) > i)
        if (stillRunning) payables += toPHP(p.amount, p.currency, rate)
      } else if (p.dueDate && !p.paidPeriods.includes(p.dueDate)) {
        const dueMonth = monthKey(p.dueDate < today ? today : p.dueDate)
        if (dueMonth === m) payables += toPHP(p.amount, p.currency, rate)
      }
    }
    const net = income - payables - savings
    cash += net
    out.push({ month: m, incomePHP: income, payablesPHP: payables, savingsPHP: savings, netPHP: net, cumulativeCashPHP: cash })
  }
  return out
}

/** Spending by category over the last `days`, PHP. */
export function spendingByCategory(transactions: Transaction[], days: number): Map<string, number> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const map = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    if (new Date(t.date) < since) continue
    map.set(t.category, (map.get(t.category) ?? 0) + Math.abs(t.amountPHP))
  }
  return new Map([...map.entries()].sort((a, b) => b[1] - a[1]))
}

export interface GoalPlan {
  goal: SavingsGoal
  remaining: number
  /** months to finish at planned contribution */
  etaMonths: number | null
  etaDate: string | null
  /** required monthly amount to hit targetDate, if set */
  requiredMonthly: number | null
  onTrack: boolean | null
}

export function planGoal(g: SavingsGoal): GoalPlan {
  const remaining = Math.max(0, g.targetAmount - g.savedSoFar)
  const etaMonths = g.monthlyContribution > 0 ? Math.ceil(remaining / g.monthlyContribution) : null
  const etaDate = etaMonths != null ? addMonthsKeepDay(todayISO(), etaMonths, 1) : null
  let requiredMonthly: number | null = null
  let onTrack: boolean | null = null
  if (g.targetDate) {
    const monthsLeft = Math.max(1, Math.ceil(daysBetween(todayISO(), g.targetDate) / 30.44))
    requiredMonthly = remaining / monthsLeft
    onTrack = g.monthlyContribution >= requiredMonthly - 0.005
  }
  return { goal: g, remaining, etaMonths, etaDate, requiredMonthly, onTrack }
}

export interface Recommendation {
  severity: 'critical' | 'warning' | 'tip'
  title: string
  detail: string
}

/** Rule-based financial advisor. */
export function recommendations(state: AppState, rate: number): Recommendation[] {
  const recs: Recommendation[] = []
  const income = monthlyIncomePHP(state, rate)
  const payables = monthlyPayablesPHP(state, rate)
  const savings = monthlySavingsCommitmentPHP(state)
  const surplus = income - payables - savings
  const cash = totalCashPHP(state.accounts, rate)
  const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH')

  if (income > 0 && surplus < 0) {
    recs.push({
      severity: 'critical',
      title: 'You are spending more than you earn',
      detail: `Monthly commitments exceed income by ${peso(-surplus)}. Cut or defer flexible expenses, or lower savings contributions temporarily — never miss loan payments first.`,
    })
  }

  // Emergency fund: 3 months of payables + savings
  const monthlyBurn = payables + savings
  if (monthlyBurn > 0) {
    const monthsCovered = cash / monthlyBurn
    if (monthsCovered < 3) {
      recs.push({
        severity: monthsCovered < 1 ? 'critical' : 'warning',
        title: `Emergency fund covers only ${monthsCovered.toFixed(1)} month${monthsCovered < 2 ? '' : 's'}`,
        detail: `Aim for 3–6 months of expenses (${peso(monthlyBurn * 3)}–${peso(monthlyBurn * 6)}). Park it in a high-yield PHP savings account before aggressive goals.`,
      })
    }
  }

  // Debt avalanche: highest-interest loan first
  const loans = state.payables.filter((p) => p.active && p.kind === 'loan' && loanRemaining(p) > 0)
  const withRate = loans.filter((l) => (l.interestRate ?? 0) > 0).sort((a, b) => (b.interestRate ?? 0) - (a.interestRate ?? 0))
  if (withRate.length > 0) {
    const top = withRate[0]
    if ((top.interestRate ?? 0) >= 10) {
      recs.push({
        severity: 'warning',
        title: `Attack "${top.name}" first (${top.interestRate}% interest)`,
        detail: `It is your most expensive debt. Any extra cash beyond your emergency fund earns a guaranteed ${top.interestRate}% by going here (debt avalanche). Even one extra payment shortens the payoff date.`,
      })
    }
  }

  // Savings rate vs 20% guideline
  if (income > 0) {
    const savingsRate = savings / income
    if (savingsRate < 0.2 && surplus > 0) {
      recs.push({
        severity: 'tip',
        title: `Savings rate is ${(savingsRate * 100).toFixed(0)}% — the 50/30/20 rule suggests 20%`,
        detail: `You have ${peso(surplus)} of unallocated surplus each month. Moving ${peso(Math.min(surplus, income * 0.2 - savings))} into your goals gets you to the 20% benchmark without touching bills.`,
      })
    }
  }

  // Due within 7 days
  const soon = state.payables.flatMap((p) => occurrencesWithin(p, todayISO(), 7)).filter((o) => !o.paid)
  if (soon.length > 0) {
    const total = soon.reduce((s, o) => s + toPHP(o.payable.amount, o.payable.currency, rate), 0)
    const overdueCount = soon.filter((o) => o.dueDate < todayISO()).length
    recs.push({
      severity: overdueCount > 0 ? 'critical' : 'warning',
      title:
        overdueCount > 0
          ? `${overdueCount} payment${overdueCount > 1 ? 's' : ''} OVERDUE — ${peso(total)} needs attention`
          : `${soon.length} payment${soon.length > 1 ? 's' : ''} due within 7 days (${peso(total)})`,
      detail: soon.map((o) => `${o.payable.name} on ${o.dueDate}`).join(' · ') + '. Pay early to avoid late fees — they are pure waste.',
    })
  }

  // USD income tip
  if (state.incomeRules.some((r) => r.active && r.currency === 'USD')) {
    recs.push({
      severity: 'tip',
      title: 'You earn in USD — watch the conversion spread',
      detail: `PesoWise converts at the mid-market rate (currently ₱${rate.toFixed(2)}/$). Banks and remittance apps take 0.5–3% below that. Compare Wise, GCash and your bank's actual payout rate, and consider keeping 1–2 months of expenses in USD as a hedge.`,
    })
  }

  // Goals behind schedule
  for (const g of state.goals.filter((x) => x.active)) {
    const plan = planGoal(g)
    if (plan.onTrack === false && plan.requiredMonthly != null) {
      recs.push({
        severity: 'warning',
        title: `"${g.name}" is behind schedule`,
        detail: `You need ${peso(plan.requiredMonthly)}/month to hit the target date but are contributing ${peso(g.monthlyContribution)}. Raise the contribution by ${peso(plan.requiredMonthly - g.monthlyContribution)} or move the date out.`,
      })
    }
  }

  if (recs.length === 0) {
    recs.push({
      severity: 'tip',
      title: 'Everything looks healthy',
      detail: 'Income covers commitments, no payments are overdue, and goals are on track. Consider raising a savings contribution or making an extra loan payment with this month’s surplus.',
    })
  }

  const order = { critical: 0, warning: 1, tip: 2 }
  return recs.sort((a, b) => order[a.severity] - order[b.severity])
}
