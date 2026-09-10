'use client';

import { useEffect, useRef } from 'react';
import { DESIGN_PARTICLES } from '@/lib/design/design';
import { useDesign } from '@/lib/design/design-context';

/**
 * Futuristic ambient scene rendered behind the whole app, ported from the
 * NOVA design mock. A centered glowing energy orb (CSS blobs + swirl + core)
 * sits behind the avatar, surrounded by orbiting / drifting luminous particles
 * drawn on a canvas, with film grain + vignette overlays on top.
 *
 * Everything here is purely decorative: the layer sits at z-0 and the overlays
 * are pointer-events:none so they never intercept clicks.
 */
export function SceneBackground() {
  const orbitRef = useRef<HTMLCanvasElement>(null);
  const { design } = useDesign();

  // ---- Orbiting / drifting light particles ----
  // Re-runs on design change so particle colors follow the active palette.
  useEffect(() => {
    const cv = orbitRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    // Particle colors come from JS (not CSS) to avoid racing the data-design
    // attribute update when the theme is switched at runtime.
    const { orbit: orbitRgb, drift: driftRgb, shadow: particleShadow } = DESIGN_PARTICLES[design];

    let W = 0;
    let H = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;

    const resize = () => {
      W = cv.width = window.innerWidth;
      H = cv.height = window.innerHeight;
      cx = W / 2;
      cy = H * 0.4;
    };
    window.addEventListener('resize', resize);
    resize();

    const baseR = Math.min(W, H);
    const orb = Array.from({ length: 46 }, () => ({
      ang: Math.random() * Math.PI * 2,
      rad: baseR * (0.1 + Math.random() * 0.26),
      spd: (Math.random() * 0.4 + 0.15) * (Math.random() < 0.5 ? 1 : -1) * 0.01,
      size: Math.random() * 2 + 0.8,
      a: Math.random() * 0.5 + 0.3,
      ry: 0.55 + Math.random() * 0.3,
      ph: Math.random() * Math.PI * 2,
    }));
    const drift = Array.from({ length: 55 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      sx: (Math.random() - 0.5) * 0.2,
      sy: -(Math.random() * 0.3 + 0.05),
      size: Math.random() * 1.6 + 0.4,
      a: Math.random() * 0.4 + 0.12,
    }));

    let tk = 0;
    const loop = () => {
      ctx.clearRect(0, 0, W, H);
      tk++;
      ctx.shadowColor = particleShadow;
      for (const p of orb) {
        p.ang += p.spd;
        const rr = p.rad + Math.sin(tk * 0.02 + p.ph) * 12;
        const x = cx + Math.cos(p.ang) * rr;
        const y = cy + Math.sin(p.ang) * rr * p.ry;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, 7);
        ctx.fillStyle = `rgba(${orbitRgb},${p.a})`;
        ctx.shadowBlur = 8;
        ctx.fill();
      }
      for (const p of drift) {
        p.x += p.sx;
        p.y += p.sy;
        if (p.y < -5) {
          p.y = H + 5;
          p.x = Math.random() * W;
        }
        if (p.x < -5) p.x = W + 5;
        if (p.x > W + 5) p.x = -5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, 7);
        ctx.fillStyle = `rgba(${driftRgb},${p.a})`;
        ctx.shadowBlur = 5;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [design]);

  return (
    <>
      {/* Back scene */}
      <div className="scene-bg" aria-hidden="true">
        <div className="scene">
          <div className="energy">
            <div className="b b1" />
            <div className="b b2" />
            <div className="b b3" />
            <div className="swirl" />
            <div className="core" />
          </div>
          <canvas id="orbit" ref={orbitRef} />
        </div>
      </div>

      {/* Film overlays (above content, never block clicks) */}
      <div className="scene-overlays" aria-hidden="true">
        <div className="grain" />
        <div className="vignette" />
      </div>
    </>
  );
}
