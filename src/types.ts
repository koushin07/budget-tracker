export type Currency = 'PHP' | 'USD'

export type AccountType = 'bank' | 'ewallet' | 'cash' | 'investment' | 'other'

export interface Account {
  id: string
  name: string
  institution: string
  type: AccountType
  currency: Currency
  balance: number
}

export type TxType = 'income' | 'expense' | 'transfer' | 'savings'

export interface Transaction {
  id: string
  date: string // ISO date
  accountId: string
  type: TxType
  category: string
  description: string
  /** Amount in the account's currency (positive = inflow, negative = outflow) */
  amount: number
  /** Normalized PHP value at the time of the transaction */
  amountPHP: number
  /** USD→PHP rate used, when a conversion happened */
  rateUsed?: number
  /** id of the income rule / payable / goal that generated this */
  sourceId?: string
}

export type IncomeFrequency = 'monthly' | 'semimonthly' | 'biweekly' | 'weekly'

export interface IncomeRule {
  id: string
  name: string
  amount: number
  currency: Currency
  /** Account the money lands in. If rule is USD and account is PHP, auto-convert at live rate. */
  accountId: string
  frequency: IncomeFrequency
  /** monthly: payday (1–31). semimonthly: first payday. */
  dayOfMonth: number
  /** semimonthly second payday (e.g. 30) */
  secondDayOfMonth?: number
  /** biweekly/weekly anchor date */
  anchorDate?: string
  nextRunDate: string // ISO date
  active: boolean
}

export type PayableKind = 'bill' | 'loan' | 'expense'
export type PayableSchedule = 'once' | 'monthly'

export interface Payable {
  id: string
  name: string
  kind: PayableKind
  category: string
  schedule: PayableSchedule
  /** Payment amount per occurrence, in `currency` */
  amount: number
  currency: Currency
  /** For one-time payables */
  dueDate?: string
  /** For monthly payables: due day of month (1–31) */
  dueDay?: number
  /** Optional end for monthly bills (e.g. a 12-month subscription) */
  endDate?: string
  /** Loans: total amount that must be paid to be free of it */
  totalPayable?: number
  /** Loans: amount paid so far */
  paidSoFar?: number
  /** Loans: annual interest rate %, used to prioritize payoff advice */
  interestRate?: number
  /** ISO dates of payments made (YYYY-MM for monthly occurrences) */
  paidPeriods: string[]
  active: boolean
}

export interface SavingsGoal {
  id: string
  name: string
  targetAmount: number // PHP
  savedSoFar: number // PHP
  monthlyContribution: number // PHP, planned
  targetDate?: string
  /** Account contributions are drawn from */
  accountId?: string
  active: boolean
}

export interface FxCache {
  usdToPhp: number
  fetchedAt: string // ISO datetime
  source: string
}

export interface Settings {
  /** Used if the live rate cannot be fetched */
  fallbackUsdToPhp: number
}

export interface AppState {
  accounts: Account[]
  transactions: Transaction[]
  incomeRules: IncomeRule[]
  payables: Payable[]
  goals: SavingsGoal[]
  settings: Settings
}
