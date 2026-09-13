import { Link } from 'react-router-dom';
import * as Icon from './Icons';
import InstallApps from './InstallApps';

/**
 * Hidden while the real SEBI registration, CIN and office details are pending.
 * Flip back to true once they are filled in — this disclosure is legally required
 * on an Indian broking site before it goes public.
 */
const SHOW_REGULATORY_FOOTER = false;

export default function AuthFooter() {
  return (
    <>
      <InstallApps />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon.Logo size={17} />
          <span className="brand-word" style={{ fontSize: 12 }}>
            NTD
          </span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Don&rsquo;t have an account? <Link to="/signup">Open one for free</Link>
        </span>
      </div>

      {SHOW_REGULATORY_FOOTER && (
        <div className="auth-foot">
          <span>
            NTD Broking Private Limited — member of NSE, BSE and MCX. SEBI registration no.
            [SEBI REG NO] · CIN [CIN].
          </span>
          <span>
            Registered office: [REGISTERED ADDRESS]. Compliance officer: [NAME] · [EMAIL] · [PHONE].
          </span>
          <span>Smart Online Dispute Resolution · SEBI SCORES · Investor charter</span>
        </div>
      )}

      <span className="num" style={{ fontSize: 10, color: '#3f4449' }}>
        v1.1.0
      </span>
    </>
  );
}
