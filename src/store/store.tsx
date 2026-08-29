/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Account, AppState, FxCache, IncomeRule, Payable, SavingsGoal, Transaction } from '../types'
import { getUsdToPhp, lastKnownUsdToPhp } from '../lib/fx'
import { dueRuns, nextRunAfter } from '../lib/recurrence'
import { todayISO } from '../lib/dates'

const STORAGE_KEY = 'pesowise.state.v1'

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

const initialState: AppState = {
  accounts: [],
  transactions: [],
  incomeRules: [],
  payables: [],
  goals: [],
  settings: { fallbackUsdToPhp: 58.5 },
}

type Action =
  | { type: 'load'; state: AppState }
  | { type: 'addAccount'; account: Account }
  | { type: 'updateAccount'; account: Account }
  | { type: 'deleteAccount'; id: string }
  | { type: 'addTransaction'; tx: Transaction }
  | { type: 'deleteTransaction'; id: string }
  | { type: 'addIncomeRule'; rule: IncomeRule }
  | { type: 'updateIncomeRule'; rule: IncomeRule }
  | { type: 'deleteIncomeRule'; id: string }
  | { type: 'addPayable'; payable: Payable }
  | { type: 'updatePayable'; payable: Payable }
  | { type: 'deletePayable'; id: string }
  | { type: 'addGoal'; goal: SavingsGoal }
  | { type: 'updateGoal'; goal: SavingsGoal }
  | { type: 'deleteGoal'; id: string }
  | { type: 'postIncome'; rule: IncomeRule; runDate: string; rate: number }
  | { type: 'payOccurrence'; payableId: string; periodKey: string; accountId: string; rate: number; dueDate: string }
  | { type: 'contribute'; goalId: string; amount: number; accountId: string; rate: number }

function applyToBalance(accounts: Account[], accountId: string, delta: number): Account[] {
  return accounts.map((a) => (a.id === accountId ? { ...a, balance: a.balance + delta } : a))
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'load':
      return action.state
    case 'addAccount':
      return { ...state, accounts: [...state.accounts, action.account] }
    case 'updateAccount':
      return { ...state, accounts: state.accounts.map((a) => (a.id === action.account.id ? action.account : a)) }
    case 'deleteAccount':
      return { ...state, accounts: state.accounts.filter((a) => a.id !== action.id) }
    case 'addTransaction': {
      const tx = action.tx
      return {
        ...state,
        transactions: [tx, ...state.transactions],
        accounts: applyToBalance(state.accounts, tx.accountId, tx.amount),
      }
    }
    case 'deleteTransaction': {
      const tx = state.transactions.find((t) => t.id === action.id)
      if (!tx) return state
      return {
        ...state,
        transactions: state.transactions.filter((t) => t.id !== action.id),
        accounts: applyToBalance(state.accounts, tx.accountId, -tx.amount),
      }
    }
    case 'addIncomeRule':
      return { ...state, incomeRules: [...state.incomeRules, action.rule] }
    case 'updateIncomeRule':
      return { ...state, incomeRules: state.incomeRules.map((r) => (r.id === action.rule.id ? action.rule : r)) }
    case 'deleteIncomeRule':
      return { ...state, incomeRules: state.incomeRules.filter((r) => r.id !== action.id) }
    case 'addPayable':
      return { ...state, payables: [...state.payables, action.payable] }
    case 'updatePayable':
      return { ...state, payables: state.payables.map((p) => (p.id === action.payable.id ? action.payable : p)) }
    case 'deletePayable':
      return { ...state, payables: state.payables.filter((p) => p.id !== action.id) }
    case 'addGoal':
      return { ...state, goals: [...state.goals, action.goal] }
    case 'updateGoal':
      return { ...state, goals: state.goals.map((g) => (g.id === action.goal.id ? action.goal : g)) }
    case 'deleteGoal':
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) }

    case 'postIncome': {
      const { rule, runDate, rate } = action
      const account = state.accounts.find((a) => a.id === rule.accountId)
      if (!account) return state
      const converted = rule.currency === 'USD' && account.currency === 'PHP'
      const amountInAccount = converted ? rule.amount * rate : rule.amount
      const amountPHP = rule.currency === 'USD' ? rule.amount * rate : rule.amount
      const tx: Transaction = {
        id: uid(),
        date: runDate,
        accountId: account.id,
        type: 'income',
        category: 'Salary',
        description: converted
          ? `${rule.name} — $${rule.amount.toLocaleString()} @ ₱${rate.toFixed(2)}`
          : rule.name,
        amount: amountInAccount,
        amountPHP,
        rateUsed: rule.currency === 'USD' ? rate : undefined,
        sourceId: rule.id,
      }
      return {
        ...state,
        transactions: [tx, ...state.transactions],
        accounts: applyToBalance(state.accounts, account.id, amountInAccount),
        incomeRules: state.incomeRules.map((r) =>
          r.id === rule.id ? { ...r, nextRunDate: nextRunAfter(rule, runDate) } : r,
        ),
      }
    }

    case 'payOccurrence': {
      const p = state.payables.find((x) => x.id === action.payableId)
      const account = state.accounts.find((a) => a.id === action.accountId)
      if (!p || !account || p.paidPeriods.includes(action.periodKey)) return state
      const amountPHP = p.currency === 'USD' ? p.amount * action.rate : p.amount
      const amountInAccount =
        account.currency === p.currency ? p.amount : account.currency === 'PHP' ? amountPHP : p.amount / action.rate
      const tx: Transaction = {
        id: uid(),
        date: todayISO(),
        accountId: account.id,
        type: 'expense',
        category: p.category || p.kind,
        description: `${p.name} (due ${action.dueDate})`,
        amount: -amountInAccount,
        amountPHP: -amountPHP,
        rateUsed: p.currency !== account.currency ? action.rate : undefined,
        sourceId: p.id,
      }
      const isLoan = p.kind === 'loan' && p.totalPayable != null
      const updated: Payable = {
        ...p,
        paidPeriods: [...p.paidPeriods, action.periodKey],
        paidSoFar: isLoan ? (p.paidSoFar ?? 0) + p.amount : p.paidSoFar,
        active: p.schedule === 'once' ? false : isLoan && (p.paidSoFar ?? 0) + p.amount >= p.totalPayable! ? false : p.active,
      }
      return {
        ...state,
        transactions: [tx, ...state.transactions],
        accounts: applyToBalance(state.accounts, account.id, tx.amount),
        payables: state.payables.map((x) => (x.id === p.id ? updated : x)),
      }
    }

    case 'contribute': {
      const g = state.goals.find((x) => x.id === action.goalId)
      const account = state.accounts.find((a) => a.id === action.accountId)
      if (!g || !account || action.amount <= 0) return state
      const amountInAccount = account.currency === 'PHP' ? action.amount : action.amount / action.rate
      const tx: Transaction = {
        id: uid(),
        date: todayISO(),
        accountId: account.id,
        type: 'savings',
        category: 'Savings',
        description: `Contribution → ${g.name}`,
        amount: -amountInAccount,
        amountPHP: -action.amount,
        rateUsed: account.currency === 'USD' ? action.rate : undefined,
        sourceId: g.id,
      }
      return {
        ...state,
        transactions: [tx, ...state.transactions],
        accounts: applyToBalance(state.accounts, account.id, tx.amount),
        goals: state.goals.map((x) => (x.id === g.id ? { ...x, savedSoFar: x.savedSoFar + action.amount } : x)),
      }
    }
  }
}

