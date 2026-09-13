import { useState } from 'react';
import * as Icon from './Icons';
import { isIos, useInstall } from '../lib/install';

type Sheet = null | 'android' | 'ios';

const IOS_STEPS = [
  'Open this page in Safari (Chrome on iPhone cannot install web apps).',
  'Tap the Share button in the toolbar.',
  'Choose "Add to Home Screen".',
  'Tap Add — NTD appears alongside your other apps.',
];

const ANDROID_STEPS = [
  'Open this page in Chrome on your Android phone.',
  'Tap the ⋮ menu in the top-right.',
  'Choose "Add to Home screen" or "Install app".',
  'Confirm — NTD installs like any other app.',
];

export default function InstallApps() {
  const { canPrompt, installed, promptInstall } = useInstall();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [note, setNote] = useState<string | null>(null);

  if (installed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--up)' }}>
        <div className="status-dot" />
        <span style={{ fontSize: 11 }}>Running as an installed app</span>
      </div>
    );
  }

  const onAndroid = async () => {
    setNote(null);
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome === 'dismissed') setNote('Installation cancelled. You can try again any time.');
      return;
    }
    setSheet('android');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="chip" style={{ height: 30, padding: '0 13px' }} onClick={onAndroid}>
          <Icon.Play /> {canPrompt ? 'Install app' : 'Android app'}
        </button>
        <button
          className="chip"
          style={{ height: 30, padding: '0 13px' }}
          onClick={() => {
            setNote(null);
            setSheet('ios');
          }}
        >
          <Icon.Phone /> iOS app
        </button>
      </div>

      {note && (
        <span style={{ fontSize: 10, color: 'var(--muted)' }} role="status">
          {note}
        </span>
      )}

      {sheet && (
        <div
          style={{
            width: 344,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>
              {sheet === 'ios' ? 'Add NTD to your iPhone' : 'Install NTD on Android'}
            </span>
            <button style={{ fontSize: 11, color: 'var(--text-3)' }} onClick={() => setSheet(null)}>
              Close
            </button>
          </div>

          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 11,
              lineHeight: 1.6,
              color: 'var(--text-3)',
            }}
          >
            {(sheet === 'ios' ? IOS_STEPS : ANDROID_STEPS).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>

          <span style={{ fontSize: 10, color: 'var(--dimmer)', textWrap: 'pretty' }}>
            {sheet === 'ios'
              ? 'iOS has no install button for web apps, so this is the only route Apple allows.'
              : isIos()
                ? 'You appear to be on iOS — use the iOS steps instead.'
                : 'Your browser did not offer an install prompt, so add it manually.'}
          </span>
        </div>
      )}
    </div>
  );
}
