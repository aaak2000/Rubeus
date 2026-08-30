import { useEffect, useRef, useState } from 'react';
import { api, type ServedAd } from '../api/client';
import { useAds } from './AdsProvider';

/**
 * A modest in-page slot.
 *
 * House inventory is preferred; when none is booked and a network is
 * configured, the slot falls back to it. Unlike the interstitial this is a
 * standard in-page placement, which is what network policies permit.
 *
 * The slot reserves its height before anything loads so arriving content never
 * pushes the page around.
 */
export function InlineAd({ label = 'מודעה' }: { label?: string }) {
  const { config, consent, canShowAds } = useAds();
  const [ad, setAd] = useState<ServedAd | null>(null);
  const [tried, setTried] = useState(false);
  const networkRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (!canShowAds || tried) return;
    setTried(true);
    api
      .nextAd('inline')
      .then(({ ad: served }) => setAd(served))
      .catch(() => setAd(null));
  }, [canShowAds, tried]);

  useEffect(() => {
    if (ad || !canShowAds || !config?.network.enabled || !networkRef.current) return;
    // Network fill runs only when there is no booked house ad. Personalization
    // follows the user's stated choice rather than defaulting to on.
    const w = window as unknown as { adsbygoogle?: unknown[] };
    try {
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({ requestNonPersonalizedAds: consent === 'accepted' ? 0 : 1 });
    } catch {
      /* the slot simply stays empty */
    }
  }, [ad, canShowAds, config, consent]);

  if (!canShowAds) return null;

  return (
    <aside className="ad-inline" aria-label={label}>
      <span className="ad-badge">{label}</span>
      {ad ? (
        <a className="ad-inline-body" href={ad.targetUrl} target="_blank" rel="noopener noreferrer nofollow sponsored">
          {ad.imageUrl && <img className="ad-inline-image" src={ad.imageUrl} alt="" />}
          <span className="ad-inline-text">
            <span className="ad-inline-title">{ad.title}</span>
            {ad.body && <span className="ad-inline-sub">{ad.body}</span>}
            <span className="ad-inline-advertiser">{ad.advertiser}</span>
          </span>
        </a>
      ) : config?.network.enabled ? (
        <ins
          ref={networkRef}
          className="adsbygoogle ad-inline-network"
          style={{ display: 'block' }}
          data-ad-client={config.network.clientId ?? undefined}
          data-ad-format="fluid"
          data-full-width-responsive="true"
        />
      ) : (
        <p className="ad-inline-empty muted text-xs">מקום שמור למודעה</p>
      )}
    </aside>
  );
}
