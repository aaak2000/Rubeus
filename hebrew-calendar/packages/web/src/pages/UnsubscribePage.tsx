import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Skeleton } from '../ui';

/**
 * The landing page for the unsubscribe link in a reminder email.
 *
 * Deliberately reachable without logging in — asking someone to sign in before
 * they can stop unwanted mail is how a message gets marked as spam instead.
 * The signed token in the link is the authorization, and it can do nothing but
 * turn email off.
 */
export function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');

  useEffect(() => {
    if (!token) {
      setState('failed');
      return;
    }
    api
      .unsubscribeEmail(token)
      .then((r) => setState(r.unsubscribed ? 'done' : 'failed'))
      .catch(() => setState('failed'));
  }, [token]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>תזכורות במייל</h1>
        </div>
      </header>

      {state === 'working' && <Skeleton height={72} />}

      {state === 'done' && (
        <div className="card stack">
          <p>
            <b>הוסרתם מרשימת התזכורות במייל.</b>
          </p>
          <p className="muted text-sm">
            האזכרות עצמן נשמרו ולא נמחק דבר — רק המייל הופסק. אפשר להפעיל אותו מחדש בכל עת במסך
            ההגדרות, וגם לקבל תזכורות כהתראה במכשיר במקום.
          </p>
          <p className="text-sm">
            <Link to="/reminders">לרשימת האזכרות</Link>
          </p>
        </div>
      )}

      {state === 'failed' && (
        <div className="card stack">
          <p>
            <b>הקישור אינו תקין.</b>
          </p>
          <p className="muted text-sm">
            ייתכן שהוא נחתך בהעתקה מהמייל. אפשר לכבות תזכורות במייל ישירות במסך ההגדרות.
          </p>
          <p className="text-sm">
            <Link to="/settings">להגדרות</Link>
          </p>
        </div>
      )}
    </div>
  );
}
