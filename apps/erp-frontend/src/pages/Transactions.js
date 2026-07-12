import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

const groups = [
  {
    label: 'Sales',
    desc: 'Outgoing — goods leaving the shop',
    tiles: [
      {
        to: '/sales',
        label: 'Sales History',
        icon: 'cart',
        color: 'var(--primary)',
        desc: 'POS-generated sale invoices',
      },
      {
        to: '/sale-returns',
        label: 'Sale Returns',
        icon: 'rotate',
        color: 'var(--tile-stores)',
        desc: 'Goods returned by customers',
      },
    ],
  },
  {
    label: 'Purchases',
    desc: 'Incoming — stock arriving from suppliers',
    tiles: [
      {
        to: '/purchases',
        label: 'Purchases',
        icon: 'package',
        color: 'var(--tile-categories)',
        desc: 'Stock received from suppliers',
      },
      {
        to: '/purchase-returns',
        label: 'Purchase Returns',
        icon: 'packageX',
        color: 'var(--tile-suppliers)',
        desc: 'Goods returned to suppliers',
      },
    ],
  },
  {
    label: 'Money',
    desc: 'Payment vouchers settling outstanding ledger balances',
    tiles: [
      {
        to: '/receipts',
        label: 'Receipts',
        icon: 'arrowDownCircle',
        color: 'var(--tile-customers)',
        desc: 'Money received from customers',
      },
      {
        to: '/payments',
        label: 'Payments',
        icon: 'arrowUpCircle',
        color: 'var(--tile-items)',
        desc: 'Money paid to suppliers',
      },
    ],
  },
  {
    label: 'Treasury',
    desc: 'Moving your own money between accounts — Capital ↔ Cash ↔ Bank ↔ Credit',
    tiles: [
      {
        to: '/fund-transfers',
        label: 'Fund Transfers',
        icon: 'swap',
        color: 'var(--tile-accounts)',
        desc: 'Transfer between Capital / Cash / Bank / Wallet / Credit accounts',
      },
    ],
  },
  {
    label: 'Staff',
    desc: 'Pay employees — salary, advances, reimbursements, expenses, incentive payouts',
    tiles: [
      {
        to: '/employee-payments',
        label: 'Employee Payments',
        icon: 'user',
        color: '#818cf8',
        desc: 'Salary, advances, reimbursements, expenses, incentive payouts',
      },
    ],
  },
];

export default function Transactions() {
  return (
    <>
      <div className="page-header">
        <h2>Transactions</h2>
      </div>

      {groups.map((g) => (
        <section key={g.label} style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>{g.label}</h3>
            <div className="muted" style={{ fontSize: 13 }}>
              {g.desc}
            </div>
          </div>
          <div className="tile-grid" style={{ marginBottom: 0 }}>
            {g.tiles.map((t) => (
              <Link key={t.to} to={t.to} className="tile tile-link">
                <span
                  className="tile-icon"
                  style={{ background: t.color }}
                  aria-hidden
                >
                  <Icon name={t.icon} size={22} />
                </span>
                <span className="tile-label">{t.label}</span>
                <span className="tile-desc">{t.desc}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
