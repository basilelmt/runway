import { useId, useState } from 'react';
import type { EnvelopeWithBalance } from '@shared/api-types';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useFundEnvelopes } from '@/api/hooks';
import { Amount, Button, Dialog, DialogFooter, Dot, MoneyInput, useToast } from '@/components/ui';
import { plural } from '@/lib/format';
import styles from './FundDialog.module.css';

type FundDialogProps = {
  open: boolean;
  onClose: () => void;
  envelopes: EnvelopeWithBalance[];
  toAllocate: number;
};

/** Répartition du mois : chaque enveloppe reçoit par défaut ce qui lui manque pour atteindre son budget. */
export function FundDialog({ open, onClose, envelopes, toAllocate }: FundDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Répartir l’argent du mois" description="Chaque enveloppe reçoit ce qui lui manque pour atteindre son budget. Ajuste si besoin." size="md">
      {open ? <FundForm envelopes={envelopes} toAllocate={toAllocate} onClose={onClose} /> : null}
    </Dialog>
  );
}

function FundForm({ envelopes, toAllocate, onClose }: Omit<FundDialogProps, 'open'>) {
  const toast = useToast();
  const [amounts, setAmounts] = useState<Record<number, number | null>>(() =>
    Object.fromEntries(envelopes.map((e) => [e.id, e.toFundThisMonth > 0 ? e.toFundThisMonth : null])),
  );
  const formId = useId();
  const fund = useFundEnvelopes({
    onSuccess: (created) => {
      toast.success(`${plural(created.length, 'enveloppe complétée', 'enveloppes complétées')}`);
      onClose();
    },
  });

  // Celles qui ont un budget d'abord, dans leur ordre ; les autres ensuite.
  const ordered = [...envelopes.filter((e) => e.monthlyTarget), ...envelopes.filter((e) => !e.monthlyTarget)];
  const items = Object.entries(amounts)
    .filter((entry): entry is [string, number] => entry[1] !== null && entry[1] > 0)
    .map(([id, amount]) => ({ envelopeId: Number(id), amount }));
  const total = items.reduce((s, i) => s + i.amount, 0);
  const left = toAllocate - total;

  return (
    <form
      id={formId}
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (items.length > 0) fund.mutate({ items });
      }}
    >
      <ul className={styles.list}>
        {ordered.map((env) => (
          <li key={env.id} className={styles.row}>
            <label htmlFor={`fund-${env.id}`} className={styles.name}>
              <Dot color={env.color} />
              <span>
                {env.name}
                <span className={styles.hint}>
                  {env.monthlyTarget
                    ? env.toFundThisMonth > 0
                      ? `il manque ${formatEuros(env.toFundThisMonth)} sur ${formatEuros(env.monthlyTarget)}`
                      : `budget de ${formatEuros(env.monthlyTarget)} atteint`
                    : 'sans budget mensuel'}
                </span>
              </span>
            </label>
            <MoneyInput id={`fund-${env.id}`} value={amounts[env.id] ?? null} onChange={(c) => setAmounts((a) => ({ ...a, [env.id]: c }))} placeholder="0,00" className={styles.input} />
          </li>
        ))}
      </ul>

      <DialogFooter
        info={
          <div className={styles.info}>
            <div className={styles.summary}>
              <div>
                <span className={styles.summaryLabel}>À répartir</span>
                <Amount cents={total} tone="neutral" size="lg" />
              </div>
              <div className={styles.summaryRight}>
                <span className={styles.summaryLabel}>{left >= 0 ? 'Restera non réparti' : 'Dépasse ce qui est disponible de'}</span>
                <Amount cents={Math.abs(left)} tone="neutral" className={left < 0 ? styles.negative : ''} />
              </div>
            </div>
            {left < 0 ? (
              <p className={styles.warning} role="status">
                Tu répartis plus que l’argent disponible sur tes comptes. Les enveloppes seront remplies, mais « Pas encore réparti » passera en négatif.
              </p>
            ) : null}
            {fund.error ? (
              <p className={styles.error} role="alert">
                {errorMessage(fund.error)}
              </p>
            ) : null}
          </div>
        }
      >
        <Button variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" form={formId} variant="primary" loading={fund.isPending} disabled={items.length === 0}>
          {items.length > 0 ? `Répartir ${formatEuros(total)}` : 'Répartir'}
        </Button>
      </DialogFooter>
    </form>
  );
}
