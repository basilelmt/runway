import { useEffect, useRef, useState, type RefObject } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useActiveIndicator } from '@/lib/motion';
import { CountBadge } from './CountBadge';
import styles from './Tabs.module.css';

export type TabItem<T extends string> = { value: T; label: string; count?: number; to?: string };

type TabsProps<T extends string> = {
  items: TabItem<T>[];
  /** Onglet actif ; ignoré pour les onglets-liens (`to`), actifs selon l'URL. */
  value?: T;
  onChange?: (value: T) => void;
  label: string;
};

/** Onglets soulignés : boutons (état local ou paramètre d'URL) ou liens de navigation. Le soulignement glisse d'un onglet à l'autre. */
export function Tabs<T extends string>({ items, value, onChange, label }: TabsProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const links = items.some((i) => i.to);
  const activeSelector = links ? '[aria-current="page"]' : '[aria-selected="true"]';
  const activeKey = links ? pathname : value;
  const indicator = useActiveIndicator(ref, activeSelector, activeKey);
  const overflow = useOverflowEdges(ref);

  // Trop d'onglets pour la largeur (mobile) : l'onglet actif est ramené dans la zone visible.
  useEffect(() => {
    const root = ref.current;
    const active = root?.querySelector<HTMLElement>(activeSelector);
    if (!root || !active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (right > root.scrollLeft + root.clientWidth) root.scrollLeft = right - root.clientWidth;
    else if (left < root.scrollLeft) root.scrollLeft = left;
  }, [activeSelector, activeKey]);

  const content = (item: TabItem<T>) => (
    <>
      {item.label}
      {item.count ? <CountBadge count={item.count} /> : null}
    </>
  );
  return (
    <div className={styles.wrap}>
      <div ref={ref} className={styles.tabs} role={links ? undefined : 'tablist'} aria-label={label} data-overflow={overflow ?? undefined}>
        {items.map((item) =>
          item.to ? (
            <NavLink key={item.value} to={item.to} end className={({ isActive }) => [styles.tab, isActive ? styles.active : ''].join(' ')}>
              {content(item)}
            </NavLink>
          ) : (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={item.value === value}
              className={[styles.tab, item.value === value ? styles.active : ''].join(' ')}
              onClick={() => onChange?.(item.value)}
            >
              {content(item)}
            </button>
          ),
        )}
        {indicator ? <span className={styles.indicator} style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }} aria-hidden /> : null}
      </div>
    </div>
  );
}

/** Côtés où la rangée d'onglets déborde : « start », « end » ou « both », null si tout tient. */
function useOverflowEdges(ref: RefObject<HTMLElement | null>): 'start' | 'end' | 'both' | null {
  const [edges, setEdges] = useState<'start' | 'end' | 'both' | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const update = () => {
      const start = root.scrollLeft > 1;
      const end = root.scrollLeft + root.clientWidth < root.scrollWidth - 1;
      setEdges(start && end ? 'both' : start ? 'start' : end ? 'end' : null);
    };
    update();
    root.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(root);
    return () => {
      root.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [ref]);
  return edges;
}
