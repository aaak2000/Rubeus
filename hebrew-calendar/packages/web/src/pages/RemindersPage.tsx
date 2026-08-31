import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Yahrzeit } from '../api/client';
import { Button, EmptyState, Skeleton, useToast } from '../ui';
import { YahrzeitModal } from '../components/YahrzeitModal';
import { GREGORIAN_MONTHS_HE } from '../hebrew';

/**
 * The memorial register.
 *
 * One place holding the names a family observes, each with the Hebrew date it
 * recurs on and when the next one falls. The point of gathering them here is
 * that a yahrzeit is easy to lose track of: it moves against the civil
 * calendar every year, so a list keyed to Gregorian dates is no use at all.
 */
export function RemindersPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Yahrzeit[] | null>(null);
  const [editing, setEditing] = useState<Yahrzeit | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api
      .yahrzeits()
      .then(setRows)
      .catch((e) => {
        setRows([]);
        toast.error(e instanceof ApiError ? e.message : 'טעינת האזכרות נכשלה');
      });
  }, [toast]);

  useEffect(load, [load]);

  const afterSave = () => {
    setCreating(false);
    setEditing(null);
    load();
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>תזכורות</h1>
          <p className="muted">אזכרות ויארצייטים, לפי התאריך העברי.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          הוספת שם
        </Button>
      </header>

      {rows === null ? (
        <div className="stack" aria-busy="true" aria-label="טוען">
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="עדיין אין שמות ברשימה"
          description="הוסיפו שם ותאריך פטירה לועזי, והמערכת תחשב את התאריך העברי ואת המועד הבא — כולל הכלל שפטירה אחרי השקיעה שייכת ליום העברי הבא."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              הוספת שם
            </Button>
          }
        />
      ) : (
        <ul className="yz-list">
          {rows.map((y) => (
            <YahrzeitRow key={y.id} y={y} onEdit={() => setEditing(y)} />
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <YahrzeitModal
          yahrzeit={editing ?? undefined}
          onClose={afterSave}
          onSaved={afterSave}
        />
      )}
    </div>
  );
}

function YahrzeitRow({ y, onEdit }: { y: Yahrzeit; onEdit: () => void }) {
  const soon = y.next !== null && y.next.daysUntil <= 30;
  return (
    <li className={`yz-card${soon ? ' soon' : ''}`}>
      <button className="yz-main" onClick={onEdit} aria-label={`עריכת ${y.name}`}>
        <div className="yz-head">
          <span className="yz-name">{y.name}</span>
          {y.relation && <span className="yz-rel">{y.relation}</span>}
        </div>
        {y.hebrewName && <p className="yz-hname">{y.hebrewName}</p>}
        <p className="yz-hdate">{y.hebrewDateText}</p>
      </button>

      <div className="yz-next">
        {y.next ? (
          <>
            <span className={`yz-countdown${soon ? ' soon' : ''}`}>{countdown(y.next.daysUntil)}</span>
            <span className="yz-when">
              {y.next.hebrewText} · {formatGregorian(y.next.gregorian)}
            </span>
            {y.next.candleAt && (
              <span className="yz-candle">
                <span aria-hidden="true">🕯️</span> הדלקת נר {formatGregorian(y.next.candleDate)} ב-
                {y.next.candleAt}
              </span>
            )}
          </>
        ) : (
          <span className="yz-when muted">לא ניתן לחשב מועד</span>
        )}
      </div>
    </li>
  );
}

/** "עוד 12 יום" — and the two cases where a plain number reads badly. */
function countdown(days: number): string {
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  return `עוד ${days} ימים`;
}

function formatGregorian(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ב${GREGORIAN_MONTHS_HE[m - 1]} ${y}`;
}
