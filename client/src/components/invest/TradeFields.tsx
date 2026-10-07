import { tradeInputSchema, type TradeInput } from '@shared/schemas';
import { formatEuros } from '@shared/money';
import { today } from '@shared/dates';
import { DateField, Field, Input, MoneyInput, Segmented } from '@/components/ui';
import styles from './Forms.module.css';

export type TradeDraft = { side: 'buy' | 'sell'; date: string; quantity: string; amount: number | null; fees: number | null };
export type TradeErrors = Partial<Record<keyof TradeDraft, string>>;

export const emptyTrade = (fees = 0): TradeDraft => ({ side: 'buy', date: today(), quantity: '', amount: null, fees });

export function tradeFromInput(t: TradeInput): TradeDraft {
  return { side: t.side, date: t.date, quantity: t.quantity.replace('.', ','), amount: t.amount, fees: t.fees };
}

/** Valide un brouillon ; renvoie le mouvement prêt à envoyer ou les erreurs par champ. */
export function parseTrade(d: TradeDraft): { ok: true; trade: TradeInput } | { ok: false; errors: TradeErrors } {
  const r = tradeInputSchema.safeParse({ ...d, amount: d.amount ?? undefined, fees: d.fees ?? 0 });
  if (r.success) return { ok: true, trade: r.data };
  const errors: TradeErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path[0] as keyof TradeDraft | undefined;
    if (key && !errors[key]) errors[key] = key === 'amount' ? 'Montant manquant' : issue.message;
  }
  return { ok: false, errors };
}

type Props = { draft: TradeDraft; errors: TradeErrors; onChange: (d: TradeDraft) => void; unit: string; allowSell?: boolean };

/** Champs d'un achat ou d'une vente : sens, date, quantité, montant hors frais, frais. */
export function TradeFields({ draft, errors, onChange, unit, allowSell = true }: Props) {
  const set = <K extends keyof TradeDraft>(k: K, v: TradeDraft[K]) => onChange({ ...draft, [k]: v });
  const qty = Number(draft.quantity.replace(',', '.'));
  const unitPrice = draft.amount !== null && qty > 0 ? Math.round(draft.amount / qty) : null;

  return (
    <div className={styles.fields}>
      {allowSell ? (
        <Segmented
          label="Sens du mouvement"
          value={draft.side}
          onChange={(v) => set('side', v)}
          options={[
            { value: 'buy', label: 'Achat' },
            { value: 'sell', label: 'Vente' },
          ]}
        />
      ) : null}
      <div className={styles.pair}>
        <Field label="Date" error={errors.date}>
          {(id, describedBy) => <DateField id={id} aria-describedby={describedBy} value={draft.date} max={today()} shortcuts onChange={(v) => v && set('date', v)} />}
        </Field>
        <Field label={unit === 'part' ? 'Nombre de parts' : `Quantité (${unit})`} error={errors.quantity}>
          {(id, describedBy) => (
            <Input id={id} aria-describedby={describedBy} inputMode="decimal" autoComplete="off" className="num" value={draft.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="5" />
          )}
        </Field>
      </div>
      <div className={styles.pair}>
        <Field label={draft.side === 'buy' ? 'Montant payé, hors frais' : 'Montant reçu, hors frais'} error={errors.amount} hint={unitPrice !== null ? `Soit ${formatEuros(unitPrice)} par ${unit}` : undefined}>
          {(id, describedBy) => <MoneyInput id={id} aria-describedby={describedBy} value={draft.amount} onChange={(c) => set('amount', c)} placeholder="0,00" />}
        </Field>
        <Field label="Frais" error={errors.fees}>
          {(id, describedBy) => <MoneyInput id={id} aria-describedby={describedBy} value={draft.fees} onChange={(c) => set('fees', c)} placeholder="0,00" />}
        </Field>
      </div>
    </div>
  );
}
