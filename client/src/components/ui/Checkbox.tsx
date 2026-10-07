import { useId, type InputHTMLAttributes } from 'react';
import styles from './Checkbox.module.css';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  hint?: string;
};

/** Case à cocher avec son libellé et une ligne d'explication. */
export function Checkbox({ label, hint, className, id, 'aria-describedby': describedBy, ...rest }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = useId();
  const describedByIds = [hint ? hintId : null, describedBy].filter(Boolean).join(' ') || undefined;

  return (
    <div className={[styles.check, className ?? ''].join(' ')}>
      <input
        type="checkbox"
        id={inputId}
        className={styles.box}
        aria-describedby={describedByIds}
        {...rest}
      />
      <span className={styles.text}>
        <label htmlFor={inputId}>{label}</label>
        {hint ? (
          <span id={hintId} className={styles.hint}>
            {hint}
          </span>
        ) : null}
      </span>
    </div>
  );
}
