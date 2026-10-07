import { forwardRef } from 'react';
import styles from './AmountHero.module.css';
import { useMoneyText } from './useMoneyText';

const digitsOnly = (text: string) => text.replace(/[^\d,.\s]/g, '');

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

/** Montant en grand, le héros d'un formulaire d'opération. */
export const AmountHero = forwardRef<HTMLInputElement, AmountHeroProps>(function AmountHero(
  { id, value, onChange, sign = '', tone = 'neutral', invalid = false, describedBy, label = 'Montant', autoFocus },
  ref,
) {
  const money = useMoneyText({ value, onChange, sanitize: digitsOnly });
  const text = money.text;

  return (
    <div className={[styles.amount, tone === 'income' ? styles.income : '', invalid ? styles.invalid : ''].join(' ')}>
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
        onChange={(e) => money.change(e.target.value)}
        onBlur={money.blur}
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