interface Store {
  state: AppState
  dispatch: React.Dispatch<Action>
  fx: FxCache
  refreshFx: () => Promise<void>
  exportData: () => void
  importData: (file: File) => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    const parsed = JSON.parse(raw)
    return { ...initialState, ...parsed, settings: { ...initialState.settings, ...parsed.settings } }
  } catch {
    return initialState
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  const [fx, setFx] = useState<FxCache>(() => ({
    usdToPhp: lastKnownUsdToPhp(initialState.settings.fallbackUsdToPhp),
    fetchedAt: new Date(0).toISOString(),
    source: 'loading…',
  }))
  const fxRef = useRef(fx)
  fxRef.current = fx

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // storage full/unavailable — in-memory state still works
    }
  }, [state])

  const refreshFx = async () => {
    const fresh = await getUsdToPhp(state.settings.fallbackUsdToPhp)
    setFx(fresh)
  }

  // Fetch live rate on load and every 30 minutes
  useEffect(() => {
    refreshFx()
    const t = setInterval(refreshFx, 30 * 60 * 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Automation engine: post any income runs that have come due, at the live rate.
  // Runs after the fx fetch resolves, and re-checks every minute (catches midnight rollover).
  const rulesKey = state.incomeRules.map((r) => `${r.id}:${r.nextRunDate}:${r.active}`).join('|')
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const today = todayISO()
      const due = state.incomeRules.flatMap((r) => dueRuns(r, today).map((d) => ({ rule: r, runDate: d })))
      if (due.length === 0) return
      const fresh = await getUsdToPhp(state.settings.fallbackUsdToPhp)
      if (cancelled) return
      setFx(fresh)
      // Post only the earliest due run per rule; the reducer advances nextRunDate,
      // which changes rulesKey and re-triggers this effect for the next one.
      const seen = new Set<string>()
      for (const { rule, runDate } of due) {
        if (seen.has(rule.id)) continue
        seen.add(rule.id)
        dispatch({ type: 'postIncome', rule, runDate, rate: fresh.usdToPhp })
      }
    }
    tick()
    const t = setInterval(tick, 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulesKey])

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pesowise-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importData = async (file: File) => {
    const text = await file.text()
    const parsed = JSON.parse(text)
    if (!parsed || !Array.isArray(parsed.accounts)) throw new Error('Not a PesoWise backup file')
    dispatch({ type: 'load', state: { ...initialState, ...parsed } })
  }

  const value = useMemo<Store>(
    () => ({ state, dispatch, fx, refreshFx, exportData, importData }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, fx],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
