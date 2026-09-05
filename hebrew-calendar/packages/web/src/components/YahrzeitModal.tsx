import { hebrewDateOfDeath, hebrewDateService } from '@hcal/core';
import { type FormEvent, useMemo, useState } from 'react';
import { ApiError, api, type Yahrzeit } from '../api/client';
import { Button, ConfirmDialog, Modal, Switch, useToast } from '../ui';

interface Props {
  /** Present when editing an existing record. */
  yahrzeit?: Yahrzeit;
  onClose: () => void;
  onSaved: () => void;
}

/** Offsets people actually ask for, rather than a free-text list. */
const REMINDER_CHOICES = [
  { days: 30, label: 'חודש לפני' },
  { days: 7, label: 'שבוע לפני' },
  { days: 1, label: 'יום לפני' },
  { days: 0, label: 'ביום עצמו' },
];

export function YahrzeitModal({ yahrzeit, onClose, onSaved }: Props) {
  const toast = useToast();
  const isEdit = Boolean(yahrzeit);

  const [name, setName] = useState(yahrzeit?.name ?? '');
  const [hebrewName, setHebrewName] = useState(yahrzeit?.hebrewName ?? '');
  const [relation, setRelation] = useState(yahrzeit?.relation ?? '');
  const [deathDate, setDeathDate] = useState(yahrzeit?.deathDate ?? '');
  const [afterSunset, setAfterSunset] = useState(yahrzeit?.afterSunset ?? false);
  const [note, setNote] = useState(yahrzeit?.note ?? '');
  const [remind, setRemind] = useState<number[]>(yahrzeit?.remindDaysBefore ?? [7, 1, 0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Show the resolved Hebrew date as the user types, so the after-sunset
  // switch visibly changes the answer rather than being an unexplained toggle.
  const hebrewPreview = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deathDate)) return null;
    try {
      const hd = hebrewDateOfDeath(deathDate, afterSunset);
      return hebrewDateService.describe(hd).hebrewText;
    } catch {
      return null;
    }
  }, [deathDate, afterSunset]);

  function toggleRemind(days: number) {
    setRemind((cur) => (cur.includes(days) ? cur.filter((d) => d !== days) : [...cur, days]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name,
        hebrewName: hebrewName || undefined,
        relation: relation || undefined,
        deathDate,
        afterSunset,
        note: note || undefined,
        remindDaysBefore: remind,
      };
      if (isEdit && yahrzeit) await api.updateYahrzeit(yahrzeit.id, body);
      else await api.createYahrzeit(body);
      toast.success(isEdit ? 'הרשומה עודכנה' : 'השם נוסף לרשימה');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'השמירה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!yahrzeit) return;
    setBusy(true);
    try {
      await api.deleteYahrzeit(yahrzeit.id);
      toast.success('הרשומה נמחקה');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'המחיקה נכשלה');
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  if (confirmingDelete && yahrzeit) {
    return (
      <ConfirmDialog
        title="מחיקת רשומה"
        message={`להסיר את "${yahrzeit.name}" מרשימת האזכרות? לא ניתן לבטל את הפעולה.`}
        confirmLabel="מחיקה"
        destructive
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      />
    );
  }

  return (
    <Modal
      title={isEdit ? 'עריכת רשומה' : 'הוספת אזכרה'}
      description="התאריך העברי מחושב מתאריך הפטירה הלועזי."
      onClose={onClose}
      footer={
        <>
          {isEdit && (
            <Button variant="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
              מחיקה
            </Button>
          )}
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" type="submit" form="yz-form" loading={busy}>
            שמירה
          </Button>
        </>
      }
    >
      <form id="yz-form" onSubmit={submit} className="stack">
        <label className="field">
          <span className="field-label">שם</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="למשל: סבא יוסף"
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field-label">שם לאזכרה</span>
          <input
            value={hebrewName}
            onChange={(e) => setHebrewName(e.target.value)}
            placeholder="יוסף בן אברהם — לא חובה"
          />
        </label>

        <label className="field">
          <span className="field-label">קרבה</span>
          <input
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            placeholder="סב, אם, דוד — לא חובה"
          />
        </label>

        <label className="field">
          <span className="field-label">תאריך הפטירה (לועזי)</span>
          <input
            required
            type="date"
            value={deathDate}
            onChange={(e) => setDeathDate(e.target.value)}
          />
        </label>

        <Switch checked={afterSunset} onChange={setAfterSunset} label="הפטירה הייתה אחרי השקיעה" />
        <p className="field-hint">
          היום העברי מתחיל בשקיעה, ולכן פטירה שאירעה בערב שייכת כבר ליום העברי הבא — והאזכרה תיערך
          יום אחד מאוחר יותר, בכל שנה.
        </p>

        {hebrewPreview && (
          <p className="day-hint" aria-live="polite">
            התאריך העברי: <b>{hebrewPreview}</b>
          </p>
        )}

        <fieldset className="field">
          <legend className="field-label">תזכורות</legend>
          <div className="chips">
            {REMINDER_CHOICES.map((c) => {
              const on = remind.includes(c.days);
              return (
                <button
                  key={c.days}
                  type="button"
                  className={`chip${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggleRemind(c.days)}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="field">
          <span className="field-label">הערה</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="מקום הקבורה, מנהג המשפחה — לא חובה"
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
