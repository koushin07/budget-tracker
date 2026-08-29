import { useStore } from '../store/store'
import { money, pesoRound } from '../lib/format'
import {
  debtFreeDate,
  loanMonthsLeft,
  loanRemaining,
  monthlyIncomePHP,
  monthlyPayablesPHP,
  monthlySavingsCommitmentPHP,
  projectMonths,
  totalOutstandingPHP,
} from '../lib/analytics'
import { addMonthsKeepDay, formatDate, formatMonth, todayISO } from '../lib/dates'
import { Card, Empty, Stat } from './ui'

function CashChart({ points }: { points: { month: string; value: number }[] }) {
  if (points.length === 0) return null
  const W = 720
  const H = 220
  const pad = { l: 70, r: 16, t: 16, b: 28 }
  const values = points.map((p) => p.value)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const zeroY = y(0)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Projected cash over the next 12 months">
      <line x1={pad.l} y1={zeroY} x2={W - pad.r} y2={zeroY} className="chart-zero" />
      <path d={path} className="chart-line" fill="none" />
      {points.map((p, i) => (
        <g key={p.month}>
          <circle cx={x(i)} cy={y(p.value)} r="3" className={p.value < 0 ? 'chart-dot bad' : 'chart-dot'} />
          {(i === 0 || i === points.length - 1 || i % 3 === 0) && (
            <text x={x(i)} y={H - 8} textAnchor="middle" className="chart-tick">{p.month.slice(5)}</text>
          )}
        </g>
      ))}
      <text x={pad.l - 8} y={y(max) + 4} textAnchor="end" className="chart-tick">{pesoRound(max)}</text>
      <text x={pad.l - 8} y={zeroY + 4} textAnchor="end" className="chart-tick">₱0</text>
      {min < 0 && <text x={pad.l - 8} y={y(min) + 4} textAnchor="end" className="chart-tick">{pesoRound(min)}</text>}
    </svg>
  )
}

export function Projections() {
  const { state, fx } = useStore()
  const rate = fx.usdToPhp
  const income = monthlyIncomePHP(state, rate)
  const payables = monthlyPayablesPHP(state, rate)
  const savings = monthlySavingsCommitmentPHP(state)
  const net = income - payables - savings
  const outstanding = totalOutstandingPHP(state, rate)
  const freeDate = debtFreeDate(state)
  const projection = projectMonths(state, rate, 12)
  const loans = state.payables.filter((p) => p.active && p.kind === 'loan' && p.totalPayable != null)

  const hasData = state.incomeRules.length > 0 || state.payables.length > 0 || state.accounts.length > 0

  return (
    <div className="stack">
      <Card title="Projections & analytics">
        {!hasData ? (
          <Empty>Add accounts, income and payables first — projections are computed from them.</Empty>
        ) : (
          <>
            <div className="stat-grid">
              <Stat
                label="Total still to pay"
                value={pesoRound(outstanding)}
                sub="one-time dues + loan balances + 12 months of recurring bills"
                tone="bad"
              />
              <Stat
                label="Monthly net (income − payables − savings)"
                value={pesoRound(net)}
                sub={`${pesoRound(income)} in · ${pesoRound(payables)} bills · ${pesoRound(savings)} saved`}
                tone={net >= 0 ? 'good' : 'bad'}
              />
              <Stat
                label="Payment-free date"
                value={freeDate ? formatDate(freeDate) : '— none owed'}
                sub={freeDate ? 'when every loan and dated bill is fully settled' : 'no loans or dated payables outstanding'}
                tone={freeDate ? 'neutral' : 'good'}
              />
            </div>

            <h3 className="section-sub">Projected cash on hand — next 12 months</h3>
            <p className="muted">Assumes income keeps landing, all bills are paid on time, and planned savings contributions happen. USD converted at ₱{rate.toFixed(2)}.</p>
            <CashChart points={projection.map((m) => ({ month: m.month, value: m.cumulativeCashPHP }))} />

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Month</th><th className="num">Income</th><th className="num">Payables</th><th className="num">Savings</th><th className="num">Net</th><th className="num">Cash after</th></tr>
                </thead>
                <tbody>
                  {projection.map((m) => (
                    <tr key={m.month}>
                      <td>{formatMonth(m.month)}</td>
                      <td className="num good-text">{pesoRound(m.incomePHP)}</td>
                      <td className="num bad-text">{pesoRound(m.payablesPHP)}</td>
                      <td className="num">{pesoRound(m.savingsPHP)}</td>
                      <td className={`num ${m.netPHP >= 0 ? 'good-text' : 'bad-text'}`}>{pesoRound(m.netPHP)}</td>
                      <td className={`num ${m.cumulativeCashPHP >= 0 ? '' : 'bad-text'}`}><strong>{pesoRound(m.cumulativeCashPHP)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {loans.length > 0 && (
              <>
                <h3 className="section-sub">Loan payoff timeline</h3>
                {loans.map((l) => {
                  const monthsLeft = loanMonthsLeft(l) ?? 0
                  const payoff = monthsLeft > 0 ? addMonthsKeepDay(todayISO(), monthsLeft, l.dueDay ?? 1) : null
                  return (
                    <div key={l.id} className="list-item">
                      <div>
                        <strong>{l.name}</strong>
                        <div className="muted">
                          {money(loanRemaining(l), l.currency)} remaining · {money(l.amount, l.currency)}/month
                          {l.interestRate != null && ` · ${l.interestRate}%/yr`}
                        </div>
                      </div>
                      <div className="num">
                        {payoff ? (
                          <>
                            <strong>{monthsLeft} payments left</strong>
                            <div className="muted">free on {formatDate(payoff)}</div>
                          </>
                        ) : (
                          <strong className="good-text">Paid off ✓</strong>
                        )}
                      </div>
                    </div>
                  )
                })}
                {net > 0 && (
                  <p className="muted tip-box">
                    💡 Putting your {pesoRound(net)} monthly surplus toward the highest-interest loan would shorten these timelines — see the Advisor tab for the exact order.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
