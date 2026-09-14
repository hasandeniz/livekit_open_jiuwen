'use client';

import { useEffect } from 'react';

/** Mouse/touch focus stays quiet; keyboard navigation keeps visible focus. */
export function FocusBehavior() {
  useEffect(() => {
    const root = document.documentElement;
    const onPointerDown = () => {
      root.dataset.focusInput = 'pointer';
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        [
          'Tab',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Home',
          'End',
          'PageUp',
          'PageDown',
        ].includes(event.key)
      ) {
        root.dataset.focusInput = 'keyboard';
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      delete root.dataset.focusInput;
    };
  }, []);
  return null;
}
