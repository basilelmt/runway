import type { Frequency } from '@shared/schemas';

type Schedule = { frequency: Frequency; interval: number; dayOfMonth: number | null; startDate: string };

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function ordinalDay(day: number): string {
  return day === 1 ? 'le 1er' : `le ${day}`;
}

/** "Tous les mois le 5", "Toutes les 2 semaines", "Tous les ans le 15 juin". */
export function describeFrequency(rule: Schedule): string {
  const n = Math.max(1, rule.interval);
  switch (rule.frequency) {
    case 'daily':
      return n === 1 ? 'Tous les jours' : `Tous les ${n} jours`;
    case 'weekly':
      return n === 1 ? 'Toutes les semaines' : `Toutes les ${n} semaines`;
    case 'monthly': {
      const base = n === 1 ? 'Tous les mois' : `Tous les ${n} mois`;
      return rule.dayOfMonth ? `${base} ${ordinalDay(rule.dayOfMonth)}` : base;
    }
    case 'yearly': {
      const base = n === 1 ? 'Tous les ans' : `Tous les ${n} ans`;
      const month = MONTHS[Number(rule.startDate.slice(5, 7)) - 1] ?? '';
      return rule.dayOfMonth ? `${base} ${ordinalDay(rule.dayOfMonth)} ${month}` : base;
    }
  }
}
