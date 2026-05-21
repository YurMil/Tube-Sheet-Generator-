import {useLayoutEffect, useState} from 'react';

export type ThemeMode = 'light' | 'dark';

const isThemeMode = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark';

const readThemeFromElement = (element: Element | null) => {
  if (!element) return null;
  const value = element.getAttribute('data-theme');
  return isThemeMode(value) ? value : null;
};

const readThemeMessage = (data: unknown) => {
  if (isThemeMode(data)) {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return null;
  }

  const theme = (data as {theme?: unknown}).theme;
  return isThemeMode(theme) ? theme : null;
};

const readHostTheme = () => {
  try {
    if (window.parent !== window) {
      const parentTheme = readThemeFromElement(window.parent.document.documentElement);
      if (parentTheme) {
        return parentTheme;
      }
    }
  } catch {
    return readThemeFromElement(document.documentElement);
  }

  return readThemeFromElement(document.documentElement);
};

const readSystemTheme = (): ThemeMode =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export default function useSyncedTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }
    return readHostTheme() ?? readSystemTheme();
  });

  useLayoutEffect(() => {
    const root = document.documentElement;
    const applyTheme = (nextTheme: ThemeMode) => {
      if (root.getAttribute('data-theme') !== nextTheme) {
        root.setAttribute('data-theme', nextTheme);
      }
      if (root.style.colorScheme !== nextTheme) {
        root.style.colorScheme = nextTheme;
      }
      setThemeMode((current) => (current === nextTheme ? current : nextTheme));
    };

    const syncFromHost = () => {
      const hostTheme = readHostTheme();
      if (hostTheme) {
        applyTheme(hostTheme);
        return true;
      }
      return false;
    };

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      if (!syncFromHost()) {
        applyTheme(media.matches ? 'dark' : 'light');
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const nextTheme = readThemeMessage(event.data);
      if (nextTheme) {
        applyTheme(nextTheme);
      }
    };

    syncFromHost() || applyTheme(media.matches ? 'dark' : 'light');

    const ownObserver = new MutationObserver(() => {
      syncFromHost();
    });
    ownObserver.observe(root, {attributes: true, attributeFilter: ['data-theme']});

    let parentObserver: MutationObserver | null = null;
    try {
      if (window.parent !== window) {
        parentObserver = new MutationObserver(() => {
          syncFromHost();
        });
        parentObserver.observe(window.parent.document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme'],
        });
      }
    } catch {
      parentObserver = null;
    }

    media.addEventListener('change', handleMediaChange);
    window.addEventListener('message', handleMessage);

    return () => {
      ownObserver.disconnect();
      parentObserver?.disconnect();
      media.removeEventListener('change', handleMediaChange);
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return themeMode;
}
