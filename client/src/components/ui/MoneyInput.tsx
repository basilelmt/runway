import type { InputHTMLAttributes } from 'react';
import styles from './Input.module.css';
import { useMoneyText } from './useMoneyText';

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  /** Valeur en centimes, null si vide ou invalide. */
  value: number | null;
  onChange: (cents: number | null) => void;
  allowNegative?: boolean;
};

/** Saisie d'un montant en euros, valeur exposée en centimes entiers. */
export function MoneyInput({ value, onChange, allowNegative = false, className, onBlur, ...rest }: MoneyInputProps) {
  const money = useMoneyText({ value, onChange, allowNegative });

  return (
    <span className={styles.moneyWrap}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={[styles.input, styles.money, className ?? ''].join(' ')}
        value={money.text}
        onChange={(e) => money.change(e.target.value)}
        onBlur={(e) => {
          money.blur();
          onBlur?.(e);
        }}
        {...rest}
      />
    </span>
  );
}
