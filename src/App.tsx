import { useRef, useState } from 'react'
import { StoreProvider, useStore } from './store/store'
import { Dashboard } from './components/Dashboard'
import { Accounts } from './components/Accounts'
import { Income } from './components/Income'
import { Payables } from './components/Payables'
import { Savings } from './components/Savings'
import { Projections } from './components/Projections'
import { Advisor } from './components/Advisor'
import { Converter } from './components/Converter'
import { toast } from './components/ui'

const TABS = [
  { id: 'dashboard', label: '📊 Dashboard', el: <Dashboard /> },
  { id: 'accounts', label: '🏦 Accounts', el: <Accounts /> },
  { id: 'income', label: '💵 Income', el: <Income /> },
  { id: 'payables', label: '🧾 Bills & Loans', el: <Payables /> },
  { id: 'savings', label: '🐷 Savings', el: <Savings /> },
  { id: 'projections', label: '📈 Projections', el: <Projections /> },
  { id: 'advisor', label: '🧠 Advisor', el: <Advisor /> },
  { id: 'converter', label: '💱 Converter', el: <Converter /> },
] as const

function Shell() {
  const { fx, exportData, importData } = useStore()
  const [tab, setTab] = useState<string>('dashboard')
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">₱</span>
          <div>
            <h1>PesoWise</h1>
            <span className="tagline">every peso, tracked</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className="rate-badge" title={`Rate source: ${fx.source}`}>
            $1 = ₱{fx.usdToPhp.toFixed(2)} <span className="live-dot" />
          </span>
          <button className="btn ghost" onClick={exportData} title="Download all your data as JSON">⬇ Backup</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()} title="Restore from a backup file">⬆ Restore</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                await importData(f)
                toast('Backup restored.')
              } catch (err) {
                toast(`Could not restore: ${err instanceof Error ? err.message : 'invalid file'}`)
              } finally {
                e.target.value = ''
              }
            }}
          />
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">{TABS.find((t) => t.id === tab)?.el}</main>

      <footer className="footer muted">
        Data lives only in this browser (localStorage) — use Backup to keep a copy. Live USD/PHP rate refreshes every 30 min.
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
