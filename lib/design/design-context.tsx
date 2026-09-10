'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { DESIGNS, type DesignName, resolveDesign, themeForDesign } from './design';

export const DESIGN_STORAGE_KEY = 'voice-agent.design';

interface DesignContextValue {
  design: DesignName;
  setDesign: (design: DesignName) => void;
  designs: readonly DesignName[];
}

const DesignContext = createContext<DesignContextValue | null>(null);

/**
 * Owns the active visual design at runtime. The initial value comes from the
 * `DESIGN` env var (rendered server-side as `<html data-design>`); a stored
 * choice overrides it. Switching updates `<html data-design>`, the next-themes
 * light/dark class (for shadcn tokens and `dark:` variants), and localStorage.
 */
export function DesignProvider({
  initialDesign,
  children,
}: {
  initialDesign: DesignName;
  children: React.ReactNode;
}) {
  const { setTheme } = useTheme();
  const [design, setDesignState] = useState<DesignName>(initialDesign);

  // Adopt a stored override after mount (env value stays the default).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DESIGN_STORAGE_KEY);
      if (stored) setDesignState(resolveDesign(stored));
    } catch {
      // localStorage unavailable — keep the env default.
    }
  }, []);

  // Apply the design: palette via data-design, light/dark class via next-themes.
  useEffect(() => {
    document.documentElement.dataset.design = design;
    setTheme(themeForDesign(design));
  }, [design, setTheme]);

  const setDesign = (next: DesignName) => {
    setDesignState(next);
    try {
      window.localStorage.setItem(DESIGN_STORAGE_KEY, next);
    } catch {
      // Ignore persistence failures.
    }
  };

  return (
    <DesignContext.Provider value={{ design, setDesign, designs: DESIGNS }}>
      {children}
    </DesignContext.Provider>
  );
}

export function useDesign(): DesignContextValue {
  const ctx = useContext(DesignContext);
  if (ctx) return ctx;
  // Fallback when used outside a provider (keeps components from crashing).
  return { design: 'dark-green', setDesign: () => {}, designs: DESIGNS };
}
