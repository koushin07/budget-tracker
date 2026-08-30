import { useState } from 'react'
import type { Currency, Payable, PayableKind, PayableSchedule } from '../types'
import { useStore, uid } from '../store/store'
import { money, peso } from '../lib/format'
import { loanMonthsLeft, loanRemaining, toPHP } from '../lib/analytics'
import { occurrencesWithin } from '../lib/recurrence'
import { formatDate, todayISO } from '../lib/dates'
import { Card, ConfirmButton, Empty, Field, Progress, ScrollIntoView, toast } from './ui'

const KIND_LABEL: Record<PayableKind, string> = { bill: 'Bill', loan: 'Loan', expense: 'Expense' }

const blank = {
  name: '',
  kind: 'bill' as PayableKind,
  category: '',
  schedule: 'monthly' as PayableSchedule,
  amount: '',
  currency: 'PHP' as Currency,
  dueDate: todayISO(),
  dueDay: '15',
  endDate: '',
  totalPayable: '',
  paidSoFar: '',
  interestRate: '',
}

export function Payables() {
  const { state, dispatch, fx } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(blank)
  const [payAccountId, setPayAccountId] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const existing = editingId ? state.payables.find((p) => p.id === editingId) : undefined
    const p: Payable = {
      id: editingId ?? uid(),
      name: form.name.trim(),
      kind: form.kind,
      category: form.category.trim() || KIND_LABEL[form.kind],
      schedule: form.schedule,
      amount: Number(form.amount) || 0,
      currency: form.currency,
      dueDate: form.schedule === 'once' ? form.dueDate : undefined,
      dueDay: form.schedule === 'monthly' ? Number(form.dueDay) || 1 : undefined,
      endDate: form.schedule === 'monthly' && form.endDate ? form.endDate : undefined,
      totalPayable: form.kind === 'loan' && form.totalPayable ? Number(form.totalPayable) : undefined,
      paidSoFar: form.kind === 'loan' ? Number(form.paidSoFar) || 0 : undefined,
      interestRate: form.kind === 'loan' && form.interestRate ? Number(form.interestRate) : undefined,
      paidPeriods: existing?.paidPeriods ?? [],
      active: existing?.active ?? true,
    }
    if (!p.name || p.amount <= 0) return
    dispatch(editingId ? { type: 'updatePayable', payable: p } : { type: 'addPayable', payable: p })
    setForm(blank)
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (p: Payable) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      kind: p.kind,
      category: p.category,
      schedule: p.schedule,
      amount: String(p.amount),
      currency: p.currency,
      dueDate: p.dueDate ?? todayISO(),
      dueDay: String(p.dueDay ?? 15),
      endDate: p.endDate ?? '',
      totalPayable: p.totalPayable != null ? String(p.totalPayable) : '',
      paidSoFar: p.paidSoFar != null ? String(p.paidSoFar) : '',
      interestRate: p.interestRate != null ? String(p.interestRate) : '',
    })
    setShowForm(true)
  }

  const pay = (p: Payable, periodKey: string, dueDate: string) => {
    const accountId = payAccountId || state.accounts[0]?.id
    if (!accountId) {
      toast('Add an account first so the payment can be drawn from it.')
      return
    }
    dispatch({ type: 'payOccurrence', payableId: p.id, periodKey, accountId, rate: fx.usdToPhp, dueDate })
  }

  const active = state.payables.filter((p) => p.active)
  const done = state.payables.filter((p) => !p.active)
  const today = todayISO()

  return (
    <div className="stack">
      <Card
        title="Bills, loans & expenses"
        action={
          <button className="btn primary" onClick={() => { setShowForm((s) => !s); setEditingId(null); setForm(blank) }}>
            {showForm ? 'Cancel' : '+ Add payable'}
          </button>
        }
      >
        {showForm && <ScrollIntoView trigger={editingId} />}
        {showForm && (
          <form className="form-grid" onSubmit={submit}>
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Meralco, Car loan, Netflix" required />
            </Field>
            <Field label="Type">
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PayableKind, schedule: e.target.value === 'loan' ? 'monthly' : form.schedule })}>
                <option value="bill">Bill</option>
                <option value="loan">Loan</option>
                <option value="expense">Expense</option>
              </select>
            </Field>
            <Field label="Category">
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Utilities, Housing" />
            </Field>
            <Field label="Schedule">
              <select value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value as PayableSchedule })}>
                <option value="monthly">Monthly (with due day)</option>
                <option value="once">One-time payment</option>
              </select>
            </Field>
            <Field label={form.schedule === 'monthly' ? 'Amount per month' : 'Amount'}>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </Field>
            <Field label="Currency">
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
                <option value="PHP">PHP ₱</option>
                <option value="USD">USD $</option>
              </select>
            </Field>
            {form.schedule === 'once' ? (
              <Field label="Due date">
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </Field>
            ) : (
              <>
                <Field label="Due day of month">
                  <input type="number" min="1" max="31" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} />
                </Field>
                {form.kind !== 'loan' && (
                  <Field label="Ends on (optional)">
                    <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                  </Field>
                )}
              </>
            )}
            {form.kind === 'loan' && (
              <>
                <Field label="Total amount to pay off">
                  <input type="number" step="0.01" min="0" value={form.totalPayable} onChange={(e) => setForm({ ...form, totalPayable: e.target.value })} placeholder="Remaining balance incl. interest" />
                </Field>
                <Field label="Already paid (optional)">
                  <input type="number" step="0.01" min="0" value={form.paidSoFar} onChange={(e) => setForm({ ...form, paidSoFar: e.target.value })} />
                </Field>
                <Field label="Interest rate % / year (optional)">
                  <input type="number" step="0.01" min="0" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} />
                </Field>
              </>
            )}
            <div className="form-actions">
              <button className="btn primary" type="submit">{editingId ? 'Save changes' : 'Add payable'}</button>
            </div>
          </form>
        )}

        {state.accounts.length > 0 && (
          <div className="pay-from">
            <span className="muted">Pay from:</span>
            <select value={payAccountId || state.accounts[0]?.id || ''} onChange={(e) => setPayAccountId(e.target.value)}>
              {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>
        )}

        {active.length === 0 ? (
          <Empty>Nothing to pay 🎉 Add your bills, loans and recurring expenses so due dates are never a surprise.</Empty>
        ) : (
          active.map((p) => {
            const occs = occurrencesWithin(p, today, 45)
            const nextDue = occs[0]
            const overdue = nextDue && nextDue.dueDate < today
            const monthsLeft = loanMonthsLeft(p)
            return (
              <div key={p.id} className="list-item">
                <div style={{ flex: 1 }}>
                  <strong>{p.name}</strong> <span className="chip">{KIND_LABEL[p.kind]}</span>{' '}
                  <span className="chip">{p.category}</span>
                  <div className="muted">
                    {money(p.amount, p.currency)}
                    {p.currency === 'USD' && <> (≈ {peso(toPHP(p.amount, 'USD', fx.usdToPhp))})</>}
                    {p.schedule === 'monthly' ? ` · every month on day ${p.dueDay}` : p.dueDate ? ` · due ${formatDate(p.dueDate)}` : ''}
                    {p.endDate && ` · until ${formatDate(p.endDate)}`}
                  </div>
                  {p.kind === 'loan' && p.totalPayable != null && (
                    <div className="loan-progress">
                      <Progress ratio={(p.paidSoFar ?? 0) / p.totalPayable} />
                      <span className="muted">
                        {money(loanRemaining(p), p.currency)} left of {money(p.totalPayable, p.currency)}
                        {monthsLeft != null && monthsLeft > 0 && ` · ${monthsLeft} payment${monthsLeft > 1 ? 's' : ''} to go`}
                        {p.interestRate != null && ` · ${p.interestRate}%/yr`}
                      </span>
                    </div>
                  )}
                  {nextDue && (
                    <div className={overdue ? 'due-badge overdue' : 'due-badge'}>
                      {overdue ? 'OVERDUE — was due ' : 'Next due '}
                      {formatDate(nextDue.dueDate)}
                    </div>
                  )}
                </div>
                <div className="row-actions">
                  {nextDue && (
                    <button className="btn primary" onClick={() => pay(p, nextDue.periodKey, nextDue.dueDate)}>
                      Pay {money(p.amount, p.currency)}
                    </button>
                  )}
                  <button className="btn ghost" onClick={() => startEdit(p)}>Edit</button>
                  <ConfirmButton label="Delete" onConfirm={() => dispatch({ type: 'deletePayable', id: p.id })} />
                </div>
              </div>
            )
          })
        )}

        {done.length > 0 && (
          <>
            <h3 className="section-sub">Fully paid ✓</h3>
            {done.map((p) => (
              <div key={p.id} className="list-item inactive">
                <div>
                  <strong>{p.name}</strong>{' '}
                  <span className="muted">{money(p.amount, p.currency)} — settled</span>
                </div>
                <div className="row-actions">
                  <ConfirmButton label="Remove" onConfirm={() => dispatch({ type: 'deletePayable', id: p.id })} />
                </div>
              </div>
            ))}
          </>
        )}
      </Card>
    </div>
  )
}
