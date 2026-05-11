import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

const tiles = [
  { to: '/sales',             label: 'Sales History',    icon: 'cart',             color: 'var(--primary)',          desc: 'POS-generated sale invoices' },
  { to: '/sale-returns',      label: 'Sale Returns',     icon: 'rotate',           color: 'var(--tile-stores)',      desc: 'Goods returned by customers' },
  { to: '/purchases',         label: 'Purchases',        icon: 'package',          color: 'var(--tile-categories)',  desc: 'Stock received from suppliers' },
  { to: '/purchase-returns',  label: 'Purchase Returns', icon: 'packageX',         color: 'var(--tile-suppliers)',   desc: 'Goods returned to suppliers' },
  { to: '/receipts',          label: 'Receipts',         icon: 'arrowDownCircle',  color: 'var(--tile-customers)',   desc: 'Money received from customers' },
  { to: '/payments',          label: 'Payments',         icon: 'arrowUpCircle',    color: 'var(--tile-items)',       desc: 'Money paid to suppliers' },
];

export default function Transactions() {
  return (
    <>
      <div className="page-header">
        <h2>Transactions</h2>
      </div>

      <div className="tile-grid">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="tile tile-link">
            <span className="tile-icon" style={{ background: t.color }} aria-hidden>
              <Icon name={t.icon} size={22} />
            </span>
            <span className="tile-label">{t.label}</span>
            <span className="tile-desc">{t.desc}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
