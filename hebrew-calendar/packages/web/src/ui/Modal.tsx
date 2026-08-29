import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Rendered in the footer, after the content. */
  footer?: ReactNode;
  /** Optional descriptive line under the title. */
  description?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * An accessible dialog: labelled, focus-trapped, closable with Escape, and
 * restoring focus to whatever opened it. Background content is inert to
 * screen readers via `aria-modal`.
 */
export function Modal({ title, description, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  // Capture the opener during the first render, before any effect moves focus
  // into the dialog. Reading it inside the effect is wrong under StrictMode:
  // effects run twice, and by the second run the "previously focused" element
  // is the dialog's own first field, which is gone once the dialog unmounts.
  const openerRef = useRef<HTMLElement | null>(null);
  if (openerRef.current === null) {
    openerRef.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    const opener = openerRef.current;
    const node = ref.current;
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      // Keep Tab cycling inside the dialog.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      // Restore after the surrounding tree has re-rendered; focusing during
      // cleanup lands on <body> because the opener is mid-update.
      //
      // Only restore on a real unmount. StrictMode re-runs effects in
      // development while leaving the dialog in the document, and restoring
      // then would yank focus back out of a dialog that is still open.
      requestAnimationFrame(() => {
        if (node?.isConnected) return;
        if (opener?.isConnected) opener.focus();
      });
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        ref={ref}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id={titleId}>{title}</h2>
          {description && (
            <p id={descId} className="muted text-sm">
              {description}
            </p>
          )}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
