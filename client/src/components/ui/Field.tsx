import { useId, type ReactNode } from 'react';
import styles from './Field.module.css';

type FieldProps = {
  label: string;
  hint?: string;
  error?: string | null;
  /** `labelId` nomme les groupes (pastilles) qu'un `<label for>` ne peut pas nommer. */
  children: (id: string, describedBy: string | undefined, labelId: string) => ReactNode;
  className?: string;
};

/** Étiquette, champ, aide et erreur, reliés par les attributs ARIA. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && !error ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={[styles.field, error ? styles.invalid : '', className ?? ''].join(' ')}>
      <label id={labelId} htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children(id, describedBy, labelId)}
      {hint && !error ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
