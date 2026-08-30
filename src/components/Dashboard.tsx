import { useState } from 'react'
import type { Transaction } from '../types'
import { useStore, uid } from '../store/store'
import { money, peso, pesoRound } from '../lib/format'
import {
  debtFreeDate,
  monthlyIncomePHP,
  monthlyPayablesPHP,
  monthlySavingsCommitmentPHP,
  toPHP,
  totalCashPHP,
  totalOutstandingPHP,
} from '../lib/analytics'
import { occurrencesWithin } from '../lib/recurrence'
import { formatDate, todayISO } from '../lib/dates'
import { Card, ConfirmButton, Empty, Field, Stat } from './ui'

export function Dashboard() {
  const { state, dispatch, fx } = useStore()
  const rate = fx.usdToPhp
  const income = monthlyIncomePHP(state, rate)
  const payables = monthlyPayablesPHP(state, rate)
  const savings = monthlySavingsCommitmentPHP(state)
  const net = income - payables - savings
  const freeDate = debtFreeDate(state)
  const today = todayISO()

  const upcoming = state.payables
    .flatMap((p) => occurrencesWithin(p, today, 30))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 8)

  const [quick, setQuick] = useState({ description: '', amount: '', category: 'Food', accountId: '' })

  const logExpense = (e: React.FormEvent) => {
    e.preventDefault()
    const accountId = quick.accountId || state.accounts[0]?.id
    const amount = Number(quick.amount)
    if (!accountId || !amount || amount <= 0) return
    const account = state.accounts.find((a) => a.id === accountId)!
    const tx: Transaction = {
      id: uid(),
      date: today,
      accountId,
      type: 'expense',
      category: quick.category || 'Other',
      description: quick.description || quick.category,
      amount: -amount,
      amountPHP: -toPHP(amount, account.currency, rate),
      rateUsed: account.currency === 'USD' ? rate : undefined,
    }
    dispatch({ type: 'addTransaction', tx })
    setQuick({ ...quick, description: '', amount: '' })
  }

  const recent = state.transactions.slice(0, 10)

  return (
    <div className="stack">
      <div className="stat-grid">
        <Stat label="Total money (all sources)" value={peso(totalCashPHP(state.accounts, rate))} sub={`${state.accounts.length} account${state.accounts.length === 1 ? '' : 's'} · USD @ ₱${rate.toFixed(2)}`} />
        <Stat label="Monthly income" value={pesoRound(income)} tone="good" sub={`${state.incomeRules.filter((r) => r.active).length} automated stream(s)`} />
        <Stat label="Monthly payables + savings" value={pesoRound(payables + savings)} tone="bad" sub={`${pesoRound(payables)} bills/loans · ${pesoRound(savings)} to goals`} />
        <Stat label="Left over each month" value={pesoRound(net)} tone={net >= 0 ? 'good' : 'bad'} sub={freeDate ? `payment-free on ${formatDate(freeDate)}` : 'no outstanding dated debts'} />
      </div>

      <div className="two-col">
        <Card title="Upcoming payments — next 30 days">
          {upcoming.length === 0 ? (
            <Empty>Nothing due in the next 30 days.</Empty>
          ) : (
            upcoming.map((o) => {
              const overdue = o.dueDate < today
              return (
                <div key={o.payable.id + o.periodKey} className="list-item slim">
                  <div>
                    <strong>{o.payable.name}</strong>
                    <span className={overdue ? 'due-badge overdue' : 'due-badge'}> {overdue ? 'overdue — ' : ''}{formatDate(o.dueDate)}</span>
                  </div>
                  <div className="num">{money(o.payable.amount, o.payable.currency)}</div>
                </div>
              )
            })
          )}
          <p className="muted">
            Total still to pay (loans + dues + 12 mo of bills): <strong>{pesoRound(totalOutstandingPHP(state, rate))}</strong>
          </p>
        </Card>

        <Card title="Quick log an expense">
          <form className="form-grid" onSubmit={logExpense}>
            <Field label="What was it?">
              <input value={quick.description} onChange={(e) => setQuick({ ...quick, description: e.target.value })} placeholder="e.g. Groceries at SM" />
            </Field>
            <Field label="Amount">
              <input type="number" step="0.01" min="0" value={quick.amount} onChange={(e) => setQuick({ ...quick, amount: e.target.value })} required />
            </Field>
            <Field label="Category">
              <select value={quick.category} onChange={(e) => setQuick({ ...quick, category: e.target.value })}>
                {['Food', 'Transport', 'Utilities', 'Housing', 'Shopping', 'Health', 'Entertainment', 'Family', 'Other'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="From account">
              <select value={quick.accountId || state.accounts[0]?.id || ''} onChange={(e) => setQuick({ ...quick, accountId: e.target.value })}>
                {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </Field>
            <div className="form-actions">
              <button className="btn primary" type="submit" disabled={state.accounts.length === 0}>Log expense</button>
            </div>
          </form>
          {state.accounts.length === 0 && <Empty>Add an account first (Accounts tab).</Empty>}
        </Card>
      </div>

      <Card title="Recent activity">
        {recent.length === 0 ? (
          <Empty>No transactions yet. Automated salary deposits, bill payments and logged expenses all show up here.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th className="num">Amount</th><th className="num">≈ PHP</th><th /></tr>
            </thead>
            <tbody>
              {recent.map((t) => {
                const account = state.accounts.find((a) => a.id === t.accountId)
                return (
                  <tr key={t.id}>
                    <td className="muted">{formatDate(t.date)}</td>
                    <td>{t.description}</td>
                    <td><span className="chip">{t.category}</span></td>
                    <td className="muted">{account?.name ?? '—'}</td>
                    <td className={`num ${t.amount >= 0 ? 'good-text' : ''}`}>{account ? money(t.amount, account.currency) : peso(t.amountPHP)}</td>
                    <td className="num muted">{peso(t.amountPHP)}</td>
                    <td className="row-actions">
                      <ConfirmButton
                        label="✕"
                        title="Delete and reverse the balance change"
                        onConfirm={() => dispatch({ type: 'deleteTransaction', id: t.id })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
