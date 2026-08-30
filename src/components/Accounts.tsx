import { useState } from 'react'
import type { Account, AccountType, Currency } from '../types'
import { useStore, uid } from '../store/store'
import { money, peso } from '../lib/format'
import { accountBalancePHP, totalCashPHP } from '../lib/analytics'
import { Card, ConfirmButton, Empty, Field, ScrollIntoView } from './ui'

const TYPE_LABEL: Record<AccountType, string> = {
  bank: 'Bank',
  ewallet: 'E-wallet',
  cash: 'Cash',
  investment: 'Investment',
  other: 'Other',
}

const blank = { name: '', institution: '', type: 'bank' as AccountType, currency: 'PHP' as Currency, balance: '' }

export function Accounts() {
  const { state, dispatch, fx } = useStore()
  const [form, setForm] = useState(blank)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const account: Account = {
      id: editingId ?? uid(),
      name: form.name.trim(),
      institution: form.institution.trim(),
      type: form.type,
      currency: form.currency,
      balance: Number(form.balance) || 0,
    }
    if (!account.name) return
    dispatch(editingId ? { type: 'updateAccount', account } : { type: 'addAccount', account })
    setForm(blank)
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (a: Account) => {
    setEditingId(a.id)
    setForm({ name: a.name, institution: a.institution, type: a.type, currency: a.currency, balance: String(a.balance) })
    setShowForm(true)
  }

  return (
    <div className="stack">
      <Card
        title="Accounts & money sources"
        action={
          <button className="btn primary" onClick={() => { setShowForm((s) => !s); setEditingId(null); setForm(blank) }}>
            {showForm ? 'Cancel' : '+ Add account'}
          </button>
        }
      >
        <p className="muted">
          Total across all sources: <strong>{peso(totalCashPHP(state.accounts, fx.usdToPhp))}</strong>
          {' '}(USD balances converted at ₱{fx.usdToPhp.toFixed(2)})
        </p>

        {showForm && <ScrollIntoView trigger={editingId} />}
        {showForm && (
          <form className="form-grid" onSubmit={submit}>
            <Field label="Account name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. BPI Payroll" required />
            </Field>
            <Field label="Bank / provider">
              <input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder="e.g. BPI, GCash, Wise" />
            </Field>
            <Field label="Type">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Currency">
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
                <option value="PHP">PHP ₱</option>
                <option value="USD">USD $</option>
              </select>
            </Field>
            <Field label="Current balance">
              <input type="number" step="0.01" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} placeholder="0.00" />
            </Field>
            <div className="form-actions">
              <button className="btn primary" type="submit">{editingId ? 'Save changes' : 'Add account'}</button>
            </div>
          </form>
        )}

        {state.accounts.length === 0 ? (
          <Empty>No accounts yet. Add your banks, e-wallets and cash so every peso is tracked in one place.</Empty>
        ) : (
          <table className="table cards">
            <thead>
              <tr><th>Account</th><th>Type</th><th className="num">Balance</th><th className="num">≈ PHP</th><th /></tr>
            </thead>
            <tbody>
              {state.accounts.map((a) => (
                <tr key={a.id}>
                  <td className="card-title"><strong>{a.name}</strong>{a.institution && <span className="muted"> · {a.institution}</span>}</td>
                  <td data-label="Type"><span className="chip">{TYPE_LABEL[a.type]}</span> <span className="chip">{a.currency}</span></td>
                  <td className="num" data-label="Balance">{money(a.balance, a.currency)}</td>
                  <td className="num muted" data-label="≈ PHP">{peso(accountBalancePHP(a, fx.usdToPhp))}</td>
                  <td className="row-actions">
                    <button className="btn ghost" onClick={() => startEdit(a)}>Edit</button>
                    <ConfirmButton
                      label="Delete"
                      title="Transactions stay in history"
                      onConfirm={() => dispatch({ type: 'deleteAccount', id: a.id })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
