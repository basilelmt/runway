import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export type IndicatorBox = { left: number; top: number; width: number; height: number } | null;

/**
 * Position de l'élément actif (`selector`) dans `container`, pour y faire glisser un repère.
 * Recalculée quand `key` change (route, onglet) et quand le conteneur change de taille.
 */
export function useActiveIndicator(container: RefObject<HTMLElement | null>, selector: string, key: unknown): IndicatorBox {
  const [box, setBox] = useState<IndicatorBox>(null);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const active = root.querySelector<HTMLElement>(selector);
      if (!active) {
        setBox(null);
        return;
      }
      const r = root.getBoundingClientRect();
      const a = active.getBoundingClientRect();
      setBox({ left: a.left - r.left + root.scrollLeft, top: a.top - r.top + root.scrollTop, width: a.width, height: a.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    // Les entrées aussi : un badge qui arrive après coup élargit l'onglet sans changer le conteneur.
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    for (const child of root.querySelectorAll('a, button')) observer.observe(child);
    return () => observer.disconnect();
  }, [container, selector, key]);

  return box;
}

/** Vrai si le système demande moins d'animations (ou si l'environnement ne sait pas le dire, comme en test). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Fait défiler un nombre vers sa nouvelle valeur : depuis 0 au premier affichage, puis depuis la valeur précédente.
 * Renvoie la valeur finale d'emblée si les animations sont réduites.
 */
export function useCountUp(value: number, duration = 700): number {
  const [reduced] = useState(prefersReducedMotion);
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const current = Math.round(origin + (value - origin) * easeOutCubic(t));
      from.current = current;
      setShown(current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  return reduced ? value : shown;
}
