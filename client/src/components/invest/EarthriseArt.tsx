import { meta } from 'ascii.rest/pieces/earthrise';
import { useEffect, useRef, useState } from 'react';
import type { EarthriseMessage } from './earthrise.worker';

/**
 * Le worker est gardé pour toute la session : la préparation de la pièce n'est payée qu'une fois, et un retour sur
 * l'écran Investir redessine aussitôt. Il ne dessine que sur le dernier canvas reçu (un seul ciel lunaire à la fois).
 */
let worker: Worker | null = null;
const transferred = new WeakSet<HTMLCanvasElement>();
const supported = typeof Worker !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype;

function send(message: EarthriseMessage, transfer: Transferable[] = []) {
  worker ??= new Worker(new URL('./earthrise.worker.ts', import.meta.url), { type: 'module' });
  worker.postMessage(message, transfer);
}

/** L'ascii art de la Terre qui se lève sur la Lune, dessiné par un worker et qui apparaît en fondu à la première image. */
export function EarthriseArt({ className, label }: { className?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !supported) return;
    const width = () => Math.round(canvas.clientWidth * (devicePixelRatio || 1));
    if (!transferred.has(canvas)) {
      transferred.add(canvas);
      const offscreen = canvas.transferControlToOffscreen();
      send({ type: 'attach', canvas: offscreen, width: width() }, [offscreen]);
    }
    const onDrawn = () => setDrawn(true);
    worker?.addEventListener('message', onDrawn, { once: true });

    // Comme `mount` d'ascii.rest : l'animation ne tourne que visible à l'écran, onglet affiché, mouvement accepté.
    let seen = false;
    let current = canvas.clientWidth;
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const run = () => send({ type: 'run', go: seen && !document.hidden && !still.matches });
    const io = new IntersectionObserver((entries) => {
      seen = entries.at(-1)?.isIntersecting ?? seen;
      run();
    });
    const ro = new ResizeObserver(() => {
      if (canvas.clientWidth === current) return;
      current = canvas.clientWidth;
      send({ type: 'resize', width: width() });
    });
    io.observe(canvas);
    ro.observe(canvas);
    document.addEventListener('visibilitychange', run);
    still.addEventListener('change', run);
    return () => {
      worker?.removeEventListener('message', onDrawn);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', run);
      still.removeEventListener('change', run);
      send({ type: 'run', go: false });
    };
  }, []);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className={className}
      data-drawn={drawn || undefined}
      style={{ display: 'block', aspectRatio: `${meta.cols} / ${meta.rows * (meta.cell ?? 2)}` }}
    />
  );
}
