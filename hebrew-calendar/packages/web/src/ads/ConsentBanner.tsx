import { Link } from 'react-router-dom';
import { Button } from '../ui';
import { useAds } from './AdsProvider';

/**
 * Consent for personalized advertising.
 *
 * Israel's Privacy Protection Law (Amendment 13) and the regulator's tracking
 * guidance expect a reject option presented as prominently as accept, on the
 * first layer, in Hebrew, and withdrawable later. Rejecting is not a dead end:
 * ads still appear, they are simply not personalized.
 *
 * It is a labelled landmark rather than a dialog: it never traps focus and the
 * calendar stays fully usable behind it, so announcing it as a dialog would
 * misdescribe it — and would collide with the real dialogs on the page.
 */
export function ConsentBanner() {
  const { consent, setConsent, adsEnabled, resting, adFree } = useAds();
  // A subscriber is never asked: there are no ads to personalize, so the
  // question would be noise dressed up as a choice.
  if (consent !== null || !adsEnabled || resting || adFree) return null;

  return (
    <div className="consent" role="region" aria-labelledby="consent-title">
      <div className="consent-inner">
        <div>
          <h2 id="consent-title" className="consent-title">
            מודעות מותאמות אישית?
          </h2>
          <p className="consent-text">
            אפשר להציג מודעות מותאמות לפי השימוש שלכם, או מודעות כלליות בלבד. בכל מקרה המודעות
            נבחרות מראש, ואינן מוצגות בשבת ובחג. ניתן לשנות בכל עת ב<Link to="/settings">הגדרות</Link>.
          </p>
        </div>
        <div className="consent-actions">
          <Button variant="secondary" onClick={() => setConsent('rejected')}>
            מודעות כלליות בלבד
          </Button>
          <Button variant="primary" onClick={() => setConsent('accepted')}>
            אישור התאמה אישית
          </Button>
        </div>
      </div>
    </div>
  );
}
