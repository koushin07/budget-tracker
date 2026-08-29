import { useStore } from '../store/store'
import { recommendations, spendingByCategory } from '../lib/analytics'
import { pesoRound } from '../lib/format'
import { Card, Empty } from './ui'

const ICON = { critical: '🚨', warning: '⚠️', tip: '💡' } as const

export function Advisor() {
  const { state, fx } = useStore()
  const recs = recommendations(state, fx.usdToPhp)
  const byCategory = spendingByCategory(state.transactions, 30)
  const total = [...byCategory.values()].reduce((a, b) => a + b, 0)

  return (
    <div className="stack">
      <Card title="Advisor — how to save better & pay better">
        <p className="muted">
          Personalized, rule-based recommendations recomputed from your live numbers. Priorities follow the standard order:
          essentials → minimum debt payments → emergency fund → high-interest debt → goals.
        </p>
        {recs.map((r, i) => (
          <div key={i} className={`rec ${r.severity}`}>
            <div className="rec-title">{ICON[r.severity]} {r.title}</div>
            <div className="rec-detail">{r.detail}</div>
          </div>
        ))}
      </Card>

      <Card title="Where your money went — last 30 days">
        {byCategory.size === 0 ? (
          <Empty>No expenses recorded yet. Pay a bill or log an expense and the breakdown appears here.</Empty>
        ) : (
          <div className="cat-bars">
            {[...byCategory.entries()].map(([cat, amt]) => (
              <div key={cat} className="cat-row">
                <span className="cat-name">{cat}</span>
                <div className="cat-bar-track">
                  <div className="cat-bar" style={{ width: `${(amt / (total || 1)) * 100}%` }} />
                </div>
                <span className="cat-amt">{pesoRound(amt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
