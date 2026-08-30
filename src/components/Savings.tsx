import { useState } from 'react'
import type { SavingsGoal } from '../types'
import { useStore, uid } from '../store/store'
import { peso, pesoRound } from '../lib/format'
import { monthlyIncomePHP, monthlyPayablesPHP, monthlySavingsCommitmentPHP, planGoal } from '../lib/analytics'
import { formatDate } from '../lib/dates'
import { Card, ConfirmButton, Empty, Field, Progress, toast } from './ui'

const blank = { name: '', targetAmount: '', savedSoFar: '', monthlyContribution: '', targetDate: '', accountId: '' }

export function Savings() {
  const { state, dispatch, fx } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(blank)
  const [contrib, setContrib] = useState<Record<string, string>>({})

  const income = monthlyIncomePHP(state, fx.usdToPhp)
  const payables = monthlyPayablesPHP(state, fx.usdToPhp)
  const committed = monthlySavingsCommitmentPHP(state)
  const surplus = income - payables - committed

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const g: SavingsGoal = {
      id: editingId ?? uid(),
      name: form.name.trim(),
      targetAmount: Number(form.targetAmount) || 0,
      savedSoFar: Number(form.savedSoFar) || 0,
      monthlyContribution: Number(form.monthlyContribution) || 0,
      targetDate: form.targetDate || undefined,
      accountId: form.accountId || undefined,
      active: true,
    }
    if (!g.name || g.targetAmount <= 0) return
    dispatch(editingId ? { type: 'updateGoal', goal: g } : { type: 'addGoal', goal: g })
    setForm(blank)
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (g: SavingsGoal) => {
    setEditingId(g.id)
    setForm({
      name: g.name,
      targetAmount: String(g.targetAmount),
      savedSoFar: String(g.savedSoFar),
      monthlyContribution: String(g.monthlyContribution),
      targetDate: g.targetDate ?? '',
      accountId: g.accountId ?? '',
    })
    setShowForm(true)
  }

  return (
    <div className="stack">
      <Card
        title="Savings goals"
        action={
          <button className="btn primary" onClick={() => { setShowForm((s) => !s); setEditingId(null); setForm(blank) }}>
            {showForm ? 'Cancel' : '+ New goal'}
          </button>
        }
      >
        <p className="muted">
          Monthly free cash after bills & current goals: <strong className={surplus >= 0 ? 'good-text' : 'bad-text'}>{pesoRound(surplus)}</strong>
          {surplus > 0 && ' — available to raise contributions or start a new goal.'}
        </p>

        {showForm && (
          <form className="form-grid" onSubmit={submit}>
            <Field label="Goal name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Emergency fund, House down payment" required />
            </Field>
            <Field label="Target amount (PHP)">
              <input type="number" step="0.01" min="0" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} required />
            </Field>
            <Field label="Already saved (PHP)">
              <input type="number" step="0.01" min="0" value={form.savedSoFar} onChange={(e) => setForm({ ...form, savedSoFar: e.target.value })} />
            </Field>
            <Field label="Planned monthly contribution (PHP)">
              <input type="number" step="0.01" min="0" value={form.monthlyContribution} onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })} />
            </Field>
            <Field label="Target date (optional)">
              <input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
            </Field>
            <Field label="Draw contributions from (optional)">
              <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                <option value="">—</option>
                {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </Field>
            <div className="form-actions">
              <button className="btn primary" type="submit">{editingId ? 'Save changes' : 'Create goal'}</button>
            </div>
          </form>
        )}

        {state.goals.length === 0 ? (
          <Empty>No goals yet. Start with a 3-month emergency fund — it is the foundation every other goal stands on.</Empty>
        ) : (
          state.goals.map((g) => {
            const plan = planGoal(g)
            const ratio = g.targetAmount > 0 ? g.savedSoFar / g.targetAmount : 0
            const doneGoal = plan.remaining <= 0
            return (
              <div key={g.id} className="goal-item">
                <div className="goal-head">
                  <strong>{g.name}</strong>
                  <span>{peso(g.savedSoFar)} / {peso(g.targetAmount)} ({Math.min(100, ratio * 100).toFixed(0)}%)</span>
                </div>
                <Progress ratio={ratio} />
                {doneGoal ? (
                  <p className="good-text">🎉 Goal reached!</p>
                ) : (
                  <div className="goal-strategy">
                    <div className="strategy-row">
                      <span className="muted">Strategy — pick the pace that fits:</span>
                    </div>
                    <ul className="strategy-list">
                      {plan.etaMonths != null && plan.etaDate && (
                        <li>
                          <strong>Current pace:</strong> {pesoRound(g.monthlyContribution)}/mo → done in {plan.etaMonths} month{plan.etaMonths > 1 ? 's' : ''} ({formatDate(plan.etaDate)})
                        </li>
                      )}
                      {plan.requiredMonthly != null && g.targetDate && (
                        <li className={plan.onTrack ? 'good-text' : 'bad-text'}>
                          <strong>To hit {formatDate(g.targetDate)}:</strong> save {pesoRound(plan.requiredMonthly)}/mo — you are {plan.onTrack ? 'on track ✓' : `short by ${pesoRound(plan.requiredMonthly - g.monthlyContribution)}/mo`}
                        </li>
                      )}
                      {surplus > 0 && (
                        <li>
                          <strong>Aggressive:</strong> add your {pesoRound(surplus)} monthly surplus → done in{' '}
                          {Math.max(1, Math.ceil(plan.remaining / Math.max(1, g.monthlyContribution + surplus)))} month(s)
                        </li>
                      )}
                      {g.monthlyContribution === 0 && plan.etaMonths == null && (
                        <li className="bad-text">No monthly contribution set — this goal will never complete on its own. Even {pesoRound(plan.remaining / 24)}/mo finishes it in 2 years.</li>
                      )}
                    </ul>
                  </div>
                )}
                <div className="goal-actions">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`Amount (₱), e.g. ${Math.round(g.monthlyContribution) || 1000}`}
                    value={contrib[g.id] ?? ''}
                    onChange={(e) => setContrib({ ...contrib, [g.id]: e.target.value })}
                  />
                  <button
                    className="btn primary"
                    onClick={() => {
                      const amount = Number(contrib[g.id])
                      const accountId = g.accountId || state.accounts[0]?.id
                      if (!amount || amount <= 0) return
                      if (!accountId) { toast('Add an account first to draw the contribution from.'); return }
                      dispatch({ type: 'contribute', goalId: g.id, amount, accountId, rate: fx.usdToPhp })
                      setContrib({ ...contrib, [g.id]: '' })
                    }}
                  >
                    Add to savings
                  </button>
                  <button className="btn ghost" onClick={() => startEdit(g)}>Edit</button>
                  <ConfirmButton label="Delete" onConfirm={() => dispatch({ type: 'deleteGoal', id: g.id })} />
                </div>
              </div>
            )
          })
        )}
      </Card>
    </div>
  )
}
