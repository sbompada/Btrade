import { useEffect, useState } from 'react';

/** Chrome's install prompt event — not in lib.dom yet. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  // Fires before the component mounts, so it is captured at module load and replayed.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    // Safari's own flag, still the only signal on iOS.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true);

export const isIos = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports as a Mac; the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function useInstall() {
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const update = () => {
      setCanPrompt(!!deferred);
      setInstalled(isStandalone());
    };
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return 'unavailable' as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event is single-use; Chrome fires a fresh one if the user declines.
    deferred = null;
    notify();
    return outcome;
  };

  return { canPrompt, installed, promptInstall };
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unavailable service worker only costs installability, never the app itself.
    });
  });
}
