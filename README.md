# 💸 PesoWise — every peso, tracked

A personal budget tracker built for people who earn in **USD** but live in **PHP**. Track all your money across banks and e-wallets, automate your salary with real-time currency conversion, stay on top of bills and loans, hit your savings goals, and see exactly when you'll be payment-free.

## Features

### 🏦 Multi-source money tracking
- Track balances across banks, e-wallets (GCash, Maya), cash, and investment accounts
- Accounts can be in **PHP or USD** — everything is normalized to PHP at the live rate for totals and analytics

### 💵 Automated income (the USD-salary scenario)
- Set up salary once: amount, currency, payday, and destination account
- Frequencies: monthly, twice a month (kinsenas), every 2 weeks, weekly
- On payday, PesoWise **automatically deposits** the salary — a **USD salary is converted to PHP at the real-time rate on the day it lands**, and the exact rate used is recorded on the transaction
- Catch-up logic: paydays that passed while the app was closed are posted when you open it
- "Run now" button for manual off-cycle payouts

### 💱 Real-time USD ↔ PHP converter
- In-app converter using the live mid-market rate (open.er-api.com, with frankfurter.dev as backup)
- Rate auto-refreshes every 30 minutes; falls back to the last known rate offline
- The same rate powers salary conversion, USD bills, and all analytics

### 🧾 Bills, loans & expenses
- **One-time payments** with a due date
- **Monthly payments** with a due day (and optional end date)
- **Loans** with total payable, amount paid so far, and interest rate — with payoff progress bars and "N payments to go"
- Overdue detection, pay-from-any-account, quick expense logging with categories

### 🐷 Savings goals + strategies
- Goals with target amount, target date, and planned monthly contribution
- Per-goal strategy analysis: ETA at current pace, **required monthly amount to hit your target date**, on-track/behind status, and an aggressive plan using your monthly surplus

### 📈 Projections & analytics
- **How much you still need to pay in total** (one-time dues + loan balances + 12 months of bills)
- **Monthly net**: income − payables − savings
- **Payment-free date**: when every loan and dated bill is settled
- 12-month cash-on-hand projection (chart + table)
- Per-loan payoff timelines and spending-by-category breakdown

### 🧠 Advisor — save better, pay better
Rule-based recommendations recomputed live from your data:
- Overspending alerts (commitments > income)
- Emergency fund coverage (3–6 months benchmark)
- **Debt avalanche**: which loan to attack first by interest rate
- 50/30/20 savings-rate check with a concrete peso amount to move
- Due/overdue payment reminders
- USD-earner tips (conversion spreads, hedging)
- Behind-schedule goal warnings

### Extras
- 📦 One-click JSON backup & restore
- 🔒 All data stays in your browser (localStorage) — nothing is sent anywhere except the exchange-rate lookup
- 📱 Responsive dark UI

## Getting started

```bash
npm install
npm run dev      # development server
npm run build    # production build → dist/
npm run preview  # serve the production build
```

## Tech

React 19 + TypeScript + Vite. No backend, no database — state is a single reducer persisted to localStorage, with live FX from two free public APIs.
