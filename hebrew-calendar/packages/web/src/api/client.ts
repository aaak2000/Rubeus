const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const ACCESS_KEY = 'hcal_access';
const REFRESH_KEY = 'hcal_refresh';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function raw<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (tokenStore.access) headers.set('Authorization', `Bearer ${tokenStore.access}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401 && retry && tokenStore.refresh) {
    const refreshed = await tryRefresh();
    if (refreshed) return raw<T>(path, init, false);
  }
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text).message as string) ?? text;
    } catch {
      /* keep raw text */
    }
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokenStore.refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as AuthResponse;
    tokenStore.set(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// --- typed response shapes ---
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; displayName: string | null };
}
export interface SyncItemError {
  phase: 'pull' | 'push';
  id?: string;
  message: string;
}
export interface SyncResult {
  pulledCreated: number;
  pulledUpdated: number;
  pulledDeleted: number;
  pushedCreated: number;
  pushedUpdated: number;
  pushedDeleted: number;
  conflicts: number;
  /** Per-item failures that did not abort the run. */
  errors: SyncItemError[];
}
export interface Calendar {
  id: string;
  name: string;
  color: string | null;
  isDefault: boolean;
  connectionId: string | null;
}
export interface EventInstance {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  isOccurrence: boolean;
  /** Civil calendar day in the user's timezone (YYYY-MM-DD), resolved server-side. */
  localDate: string;
  /**
   * The day this belongs to on the Hebrew calendar. After sunset the Hebrew
   * day has already turned, so this is the day *after* `localDate`.
   */
  hebrewDay: string;
  /** True when the two differ — the event falls in the evening. */
  isEvening: boolean;
  hebrewRecurrence: string | null;
  hebrew: { text: string; monthName: string; day: number; year: number };
}
export interface CalendarItem {
  date: string;
  desc: string;
  title: string;
  titleHe: string;
  categories: string[];
  emoji?: string;
  time?: string;
}
export interface Yahrzeit {
  id: string;
  name: string;
  hebrewName: string | null;
  relation: string | null;
  /** Gregorian date of death, YYYY-MM-DD. */
  deathDate: string;
  /** Death after sunset puts the Hebrew date — and the observance — a day on. */
  afterSunset: boolean;
  note: string | null;
  remindDaysBefore: number[];
  hebrewDateText: string;
  next: {
    gregorian: string;
    hebrewText: string;
    hebrewYearText: string;
    hebrewYear: number;
    daysUntil: number;
    /** Nightfall the evening before — when the memorial candle is lit. */
    candleAt: string | null;
    candleDate: string;
  } | null;
}
export interface YahrzeitInput {
  name: string;
  hebrewName?: string;
  relation?: string;
  deathDate: string;
  afterSunset?: boolean;
  note?: string;
  remindDaysBefore?: number[];
}
export interface BillingStatus {
  /** Whether ads should be suppressed for this user right now. */
  adFree: boolean;
  status: 'active' | 'trialing' | 'pastDue' | 'canceled' | 'expired' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plan: { priceCents: number; currency: string; interval: 'month' };
  /** False when the deployment has no billing provider configured. */
  checkoutAvailable: boolean;
}
export interface CheckoutInfo {
  provider: string;
  priceId: string;
  clientToken: string | null;
  environment: string;
  email: string;
}
export interface NotificationConfig {
  push: { enabled: boolean; publicKey: string | null };
  email: { enabled: boolean };
}
export interface AdConfig {
  network: { enabled: boolean; provider: 'adsense' | null; clientId: string | null };
  interstitial: { minNavigations: number; minMinutesBetween: number; maxPerDay: number };
}
export interface ServedAd {
  id: string;
  advertiser: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  targetUrl: string;
}
export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  settings: {
    il: boolean;
    latitude: number | null;
    longitude: number | null;
    tzid: string;
    candleMinutes: number;
    locale: string;
  } | null;
  connections: { id: string; provider: string; accountEmail: string | null }[];
}

export const api = {
  register: (email: string, password: string, displayName?: string) =>
    raw<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) }),
  login: (email: string, password: string) =>
    raw<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  profile: () => raw<Profile>('/me', { method: 'GET' }),
  updateSettings: (settings: Partial<Profile['settings']>) =>
    raw('/me/settings', { method: 'PATCH', body: JSON.stringify(settings) }),

  calendars: () => raw<Calendar[]>('/calendars', { method: 'GET' }),

  events: (calendarId: string, start: string, end: string) =>
    raw<EventInstance[]>(`/calendars/${calendarId}/events?start=${start}&end=${end}`, { method: 'GET' }),
  createEvent: (calendarId: string, body: Record<string, unknown>) =>
    raw<EventInstance>(`/calendars/${calendarId}/events`, { method: 'POST', body: JSON.stringify(body) }),
  updateEvent: (calendarId: string, id: string, body: Record<string, unknown>) =>
    raw<EventInstance>(`/calendars/${calendarId}/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEvent: (calendarId: string, id: string) =>
    raw(`/calendars/${calendarId}/events/${id}`, { method: 'DELETE' }),

  holidays: (year: number, month: number, il: boolean) =>
    raw<CalendarItem[]>(`/hebrew/holidays?year=${year}&month=${month}&il=${il}&locale=he`, { method: 'GET' }),
  zmanim: (date: string, lat: number, lon: number, tzid: string) =>
    raw<{ times: Record<string, string | null> }>(
      `/hebrew/zmanim?date=${date}&lat=${lat}&lon=${lon}&tzid=${encodeURIComponent(tzid)}`,
      { method: 'GET' },
    ),

  googleUrl: () => raw<{ url: string }>('/oauth/google/url', { method: 'GET' }),
  microsoftUrl: () => raw<{ url: string }>('/oauth/microsoft/url', { method: 'GET' }),
  sync: (calendarId: string) => raw<SyncResult>(`/calendars/${calendarId}/sync`, { method: 'POST' }),
  yahrzeits: () => raw<Yahrzeit[]>('/yahrzeits', { method: 'GET' }),
  createYahrzeit: (body: YahrzeitInput) =>
    raw<Yahrzeit>('/yahrzeits', { method: 'POST', body: JSON.stringify(body) }),
  updateYahrzeit: (id: string, body: Partial<YahrzeitInput>) =>
    raw<Yahrzeit>(`/yahrzeits/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteYahrzeit: (id: string) => raw<{ deleted: boolean }>(`/yahrzeits/${id}`, { method: 'DELETE' }),
  billingStatus: () => raw<BillingStatus>('/billing/status', { method: 'GET' }),
  checkoutInfo: () => raw<CheckoutInfo>('/billing/checkout', { method: 'GET' }),
  notificationConfig: () => raw<NotificationConfig>('/notifications/config', { method: 'GET' }),
  subscribePush: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    raw<{ subscribed: boolean }>('/notifications/push', { method: 'POST', body: JSON.stringify(sub) }),
  unsubscribePush: (endpoint: string) =>
    raw<{ unsubscribed: boolean }>('/notifications/push', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    }),
  adConfig: () => raw<AdConfig>('/ads/config', { method: 'GET' }),
  nextAd: (placement: 'interstitial' | 'inline') =>
    raw<{ ad: ServedAd | null }>(`/ads/next?placement=${placement}`, { method: 'GET' }),
  adClick: (id: string) => raw<{ targetUrl: string }>(`/ads/${id}/click`, { method: 'POST' }),

  importIcs: (calendarId: string, ics: string) =>
    raw<{ imported: number }>(`/calendars/${calendarId}/import.ics`, { method: 'POST', body: JSON.stringify({ ics }) }),
};

export function icsExportUrl(calendarId: string): string {
  return `${BASE}/calendars/${calendarId}/export.ics`;
}
