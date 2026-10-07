import { useRef } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useActiveIndicator } from '@/lib/motion';
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
  const indicator = useActiveIndicator(ref, links ? '[aria-current="page"]' : '[aria-selected="true"]', links ? pathname : value);

  const content = (item: TabItem<T>) => (
    <>
      {item.label}
      {item.count ? (
        <span key={item.count} className={['num', styles.count].join(' ')}>
          {item.count}
        </span>
      ) : null}
    </>
  );
  return (
    <div ref={ref} className={styles.tabs} role={links ? undefined : 'tablist'} aria-label={label}>
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
  );
}
