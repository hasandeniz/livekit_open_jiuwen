'use client';

import { useEffect, useReducer, useRef } from 'react';
import { type AvatarSingleton, getAvatarSingleton } from '@/lib/digital-human/use-avatar';
import { cn } from '@/lib/shadcn/utils';

export interface AvatarCanvasProps {
  className?: string;
}

/**
 * Renders the FaceUnity (FURenderKit) 3D avatar.
 *
 * The actual <canvas> and WebGL renderer are a module-level singleton (see
 * use-avatar.ts); this component just attaches that canvas into its container
 * and reflects the load status. Idle (breathing) animation plays once ready.
 * Lip-sync is wired up in a later phase.
 */
export function AvatarCanvas({ className }: AvatarCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const singletonRef = useRef<AvatarSingleton | null>(null);
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const s = getAvatarSingleton();
    singletonRef.current = s;

    const container = containerRef.current;
    if (container && s.canvas.parentElement !== container) {
      container.appendChild(s.canvas);
    }

    s.listeners.add(force);
    force();

    return () => {
      s.listeners.delete(force);
      // Intentionally keep the singleton (and its canvas) alive across unmounts.
    };
  }, []);

  const status = singletonRef.current?.status ?? 'loading';
  const error = singletonRef.current?.error ?? null;

  return (
    <div ref={containerRef} className={cn('relative h-full w-full overflow-hidden', className)}>
      {status === 'loading' && (
        <div className="avatar-loader">
          <div className="blob-stage">
            <span className="blob blob-glow" />
            <span className="blob" />
          </div>
          <span className="label">Preparing avatar</span>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-red-500">
          Avatar failed to load: {error}
        </div>
      )}
    </div>
  );
}
