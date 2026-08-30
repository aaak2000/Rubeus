import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isRestTime, type GeoPoint } from '@hcal/core';
import { api, type AdConfig } from '../api/client';

export type ConsentChoice = 'accepted' | 'rejected' | null;

interface AdsState {
  config: AdConfig | null;
  /** User's answer to personalized advertising. null = not asked yet. */
  consent: ConsentChoice;
  setConsent: (c: Exclude<ConsentChoice, null>) => void;
  /** Master switch, remembered per device. */
  adsEnabled: boolean;
  setAdsEnabled: (v: boolean) => void;
  /** True while Shabbat or a festival is in progress at the user's location. */
  resting: boolean;
  /** Everything considered: may an ad be shown right now? */
  canShowAds: boolean;
  setLocation: (geo: GeoPoint | null, il: boolean) => void;
}

const CONSENT_KEY = 'hcal_ad_consent';
const ENABLED_KEY = 'hcal_ads_enabled';
const AdsContext = createContext<AdsState | null>(null);

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice simply won't persist */
  }
}

export function AdsProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AdConfig | null>(null);
  const [consent, setConsentState] = useState<ConsentChoice>(() => {
    const v = read(CONSENT_KEY);
    return v === 'accepted' || v === 'rejected' ? v : null;
  });
  const [adsEnabled, setEnabledState] = useState(() => read(ENABLED_KEY) !== 'false');
  const [geo, setGeo] = useState<GeoPoint | null>(null);
  const [il, setIl] = useState(false);
  const [resting, setResting] = useState(false);

  useEffect(() => {
    api.adConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  // Shabbat and festivals begin and end at fixed instants, so re-evaluate on a
  // timer rather than only at mount — a session open across candle lighting
  // must stop showing ads without a reload.
  useEffect(() => {
    function evaluate() {
      setResting(isRestTime(geo, il));
    }
    evaluate();
    const timer = setInterval(evaluate, 60_000);
    return () => clearInterval(timer);
  }, [geo, il]);

  const value = useMemo<AdsState>(
    () => ({
      config,
      consent,
      setConsent: (c) => {
        setConsentState(c);
        write(CONSENT_KEY, c);
      },
      adsEnabled,
      setAdsEnabled: (v) => {
        setEnabledState(v);
        write(ENABLED_KEY, String(v));
      },
      resting,
      canShowAds: adsEnabled && !resting,
      setLocation: (g, isIl) => {
        setGeo(g);
        setIl(isIl);
      },
    }),
    [config, consent, adsEnabled, resting],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds(): AdsState {
  const ctx = useContext(AdsContext);
  if (!ctx) throw new Error('useAds must be used within AdsProvider');
  return ctx;
}
