import Icon from './Icon';

/**
 * Hassan Electronics brand mark.
 *
 * The hamburger button is the sidebar rail toggle — clicking it
 * collapses/expands the sidebar.
 *  - Expanded: hamburger sits in front of the "Hassan Electronics" label.
 *  - Collapsed (rail): hamburger is the only thing visible at the top of
 *    the sidebar, sized like a nav-item icon.
 */
export default function Brand({ onToggleRail, rail }) {
  return (
    <div className="brand">
      <button
        type="button"
        className="brand-toggle"
        onClick={onToggleRail}
        aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
        title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <Icon name="menu" size={18} />
      </button>
      <div className="brand-text">
        <div className="brand-name">Hassan Electronics</div>
      </div>
    </div>
  );
}
