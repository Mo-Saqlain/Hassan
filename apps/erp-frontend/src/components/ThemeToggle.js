import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="btn btn-sm btn-icon btn-ghost"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`${isDark ? 'Light' : 'Dark'} mode`}
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={16} />
    </button>
  );
}
