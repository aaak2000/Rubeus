import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type Campaign, type CampaignInput } from '../api/client';
import { Button, ConfirmDialog, EmptyState, Modal, Skeleton, Switch, useToast } from '../ui';

/**
 * Campaign management for whoever runs this deployment.
 *
 * House advertising is an allowlist of vetted advertisers, which only works if
 * adding one does not mean opening a database client. The counters are here
 * for the same reason: the operator has to be able to answer "is this
 * campaign worth what the advertiser is paying" without writing SQL.
 */
export function AdminAdsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api
      .adminCampaigns()
      .then(setRows)
      .catch((e) => {
        setRows([]);
        // The server is the authority on who may be here, so its answer is
        // what decides what this page shows — no second, client-side rule to
        // drift out of step with it.
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else toast.error(e instanceof ApiError ? e.message : 'טעינת הקמפיינים נכשלה');
      });
  }, [toast]);

  useEffect(load, [load]);

  if (forbidden) {
    return (
      <div className="page">
        <EmptyState title="אין הרשאה" description="האזור הזה מיועד למפעילי השירות בלבד." />
      </div>
    );
  }

  async function toggleActive(c: Campaign) {
    try {
      await api.adminUpdateCampaign(c.id, { active: !c.active });
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'העדכון נכשל');
    }
  }

  const afterSave = () => {
    setCreating(false);
    setEditing(null);
    load();
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>ניהול פרסומות</h1>
          <p className="muted">קמפיינים של מפרסמים מאושרים, עם מספרי החשיפות וההקלקות.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          קמפיין חדש
        </Button>
      </header>

      {rows === null ? (
        <div className="stack" role="status" aria-busy="true" aria-label="טוען">
          <Skeleton height={88} />
          <Skeleton height={88} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="אין קמפיינים"
          description="בלי קמפיין פעיל לא מוצגות מודעות בית, ובמקומן תוצג רשת פרסום אם הוגדרה."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              קמפיין חדש
            </Button>
          }
        />
      ) : (
        <ul className="camp-list">
          {rows.map((c) => (
            <CampaignRow
              key={c.id}
              c={c}
              onEdit={() => setEditing(c)}
              onToggle={() => toggleActive(c)}
            />
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <CampaignModal campaign={editing ?? undefined} onClose={afterSave} onSaved={afterSave} />
      )}
    </div>
  );
}

function CampaignRow({
  c,
  onEdit,
  onToggle,
}: {
  c: Campaign;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const flight = flightText(c);
  return (
    <li className={`camp-card${c.active ? '' : ' is-paused'}`}>
      <button type="button" className="camp-main" onClick={onEdit} aria-label={`עריכת ${c.title}`}>
        <div className="camp-head">
          <span className="camp-title">{c.title}</span>
          <span className="camp-advertiser">{c.advertiser}</span>
        </div>
        {/* The ad's own copy, because the row is where the operator judges
            what readers will actually see. */}
        {c.body && <p className="camp-body">{c.body}</p>}
        <p className="camp-target">{c.targetUrl}</p>
        {flight && <p className="camp-flight muted text-sm">{flight}</p>}
      </button>

      <div className="camp-stats">
        <span className="camp-stat">
          <strong>{c.impressions.toLocaleString('he-IL')}</strong> חשיפות
        </span>
        <span className="camp-stat">
          <strong>{c.clicks.toLocaleString('he-IL')}</strong> הקלקות
        </span>
        <span className="camp-stat">
          {/* No rate before there is anything to divide by: "0%" would read as
              "nobody clicked" rather than "nobody has seen it". */}
          <strong>{c.clickRate === null ? '—' : `${(c.clickRate * 100).toFixed(1)}%`}</strong> שיעור
          הקלקה
        </span>
        <span className="camp-stat muted">משקל {c.weight}</span>
      </div>

      <Switch
        checked={c.active}
        onChange={onToggle}
        label={c.active ? 'פעיל' : 'מושהה'}
        srLabel={`${c.active ? 'השהיית' : 'הפעלת'} ${c.title}`}
      />
    </li>
  );
}

function CampaignModal({
  campaign,
  onClose,
  onSaved,
}: {
  campaign?: Campaign;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [advertiser, setAdvertiser] = useState(campaign?.advertiser ?? '');
  const [title, setTitle] = useState(campaign?.title ?? '');
  const [body, setBody] = useState(campaign?.body ?? '');
  const [imageUrl, setImageUrl] = useState(campaign?.imageUrl ?? '');
  const [targetUrl, setTargetUrl] = useState(campaign?.targetUrl ?? '');
  const [placement, setPlacement] = useState(campaign?.placement ?? 'interstitial');
  const [weight, setWeight] = useState(String(campaign?.weight ?? 1));
  const [startsAt, setStartsAt] = useState(dateInput(campaign?.startsAt));
  const [endsAt, setEndsAt] = useState(dateInput(campaign?.endsAt));
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const input: CampaignInput = {
        advertiser: advertiser.trim(),
        title: title.trim(),
        // Empty means cleared, which is null on the wire — an empty string
        // would fail the URL check rather than removing the picture.
        body: body.trim() || null,
        imageUrl: imageUrl.trim() || null,
        targetUrl: targetUrl.trim(),
        placement,
        weight: Number(weight) || 1,
        startsAt: startsAt ? new Date(`${startsAt}T00:00:00`).toISOString() : null,
        endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
      };
      if (campaign) await api.adminUpdateCampaign(campaign.id, input);
      else await api.adminCreateCampaign(input);
      toast.success(campaign ? 'הקמפיין עודכן' : 'הקמפיין נוצר');
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'השמירה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!campaign) return;
    setBusy(true);
    try {
      await api.adminDeleteCampaign(campaign.id);
      toast.success('הקמפיין נמחק');
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'המחיקה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        title={campaign ? 'עריכת קמפיין' : 'קמפיין חדש'}
        onClose={onClose}
        footer={
          <>
            {campaign && (
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                מחיקה
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              ביטול
            </Button>
            <Button variant="primary" onClick={save} loading={busy}>
              שמירה
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field">
            <span>מפרסם</span>
            <input value={advertiser} onChange={(e) => setAdvertiser(e.target.value)} />
          </label>
          <label className="field">
            <span>כותרת</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field field-wide">
            <span>תיאור</span>
            <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <label className="field field-wide">
            <span>כתובת היעד</span>
            <input
              dir="ltr"
              placeholder="https://"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
            />
          </label>
          <label className="field field-wide">
            <span>כתובת תמונה</span>
            <input
              dir="ltr"
              placeholder="https://"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </label>
          <label className="field">
            <span>מיקום</span>
            <select
              value={placement}
              onChange={(e) => setPlacement(e.target.value as typeof placement)}
            >
              <option value="interstitial">מסך ביניים</option>
              <option value="inline">בתוך מגירת היום</option>
            </select>
          </label>
          <label className="field">
            <span>משקל</span>
            <input
              type="number"
              min={1}
              max={100}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label className="field">
            <span>תחילת הרצה</span>
            <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="field">
            <span>סיום הרצה</span>
            <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
        </div>
        <p className="muted text-sm">
          כתובות חייבות להתחיל ב-http או ב-https. השארת תאריכים ריקים משמעה קמפיין ללא הגבלת זמן.
        </p>
      </Modal>

      {confirmingDelete && (
        <ConfirmDialog
          title="מחיקת הקמפיין"
          message="הקמפיין יימחק לצמיתות, יחד עם מספרי החשיפות וההקלקות שנצברו. להשהיה זמנית עדיף להשתמש במתג הפעיל."
          confirmLabel="מחיקה"
          destructive
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}

/** Flight dates as a sentence, or nothing when the campaign has no window. */
function flightText(c: Campaign): string | null {
  const from = c.startsAt ? formatDate(c.startsAt) : null;
  const to = c.endsAt ? formatDate(c.endsAt) : null;
  if (from && to) return `${from} – ${to}`;
  if (from) return `מ-${from}`;
  if (to) return `עד ${to}`;
  return null;
}

/** An ISO instant as the `YYYY-MM-DD` a date input expects. */
function dateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(new Date(iso));
}
