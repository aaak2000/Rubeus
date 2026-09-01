import { useEffect, useRef, useState } from 'react';
import { api, type ServedAd } from '../api/client';
import { Button } from '../ui';

interface Props {
  ad: ServedAd;
  onDismiss: () => void;
}

/** Seconds before the close button becomes active. */
const HOLD_SECONDS = 3;

/**
 * A full-screen ad shown between screens.
 *
 * Deliberately constrained: it is labelled as advertising, names the
 * advertiser, traps focus like any dialog, closes with Escape, and always
 * offers a visible way out. The short delay before closing is capped at a few
 * seconds and the button is present (disabled, with a countdown) the whole
 * time, so the exit is never hidden.
 *
 * House inventory only. Network creatives are not shown here: Google requires
 * its own tags for interstitial formats, so wrapping them in this dialog would
 * breach publisher policy.
 */
export function InterstitialAd({ ad, onDismiss }: Props) {
  const [remaining, setRemaining] = useState(HOLD_SECONDS);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setRemaining((r) => (r <= 1 ? 0 : r - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = Array.from(
        ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
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
      requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, [onDismiss]);

  async function open() {
    try {
      const { targetUrl } = await api.adClick(ad.id);
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(ad.targetUrl, '_blank', 'noopener,noreferrer');
    }
    onDismiss();
  }

  return (
    <div className="ad-interstitial-backdrop">
      <div
        className="ad-interstitial"
        role="dialog"
        aria-modal="true"
        aria-label={`מודעה מאת ${ad.advertiser}`}
        ref={ref}
      >
        <div className="ad-head">
          <span className="ad-badge">מודעה</span>
          <span className="ad-advertiser">{ad.advertiser}</span>
          <span className="spacer" />
          <Button
            ref={closeRef}
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            disabled={remaining > 0}
            aria-label={remaining > 0 ? `אפשר לסגור בעוד ${remaining} שניות` : 'סגירת המודעה'}
          >
            {remaining > 0 ? `סגירה (${remaining})` : 'סגירה ✕'}
          </Button>
        </div>

        <div className="ad-body">
          {ad.imageUrl && <img className="ad-image" src={ad.imageUrl} alt="" />}
          <h2 className="ad-title">{ad.title}</h2>
          {ad.body && <p className="ad-text">{ad.body}</p>}
        </div>

        <div className="ad-foot">
          <Button variant="primary" onClick={open}>
            לפרטים נוספים
          </Button>
          <p className="ad-note">המודעות נבחרות מראש ומותאמות לקהל, ואינן מוצגות בשבת ובחג.</p>
        </div>
      </div>
    </div>
  );
}
