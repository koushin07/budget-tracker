import { useState } from 'react'
import type { Currency, IncomeFrequency, IncomeRule } from '../types'
import { useStore, uid } from '../store/store'
import { money, peso } from '../lib/format'
import { monthlyEquivalent, nextRunAfter } from '../lib/recurrence'
import { addDays, formatDate, todayISO } from '../lib/dates'
import { toPHP } from '../lib/analytics'
import { Card, ConfirmButton, Empty, Field } from './ui'

const FREQ_LABEL: Record<IncomeFrequency, string> = {
  monthly: 'Monthly',
  semimonthly: 'Twice a month (kinsenas)',
  biweekly: 'Every 2 weeks',
  weekly: 'Weekly',
}

const blank = {
  name: '',
  amount: '',
  currency: 'USD' as Currency,
  accountId: '',
  frequency: 'monthly' as IncomeFrequency,
  dayOfMonth: '30',
  secondDayOfMonth: '15',
  anchorDate: todayISO(),
}

export function Income() {
  const { state, dispatch, fx } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(blank)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const base: IncomeRule = {
      id: editingId ?? uid(),
      name: form.name.trim() || 'Salary',
      amount: Number(form.amount) || 0,
      currency: form.currency,
      accountId: form.accountId,
      frequency: form.frequency,
      dayOfMonth: Number(form.dayOfMonth) || 1,
      secondDayOfMonth: form.frequency === 'semimonthly' ? Number(form.secondDayOfMonth) || 15 : undefined,
      anchorDate: form.frequency === 'weekly' || form.frequency === 'biweekly' ? form.anchorDate : undefined,
      nextRunDate: todayISO(), // recomputed below
      active: true,
    }
    if (!base.accountId || base.amount <= 0) return
    // First run is the next occurrence strictly after yesterday (so "today" counts if it matches)
    base.nextRunDate = nextRunAfter(base, addDays(todayISO(), -1))
    dispatch(editingId ? { type: 'updateIncomeRule', rule: base } : { type: 'addIncomeRule', rule: base })
    setForm(blank)
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (r: IncomeRule) => {
    setEditingId(r.id)
    setForm({
      name: r.name,
      amount: String(r.amount),
      currency: r.currency,
      accountId: r.accountId,
      frequency: r.frequency,
      dayOfMonth: String(r.dayOfMonth),
      secondDayOfMonth: String(r.secondDayOfMonth ?? 15),
      anchorDate: r.anchorDate ?? todayISO(),
    })
    setShowForm(true)
  }

  const totalMonthlyPHP = state.incomeRules
    .filter((r) => r.active)
    .reduce((s, r) => s + toPHP(monthlyEquivalent(r), r.currency, fx.usdToPhp), 0)

  return (
    <div className="stack">
      <Card
        title="Automated income"
        action={
          <button className="btn primary" onClick={() => { setShowForm((s) => !s); setEditingId(null); setForm(blank) }}>
            {showForm ? 'Cancel' : '+ Add income'}
          </button>
        }
      >
        <p className="muted">
          Set up your salary once — PesoWise deposits it automatically on payday. USD income is converted to PHP at the{' '}
          <strong>live rate on the day it lands</strong> (now ₱{fx.usdToPhp.toFixed(2)}/$).
          Expected monthly income: <strong>{peso(totalMonthlyPHP)}</strong>.
        </p>

        {showForm && (
          <form className="form-grid" onSubmit={submit}>
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Salary — Acme Inc." />
            </Field>
            <Field label="Amount per payout">
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 1500" required />
            </Field>
            <Field label="Currency you're paid in">
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
                <option value="USD">USD $ (auto-converted to PHP)</option>
                <option value="PHP">PHP ₱</option>
              </select>
            </Field>
            <Field label="Deposit to account">
              <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} required>
                <option value="">Select account…</option>
                {state.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                ))}
              </select>
            </Field>
            <Field label="Frequency">
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as IncomeFrequency })}>
                {Object.entries(FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            {(form.frequency === 'monthly' || form.frequency === 'semimonthly') && (
              <Field label={form.frequency === 'monthly' ? 'Payday (day of month)' : 'First payday'}>
                <input type="number" min="1" max="31" value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })} />
              </Field>
            )}
            {form.frequency === 'semimonthly' && (
              <Field label="Second payday">
                <input type="number" min="1" max="31" value={form.secondDayOfMonth} onChange={(e) => setForm({ ...form, secondDayOfMonth: e.target.value })} />
              </Field>
            )}
            {(form.frequency === 'weekly' || form.frequency === 'biweekly') && (
              <Field label="Next payday">
                <input type="date" value={form.anchorDate} onChange={(e) => setForm({ ...form, anchorDate: e.target.value })} />
              </Field>
            )}
            <div className="form-actions">
              <button className="btn primary" type="submit">{editingId ? 'Save changes' : 'Automate it'}</button>
            </div>
          </form>
        )}

        {state.accounts.length === 0 && <Empty>Add an account first so the salary has somewhere to land.</Empty>}

        {state.incomeRules.length === 0 && state.accounts.length > 0 ? (
          <Empty>No automated income yet. Add your salary and it will be deposited (and converted) on every payday.</Empty>
        ) : (
          state.incomeRules.map((r) => {
            const account = state.accounts.find((a) => a.id === r.accountId)
            return (
              <div key={r.id} className={`list-item ${r.active ? '' : 'inactive'}`}>
                <div>
                  <strong>{r.name}</strong>
                  <div className="muted">
                    {money(r.amount, r.currency)} · {FREQ_LABEL[r.frequency]} → {account?.name ?? '(deleted account)'}
                    {r.currency === 'USD' && account?.currency === 'PHP' && (
                      <> · lands as ≈ {peso(r.amount * fx.usdToPhp)} at today's rate</>
                    )}
                  </div>
                  <div className="muted">Next payout: <strong>{formatDate(r.nextRunDate)}</strong></div>
                </div>
                <div className="row-actions">
                  <button
                    className="btn ghost"
                    title="Deposit one payout now at the live rate"
                    onClick={() => dispatch({ type: 'postIncome', rule: r, runDate: todayISO(), rate: fx.usdToPhp })}
                  >
                    Run now
                  </button>
                  <button className="btn ghost" onClick={() => startEdit(r)}>Edit</button>
                  <button
                    className="btn ghost"
                    onClick={() => dispatch({ type: 'updateIncomeRule', rule: { ...r, active: !r.active } })}
                  >
                    {r.active ? 'Pause' : 'Resume'}
                  </button>
                  <ConfirmButton label="Delete" onConfirm={() => dispatch({ type: 'deleteIncomeRule', id: r.id })} />
                </div>
              </div>
            )
          })
        )}
      </Card>
    </div>
  )
}
