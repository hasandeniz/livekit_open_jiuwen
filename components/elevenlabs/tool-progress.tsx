'use client';

import { useEffect, useState } from 'react';

export function ToolProgress({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="presentation-card tool-progress">
      <span className="tool-progress-spinner" aria-hidden="true" />
      <div role="status" aria-live="polite">
        <strong>Dosyan hazırlanıyor…</strong>
        <span>
          {elapsed >= 120
            ? 'İşlem beklenenden uzun sürüyor. Henüz sonuç gelmedi.'
            : elapsed >= 30
              ? 'Sonucu bekliyorum. Hazır olduğunda dosyan burada görünecek.'
              : 'İsteğini aldım. Hazırlanması biraz zaman alabilir.'}
        </span>
      </div>
      <time className="tool-progress-time" aria-label="Geçen süre" aria-live="off">
        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
      </time>
    </div>
  );
}
