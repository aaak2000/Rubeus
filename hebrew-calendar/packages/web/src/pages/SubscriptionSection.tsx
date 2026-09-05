import { useCallback, useEffect, useState } from 'react';
import { useAds } from '../ads';
import { ApiError, api, type BillingStatus } from '../api/client';
import { Button, ConfirmDialog, Skeleton, useToast } from '../ui';

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void };
      Initialize: (opts: { token: string; eventCallback?: (e: { name: string }) => void }) => void;
      Checkout: { open: (opts: Record<string, unknown>) => void };
    };
  }
}

/**
 * The paid subscription that removes advertising.
 *
 * Ads are the default and stay usable; this buys them away for a few shekels
 * a month. Nothing else is behind the subscription — a calendar that hides
 * zmanim or yahrzeits behind a paywall would be a different, worse product.
 */
export function SubscriptionSection() {
  const toast = useToast();
  const { refreshEntitlement } = useAds();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const load = useCallback(() => {
    api
      .billingStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(load, [load]);

  async function startCheckout() {
    setBusy(true);
    try {
      const info = await api.checkoutInfo();
      if (!info.clientToken) {
        toast.error('התשלום אינו מוגדר בשרת הזה');
        return;
      }
      await loadPaddle();
      const paddle = window.Paddle;
      if (!paddle) {
        toast.error('טעינת מערכת התשלומים נכשלה');
        return;
      }
      paddle.Environment.set(info.environment);
      paddle.Initialize({
        token: info.clientToken,
        eventCallback: (e) => {
          if (e.name !== 'checkout.completed') return;
          // The webhook is what actually grants the subscription, and it can
          // land a moment after the overlay closes. Re-read shortly after
          // rather than assuming this event means we are entitled.
          toast.success('תודה! המנוי נקלט, הפרסומות ייפסקו תוך רגע.');
          setTimeout(() => {
            load();
            refreshEntitlement();
          }, 2500);
        },
      });
      paddle.Checkout.open({
        items: [{ priceId: info.priceId, quantity: 1 }],
        customer: { email: info.email },
        settings: { locale: 'he', displayMode: 'overlay' },
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'פתיחת התשלום נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      const next = await api.cancelSubscription();
      setStatus(next);
      setConfirmingCancel(false);
      // Wording follows what actually happened: cancelling normally leaves the
      // paid period running, and saying "the ads are back" then would be wrong.
      toast.success(
        next.adFree && next.currentPeriodEnd
          ? `המנוי בוטל. הוא יישאר בתוקף עד ${formatDate(next.currentPeriodEnd)}.`
          : 'המנוי בוטל.',
      );
      refreshEntitlement();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'ביטול המנוי נכשל. נסו שוב.');
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    setBusy(true);
    try {
      setStatus(await api.resumeSubscription());
      toast.success('המנוי חודש ויתחדש כרגיל.');
      refreshEntitlement();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'חידוש המנוי נכשל. נסו שוב.');
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <section className="card stack" aria-labelledby="sub-h">
        <h2 id="sub-h">מנוי ללא פרסומות</h2>
        <Skeleton height={72} />
      </section>
    );
  }

  const price = formatPrice(status.plan.priceCents, status.plan.currency);

  return (
    <section className="card stack" aria-labelledby="sub-h">
      <div>
        <h2 id="sub-h">מנוי ללא פרסומות</h2>
        <p className="muted text-sm">
          כל יכולות היומן פתוחות בלי קשר למנוי. המנוי מסיר את הפרסומות בלבד, ותומך בפיתוח.
        </p>
      </div>

      {status.adFree ? (
        <>
          <p className="sub-state">
            <span className="sub-badge">מנוי פעיל</span>
            {status.currentPeriodEnd && (
              <span className="muted text-sm">
                {status.cancelAtPeriodEnd ? 'בתוקף עד' : 'החידוש הבא'}{' '}
                {formatDate(status.currentPeriodEnd)}
              </span>
            )}
          </p>
          {status.status === 'pastDue' && (
            <p className="notice">
              התשלום האחרון לא נקלט. המנוי ממשיך לפעול בינתיים — כדאי לעדכן את אמצעי התשלום.
            </p>
          )}
          {/*
            Secondary, not ghost. Ghost renders as muted borderless text, and a
            cancel control that is harder to see than the button that took the
            money is the thing the law here is aimed at.
          */}
          {status.cancelAtPeriodEnd ? (
            <Button variant="secondary" onClick={resume} loading={busy}>
              חידוש המנוי
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setConfirmingCancel(true)} loading={busy}>
              ביטול המנוי
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="sub-price">
            <strong>{price}</strong> <span className="muted">לחודש</span>
          </p>
          <Button
            variant="primary"
            onClick={startCheckout}
            loading={busy}
            disabled={!status.checkoutAvailable}
          >
            הסרת הפרסומות
          </Button>
          {!status.checkoutAvailable && <p className="notice">התשלום אינו מוגדר בשרת הזה עדיין.</p>}
        </>
      )}

      {confirmingCancel && (
        <ConfirmDialog
          title="ביטול המנוי"
          message={
            status.currentPeriodEnd
              ? `המנוי לא יתחדש, אך יישאר בתוקף עד ${formatDate(status.currentPeriodEnd)} — התקופה ששולמה עליה נשמרת. הפרסומות יחזרו רק אחרי המועד הזה.`
              : 'המנוי ייפסק והפרסומות יחזרו. אפשר לחדש בכל עת.'
          }
          confirmLabel="ביטול המנוי"
          cancelLabel="השארת המנוי"
          destructive
          busy={busy}
          onConfirm={cancel}
          onCancel={() => setConfirmingCancel(false)}
        />
      )}
    </section>
  );
}

/** Paddle's overlay script, loaded only when someone actually wants to pay. */
function loadPaddle(): Promise<void> {
  if (window.Paddle) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('paddle.js failed to load'));
    document.head.appendChild(el);
  });
}

/** Agorot to "₪9.90" — the stored integer avoids float drift on money. */
function formatPrice(agorot: number, currency: string): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(agorot / 100);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' }).format(new Date(iso));
}
