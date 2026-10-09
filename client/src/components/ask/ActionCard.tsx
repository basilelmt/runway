import { Check } from 'lucide-react';
import { useState } from 'react';
import type { AskActionView } from '@shared/api-types';
import { today } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useApplySorting, useCreateRecurringRule, useCreateTransaction, useUpdateEnvelope } from '@/api/hooks';
import { describeFrequency } from '@/components/recurring/frequency';
import { Button, Card, Checkbox, FieldError } from '@/components/ui';
import { keepTogether, plural } from '@/lib/format';
import styles from './ActionCard.module.css';

function describe(action: AskActionView): { title: string; detail: string | null } {
  switch (action.type) {
    case 'sort':
      return { title: `Ranger ${plural(action.count, 'dépense')} (${formatEuros(action.total)}) dans ${action.envelopeName}`, detail: null };
    case 'move':
      return action.fromEnvelopeId === null
        ? { title: `Répartir ${formatEuros(action.amount)} vers ${action.toName}`, detail: null }
        : { title: `Déplacer ${formatEuros(action.amount)} de ${action.fromName} vers ${action.toName}`, detail: null };
    case 'budget':
      return action.monthlyTarget === null
        ? { title: `Retirer le budget mensuel de ${action.envelopeName}`, detail: null }
        : { title: `Passer ${action.envelopeName} à ${formatEuros(action.monthlyTarget)} par mois`, detail: action.current ? `au lieu de ${formatEuros(action.current)}` : null };
    case 'recurring':
      return { title: `Créer la charge fixe ${action.rule.name} : ${formatEuros(action.rule.amount)}`, detail: `${describeFrequency({ ...action.rule, dayOfMonth: action.rule.dayOfMonth ?? null })} · ${action.accountName}` };
  }
}

/** Action proposée par Claude : rien ne s'applique sans le clic, et l'application passe par les routes habituelles. */
export function ActionCard({ action }: { action: AskActionView }) {
  const [withRule, setWithRule] = useState(true);
  const [done, setDone] = useState(false);
  const opts = { onSuccess: () => setDone(true) };
  const sorting = useApplySorting(opts);
  const allocation = useCreateTransaction(opts);
  const envelope = useUpdateEnvelope(opts);
  const recurring = useCreateRecurringRule(opts);
  const mutation = { sort: sorting, move: allocation, budget: envelope, recurring }[action.type];

  const apply = () => {
    switch (action.type) {
      case 'sort':
        return sorting.mutate({
          assignments: action.transactionIds.map((transactionId) => ({ transactionId, envelopeId: action.envelopeId })),
          rules: withRule && action.rulePattern ? [{ pattern: action.rulePattern, envelopeId: action.envelopeId }] : [],
        });
      case 'move':
        return allocation.mutate({
          kind: 'allocation',
          date: today(),
          amount: action.amount,
          label: 'Répartition',
          note: null,
          accountId: null,
          toAccountId: null,
          envelopeId: action.toEnvelopeId,
          fromEnvelopeId: action.fromEnvelopeId,
        });
      case 'budget':
        return envelope.mutate({ id: action.envelopeId, monthlyTarget: action.monthlyTarget });
      case 'recurring':
        return recurring.mutate(action.rule);
    }
  };

  const { title, detail } = describe(action);
  return (
    <li>
      <Card tone="raised" padding="sm" className={styles.card} data-done={done || undefined}>
        <div className={styles.body}>
          <div className={styles.heading}>
            <p className={styles.title}>{keepTogether(title)}</p>
            {detail ? <p className={styles.detail}>{keepTogether(detail)}</p> : null}
          </div>
          {action.type === 'sort' && action.rulePattern ? (
            <Checkbox label={keepTogether(`Créer aussi la règle « ${action.rulePattern} »`)} checked={withRule} disabled={done} onChange={(e) => setWithRule(e.target.checked)} />
          ) : null}
          <FieldError>{mutation.error ? errorMessage(mutation.error) : null}</FieldError>
        </div>
        {done ? (
          <span className={styles.done}>
            <Check aria-hidden />
            Fait
          </span>
        ) : (
          <Button size="sm" variant="primary" loading={mutation.isPending} onClick={apply} className={styles.apply}>
            Appliquer
          </Button>
        )}
      </Card>
    </li>
  );
}
