import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, type ServedAd } from '../api/client';
import { useAds } from './AdsProvider';

const STATE_KEY = 'hcal_interstitial_state';

interface Pacing {
  /** Navigations since the last interstitial. */
  navigations: number;
  /** Epoch ms of the last interstitial shown. */
  lastShownAt: number;
  /** Local date (YYYY-MM-DD) the counter below belongs to. */
  day: string;
  shownToday: number;
}

function readPacing(): Pacing {
  const fallback: Pacing = { navigations: 0, lastShownAt: 0, day: '', shownToday: 0 };
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Pacing>) } : fallback;
  } catch {
    return fallback;
  }
}
function writePacing(p: Pacing): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(p));
  } catch {
    /* nothing to do if storage is unavailable */
  }
}

/**
 * Decides when an interstitial may appear on navigation.
 *
 * The rules exist to keep the format from becoming hostile: a minimum number
 * of navigations, a cooling-off period, a daily ceiling, and never on the
 * first navigation of a session. `suppressed` lets a caller veto entirely —
 * used so an ad can never interrupt a task in progress.
 */
export function useInterstitial(suppressed: boolean) {
  const { config, canShowAds, consent } = useAds();
  const location = useLocation();
  const [ad, setAd] = useState<ServedAd | null>(null);
  const pacing = useRef<Pacing>(readPacing());
  const firstNavigation = useRef(true);
  const inFlight = useRef(false);

  const dismiss = useCallback(() => setAd(null), []);

  // location.key is the trigger rather than a value the body reads: it changes
  // on every navigation, which is exactly when this effect must run. Removing
  // it, as the rule suggests, would stop interstitials appearing at all.
  // biome-ignore lint/correctness/useExhaustiveDependencies: location.key is the navigation trigger
  useEffect(() => {
    // The navigation that mounts the app is not a transition the user made.
    if (firstNavigation.current) {
      firstNavigation.current = false;
      return;
    }
    // Never pre-empt the consent decision: a full-screen ad covering the
    // banner would leave the user unable to answer it at all.
    if (consent === null) return;
    if (!config || !canShowAds || suppressed || ad || inFlight.current) return;

    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const state = pacing.current;
    if (state.day !== today) {
      state.day = today;
      state.shownToday = 0;
    }
    state.navigations += 1;

    const { minNavigations, minMinutesBetween, maxPerDay } = config.interstitial;
    const enoughNavigations = state.navigations >= minNavigations;
    const cooledDown = now - state.lastShownAt >= minMinutesBetween * 60_000;
    const underDailyCap = state.shownToday < maxPerDay;

    if (!(enoughNavigations && cooledDown && underDailyCap)) {
      writePacing(state);
      return;
    }

    inFlight.current = true;
    api
      .nextAd('interstitial')
      .then(({ ad: served }) => {
        if (!served) return;
        setAd(served);
        state.navigations = 0;
        state.lastShownAt = Date.now();
        state.shownToday += 1;
      })
      .catch(() => {
        // An ad that fails to load is never worth surfacing to the user.
      })
      .finally(() => {
        inFlight.current = false;
        writePacing(state);
      });
  }, [location.key, config, canShowAds, consent, suppressed, ad]);

  return { ad, dismiss };
}
