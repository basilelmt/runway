import { useState, type InputHTMLAttributes } from 'react';
import { parseEuros } from '@shared/money';
import styles from './Input.module.css';

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  /** Valeur en centimes, null si vide ou invalide. */
  value: number | null;
  onChange: (cents: number | null) => void;
  allowNegative?: boolean;
};

function toText(cents: number | null): string {
  if (cents === null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Saisie d'un montant en euros, valeur exposée en centimes entiers. */
export function MoneyInput({ value, onChange, allowNegative = false, className, onBlur, ...rest }: MoneyInputProps) {
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);

  // Resynchronise le texte quand la valeur change de l'extérieur (reset de formulaire), pendant le rendu.
  if (value !== lastValue) {
    setLastValue(value);
    if (parseEuros(text) !== value) setText(toText(value));
  }

  return (
    <span className={styles.moneyWrap}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={[styles.input, styles.money, className ?? ''].join(' ')}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const cents = parseEuros(next);
          onChange(cents === null ? null : allowNegative ? cents : Math.abs(cents));
        }}
        onBlur={(e) => {
          const cents = parseEuros(text);
          if (cents !== null) setText(toText(allowNegative ? cents : Math.abs(cents)));
          onBlur?.(e);
        }}
        {...rest}
      />
    </span>
  );
}
