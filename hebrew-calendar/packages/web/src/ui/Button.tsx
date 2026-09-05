import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Renders a spinner and blocks interaction. */
  loading?: boolean;
  /** Square icon-only button; `aria-label` becomes required in practice. */
  iconOnly?: boolean;
  children?: ReactNode;
}

/** Forwards its ref so callers can move focus to it — dialogs need this. */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    iconOnly = false,
    disabled,
    className = '',
    children,
    ...rest
  },
  ref,
) {
  const classes = ['btn', `btn-${variant}`, `btn-${size}`, iconOnly ? 'btn-icon' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});
