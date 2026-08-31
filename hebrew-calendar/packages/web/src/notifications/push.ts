import { api } from '../api/client';

/**
 * Browser push subscription.
 *
 * Every step here can legitimately be unavailable — no service worker, no
 * Push API, permission denied, no VAPID key on the server — so each returns a
 * reason rather than throwing. The UI needs to say *why* a switch will not
 * turn on, not merely that it failed.
 */

export type PushState =
  | 'unsupported'
  | 'server-disabled'
  | 'denied'
  | 'subscribed'
  | 'unsubscribed';

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Registers the worker once and resolves when it is ready to receive. */
export async function ensureWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    await navigator.serviceWorker.register('/sw.js');
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function currentState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

export async function subscribe(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';

  const config = await api.notificationConfig();
  if (!config.push.enabled || !config.push.publicKey) return 'server-disabled';

  // Ask only at the moment the user has said they want this. A permission
  // prompt on load is the fastest way to a permanent "denied".
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const reg = await ensureWorker();
  if (!reg) return 'unsupported';

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.push.publicKey),
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  if (!json.endpoint || !json.keys) return 'unsubscribed';
  await api.subscribePush({ endpoint: json.endpoint, keys: json.keys });
  return 'subscribed';
}

export async function unsubscribe(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    // Tell the server first: a subscription it keeps sending to after the
    // browser has dropped it is a delivery that silently disappears.
    await api.unsubscribePush(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'unsubscribed';
}

/**
 * VAPID keys travel as base64url; the Push API wants raw bytes.
 *
 * Backed by an explicit ArrayBuffer: `applicationServerKey` will not accept a
 * view that TypeScript thinks might sit on a SharedArrayBuffer.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
