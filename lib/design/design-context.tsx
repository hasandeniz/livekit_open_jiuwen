'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { DEFAULT_DESIGN, type DesignName, themeForDesign } from './design';

export const DESIGN_STORAGE_KEY = 'voice-agent.design';

interface DesignContextValue {
  design: DesignName;
  setDesign: (design: DesignName) => void;
  designs: readonly DesignName[];
}

const DesignContext = createContext<DesignContextValue | null>(null);

/**
 * Owns the active visual design at runtime. The product deliberately exposes
 * one fixed dark palette, while retaining this context for shared consumers.
 */
export function DesignProvider({
  initialDesign,
  children,
}: {
  initialDesign: DesignName;
  children: React.ReactNode;
}) {
  const { setTheme } = useTheme();
  const [design] = useState<DesignName>(
    initialDesign === DEFAULT_DESIGN ? initialDesign : DEFAULT_DESIGN
  );

  // Apply the design: palette via data-design, light/dark class via next-themes.
  useEffect(() => {
    document.documentElement.dataset.design = design;
    setTheme(themeForDesign(design));
  }, [design, setTheme]);

  const setDesign = () => {};

  return (
    <DesignContext.Provider value={{ design, setDesign, designs: [DEFAULT_DESIGN] }}>
      {children}
    </DesignContext.Provider>
  );
}

export function useDesign(): DesignContextValue {
  const ctx = useContext(DesignContext);
  if (ctx) return ctx;
  // Fallback when used outside a provider (keeps components from crashing).
  return { design: DEFAULT_DESIGN, setDesign: () => {}, designs: [DEFAULT_DESIGN] };
}
