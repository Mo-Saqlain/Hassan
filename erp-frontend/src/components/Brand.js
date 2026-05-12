import Icon from './Icon';

/**
 * Hassan Electronics brand mark.
 *
 * The 38×38 gradient chip is also the sidebar rail toggle — clicking it
 * collapses/expands the sidebar. The chip renders a hamburger ("menu")
 * icon so its purpose as a toggle is obvious in both states.
 */
export default function Brand({ onToggleRail, rail }) {
  return (
    <div className="brand">
      <button
        type="button"
        className="brand-mark"
        onClick={onToggleRail}
        aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
        title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <Icon name="menu" size={20} />
      </button>
      <div className="brand-text">
        <div className="brand-name">Hassan Electronics</div>
        <div className="brand-sub">Home Appliances · ERP</div>
      </div>
    </div>
  );
}
