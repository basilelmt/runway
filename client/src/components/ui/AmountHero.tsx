import { forwardRef, useState } from 'react';
import { parseEuros } from '@shared/money';
import styles from './AmountHero.module.css';

type AmountHeroProps = {
  id: string;
  /** Centimes positifs, null si vide ou invalide. */
  value: number | null;
  onChange: (cents: number | null) => void;
  sign?: '−' | '+' | '';
  tone?: 'neutral' | 'income';
  invalid?: boolean;
  describedBy?: string;
  label?: string;
  autoFocus?: boolean;
};

function toText(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

/** Montant en grand, le héros d'un formulaire d'opération. */
export const AmountHero = forwardRef<HTMLInputElement, AmountHeroProps>(function AmountHero(
  { id, value, onChange, sign = '', tone = 'neutral', invalid = false, describedBy, label = 'Montant', autoFocus },
  ref,
) {
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);

  // Resynchronise le texte quand la valeur change de l'extérieur (remise à zéro, suggestion).
  if (value !== lastValue) {
    setLastValue(value);
    const parsed = parseEuros(text);
    if ((parsed === null ? null : Math.abs(parsed)) !== value) setText(toText(value));
  }

  return (
    <div className={[styles.amount, styles[tone], invalid ? styles.invalid : ''].join(' ')}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      {sign ? (
        <span className={styles.sign} aria-hidden>
          {sign}
        </span>
      ) : null}
      <input
        ref={ref}
        id={id}
        className={['num', styles.input].join(' ')}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={text}
        size={Math.max(1, text.length || 1)}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d,.\s]/g, '');
          setText(next);
          const cents = parseEuros(next);
          const result = cents === null ? null : Math.abs(cents);
          setLastValue(result);
          onChange(result);
        }}
        onBlur={() => {
          const cents = parseEuros(text);
          if (cents !== null) setText(toText(Math.abs(cents)));
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
      />
      <span className={styles.currency} aria-hidden>
        €
      </span>
    </div>
  );
});
