import type { ReactNode } from 'react';

/** Placeholder blocks shown while content loads, sized like the real thing. */
export function Skeleton({ width, height = 16, radius = 6 }: { width?: string | number; height?: number; radius?: number }) {
  return (
    <span
      className="skeleton"
      style={{ width: width ?? '100%', height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

/** A calm, informative stand-in when a view genuinely has nothing to show. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && (
        <div className="empty-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="empty-title">{title}</p>
      {description && <p className="empty-description">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
