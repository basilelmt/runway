import type { InputHTMLAttributes } from 'react';
import styles from './Checkbox.module.css';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  hint?: string;
};

/** Case à cocher avec son libellé et une ligne d'explication. */
export function Checkbox({ label, hint, className, ...rest }: CheckboxProps) {
  return (
    <label className={[styles.check, className ?? ''].join(' ')}>
      <input type="checkbox" className={styles.box} {...rest} />
      <span className={styles.text}>
        {label}
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </span>
    </label>
  );
}
