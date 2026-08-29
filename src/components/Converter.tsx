import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import { Card } from './ui'

export function Converter() {
  const { fx, refreshFx, setManualRate } = useStore()
  const [usd, setUsd] = useState('100')
  const [php, setPhp] = useState(() => (100 * fx.usdToPhp).toFixed(2))
  const [refreshing, setRefreshing] = useState(false)
  const [manual, setManual] = useState('')

  const rate = fx.usdToPhp

  // Recompute the PHP side whenever a fresh rate lands
  useEffect(() => {
    const n = Number(usd)
    if (Number.isFinite(n)) setPhp((n * rate).toFixed(2))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate])

  const fromUsd = (v: string) => {
    setUsd(v)
    const n = Number(v)
    setPhp(Number.isFinite(n) ? (n * rate).toFixed(2) : '')
  }
  const fromPhp = (v: string) => {
    setPhp(v)
    const n = Number(v)
    setUsd(Number.isFinite(n) && rate > 0 ? (n / rate).toFixed(2) : '')
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      await refreshFx()
    } finally {
      setRefreshing(false)
    }
  }

  const fetched = new Date(fx.fetchedAt)
  const isLive = fetched.getTime() > 0

  return (
    <div className="stack">
      <Card title="Currency converter — USD ↔ PHP">
        <div className="converter">
          <label className="conv-side">
            <span>🇺🇸 US Dollar</span>
            <input type="number" step="0.01" min="0" value={usd} onChange={(e) => fromUsd(e.target.value)} />
          </label>
          <div className="conv-eq">⇄</div>
          <label className="conv-side">
            <span>🇵🇭 Philippine Peso</span>
            <input type="number" step="0.01" min="0" value={php} onChange={(e) => fromPhp(e.target.value)} />
          </label>
        </div>
        <div className="conv-meta">
          <div>
            <strong>1 USD = ₱{rate.toFixed(4)}</strong>
            <span className="muted">
              {' '}· source: {fx.source}
              {isLive && <> · updated {fetched.toLocaleTimeString('en-PH')}</>}
            </span>
          </div>
          <button className="btn ghost" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : '↻ Refresh rate'}
          </button>
        </div>
        <p className="muted">
          This is the same live mid-market rate used to convert your automated USD salary into pesos and to normalize
          USD accounts, bills and analytics. It refreshes automatically every 30 minutes.
        </p>

        <h3 className="section-sub">Set the rate manually</h3>
        <p className="muted">
          If the live rate can't be fetched (offline, or blocked by your network), enter the current rate yourself —
          the whole app will use it until a live rate is available again.
        </p>
        <div className="goal-actions">
          <input
            type="number"
            step="0.0001"
            min="0"
            placeholder={`e.g. ${rate.toFixed(2)}`}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button
            className="btn ghost"
            onClick={() => {
              const r = Number(manual)
              if (r > 0) {
                setManualRate(r)
                setManual('')
              }
            }}
          >
            Use this rate
          </button>
        </div>
      </Card>
    </div>
  )
}
