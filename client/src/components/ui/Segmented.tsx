import type { ReactNode } from 'react';
import styles from './Segmented.module.css';

type Option<T extends string> = { value: T; label: string; icon?: ReactNode };

type SegmentedProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  label: string;
  size?: 'sm' | 'md';
};

/** Groupe de boutons exclusifs (onglets de type, presets de période). */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: SegmentedProps<T>) {
  return (
    <div className={[styles.group, styles[size]].join(' ')} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={[styles.option, o.value === value ? styles.active : ''].join(' ')}
          onClick={() => onChange(o.value)}
        >
          {o.icon ? (
            <span className={styles.icon} aria-hidden="true">
              {o.icon}
            </span>
          ) : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}
