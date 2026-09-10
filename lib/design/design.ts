/**
 * Design variants. The active design is chosen by the `DESIGN` environment
 * variable (server-side, read at request time in app/layout.tsx, so it can be
 * changed via the env file without rebuilding). The resolved value is written
 * to `<html data-design="…">`; CSS palettes live in styles/globals.css and
 * client components read the value back from `document.documentElement`.
 */
export type DesignName = 'dark-green' | 'light' | 'dark';

export const DESIGNS: readonly DesignName[] = ['dark-green', 'light', 'dark'];

export const DEFAULT_DESIGN: DesignName = 'dark-green';

export function resolveDesign(value: string | undefined | null): DesignName {
  return value && (DESIGNS as readonly string[]).includes(value)
    ? (value as DesignName)
    : DEFAULT_DESIGN;
}

/** next-themes forced theme for a design (the light design uses light tokens). */
export function themeForDesign(design: DesignName): 'light' | 'dark' {
  return design === 'light' ? 'light' : 'dark';
}

/**
 * Accent hex per design, mirroring the CSS `--aqua` token. Used by the
 * JS-driven audio visualizer, which needs a concrete color rather than a CSS
 * variable.
 */
export const DESIGN_ACCENT: Record<DesignName, `#${string}`> = {
  'dark-green': '#2fe6c0',
  light: '#f4795d',
  dark: '#ffb347',
};

/** Short labels + a representative swatch color for the in-UI design switcher. */
export const DESIGN_META: Record<DesignName, { label: string; swatch: `#${string}` }> = {
  'dark-green': { label: 'Teal', swatch: '#2fe6c0' },
  light: { label: 'Light', swatch: '#f6c9b8' },
  dark: { label: 'Amber', swatch: '#ffb347' },
};

/**
 * Particle-canvas colors per design (mirrors the `--particle-*` CSS tokens).
 * The canvas reads these from JS — not CSS — so a theme switch can't race the
 * `data-design` attribute update. `orbit`/`drift` are "r,g,b" triplets.
 */
export const DESIGN_PARTICLES: Record<
  DesignName,
  { orbit: string; drift: string; shadow: string }
> = {
  'dark-green': { orbit: '150,255,235', drift: '125,255,224', shadow: 'rgba(47,230,192,0.8)' },
  light: { orbit: '250,162,132', drift: '200,172,226', shadow: 'rgba(249,138,107,0.45)' },
  dark: { orbit: '255,210,150', drift: '255,180,110', shadow: 'rgba(255,170,80,0.8)' },
};
