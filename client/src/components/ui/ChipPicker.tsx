import { useRef, type KeyboardEvent } from 'react';
import { Dot } from './Badge';
import styles from './ChipPicker.module.css';

export type ChipOption<T> = { value: T; label: string; color?: string };

type ChipPickerProps<T extends string | number | null> = {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

/** Choix unique parmi quelques options visibles : groupe radio en pastilles, piloté aux flèches. */
export function ChipPicker<T extends string | number | null>({ options, value, onChange, id, ...aria }: ChipPickerProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.findIndex((o) => o.value === value);
  const tabbable = selected === -1 ? 0 : selected;

  function move(from: number, delta: number) {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(index, 1);
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(index, -1);
    }
  }

  return (
    <div id={id} role="radiogroup" className={styles.chips} {...aria}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === tabbable ? 0 : -1}
          className={[styles.chip, o.value === value ? styles.active : ''].join(' ')}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.color ? <Dot color={o.color} size={8} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}
