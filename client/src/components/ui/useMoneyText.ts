import { useState } from 'react';
import { parseEuros } from '@shared/money';

function toText(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

type MoneyTextOptions = {
  /** Centimes, null si vide ou invalide. */
  value: number | null;
  onChange: (cents: number | null) => void;
  allowNegative?: boolean;
  /** Filtre appliqué à la frappe (ex. ne garder que chiffres et séparateurs). */
  sanitize?: (text: string) => string;
};

/**
 * Texte d'un champ de montant en euros, synchronisé avec une valeur en centimes :
 * la saisie reste libre pendant la frappe, et elle est normalisée (« 12,50 ») en sortie de champ.
 */
export function useMoneyText({ value, onChange, allowNegative = false, sanitize }: MoneyTextOptions) {
  const normalize = (cents: number | null) => (cents === null || allowNegative ? cents : Math.abs(cents));
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);

  // Resynchronise le texte quand la valeur change de l'extérieur (remise à zéro, suggestion), pendant le rendu.
  if (value !== lastValue) {
    setLastValue(value);
    if (normalize(parseEuros(text)) !== value) setText(toText(value));
  }

  return {
    text,
    change(next: string) {
      const clean = sanitize ? sanitize(next) : next;
      setText(clean);
      onChange(normalize(parseEuros(clean)));
    },
    blur() {
      const cents = normalize(parseEuros(text));
      if (cents !== null) setText(toText(cents));
    },
  };
}
