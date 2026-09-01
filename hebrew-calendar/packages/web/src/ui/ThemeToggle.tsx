import { type ThemeChoice, useTheme } from './ThemeProvider';

const OPTIONS: Array<{ value: ThemeChoice; label: string; icon: string }> = [
  { value: 'light', label: 'בהיר', icon: '☀' },
  { value: 'system', label: 'לפי המערכת', icon: '◐' },
  { value: 'dark', label: 'כהה', icon: '☾' },
];

/** A three-way theme control rendered as a labelled radio group. */
export function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="ערכת נושא">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={choice === o.value}
          aria-label={o.label}
          title={o.label}
          className={`theme-option${choice === o.value ? ' is-active' : ''}`}
          onClick={() => setChoice(o.value)}
        >
          <span aria-hidden="true">{o.icon}</span>
        </button>
      ))}
    </div>
  );
}
