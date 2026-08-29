import { useId } from 'react';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Optional hint rendered under the label. */
  hint?: string;
  disabled?: boolean;
}

/**
 * A labelled toggle built on a native checkbox, so keyboard interaction and
 * screen-reader semantics come for free and the visual is purely CSS.
 */
export function Switch({ checked, onChange, label, hint, disabled }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="switch-row">
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="switch-input"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="switch-label">
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        <span className="switch-text">
          {label}
          {hint && (
            <span id={hintId} className="switch-hint">
              {hint}
            </span>
          )}
        </span>
      </label>
    </div>
  );
}
