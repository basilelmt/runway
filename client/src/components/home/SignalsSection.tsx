import { AlertCircle, Banknote, Clock, Receipt, Repeat, ShieldAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { AnySignal } from '@shared/api-types';
import type { RecurringRule, RecurringRuleInput, SignalKind } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useCreateRecurringRule, useDismissSignal, useSignals, useStartBankConnection, useUpdateRecurringRule } from '@/api/hooks';
import { RecurringRuleForm } from '@/components/recurring/RecurringRuleForm';
import { Button, ButtonLink, Dialog, Disclosure, ListRow, RowMenu, SectionHeader, useToast } from '@/components/ui';
import { signalHref, signalPhrase } from '@/lib/signals';

/** Au-delà, les signaux suivants sont repliés sous « Voir tout ». */
const VISIBLE_COUNT = 5;

const ICONS: Record<SignalKind, ReactNode> = {
  unusual_expense: <Receipt aria-hidden />,
  new_recurring: <Repeat aria-hidden />,
  price_change: <Banknote aria-hidden />,
  missing_charge: <Clock aria-hidden />,
  consent_expiring: <ShieldAlert aria-hidden />,
  sync_error: <AlertCircle aria-hidden />,
};

/** Modèle d'opération complet, montant remplacé : sert à mettre à jour une charge fixe sans rien changer d'autre. */
function ruleInputWithAmount(rule: RecurringRule, amount: number): RecurringRuleInput {
  return {
    name: rule.name,
    kind: rule.kind,
    amount,
    label: rule.label,
    accountId: rule.accountId,
    toAccountId: rule.toAccountId,
    envelopeId: rule.envelopeId,
    fromEnvelopeId: rule.fromEnvelopeId,
    frequency: rule.frequency,
    interval: rule.interval,
    dayOfMonth: rule.dayOfMonth,
    startDate: rule.startDate,
    endDate: rule.endDate,
    active: rule.active,
    triggersFunding: rule.triggersFunding,
    fundsNextMonth: rule.fundsNextMonth,
  };
}

/** Section « Signaux » de l'Accueil : visible seulement quand il y a quelque chose à signaler. */
export function SignalsSection() {
  const signals = useSignals();
  const list = signals.data ?? [];
  if (list.length === 0) return null;

  const visible = list.slice(0, VISIBLE_COUNT);
  const rest = list.slice(VISIBLE_COUNT);

  return (
    <section aria-labelledby="signals-title">
      <SectionHeader id="signals-title" title="Signaux" />
      <ul className={['ledger', 'stagger'].join(' ')}>
        {visible.map((s) => (
          <SignalRow key={s.id} signal={s} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <Disclosure label="Voir tout" count={rest.length}>
          <ul className="ledger">
            {rest.map((s) => (
              <SignalRow key={s.id} signal={s} />
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </section>
  );
}

function SignalRow({ signal }: { signal: AnySignal }) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const dismiss = useDismissSignal({ onError: (e) => toast.error(errorMessage(e)) });
  const updateRule = useUpdateRecurringRule({
    onSuccess: () => toast.success('Charge mise à jour'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const createRule = useCreateRecurringRule({
    onSuccess: (r) => {
      toast.success(`« ${r.name} » ajoutée`);
      setCreating(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const startConnection = useStartBankConnection({
    onSuccess: (a) => {
      window.open(a.url, '_blank', 'noopener');
      toast.success('Onglet banque ouvert : termine dans Réglages > Banque');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const href = signalHref(signal);
  const action: ReactNode = (() => {
    switch (signal.kind) {
      case 'unusual_expense':
      case 'missing_charge':
      case 'sync_error':
        return href ? (
          <ButtonLink to={href} size="sm">
            {signal.kind === 'sync_error' ? 'Réglages > Banque' : 'Voir l’opération'}
          </ButtonLink>
        ) : null;
      case 'new_recurring':
        return (
          <Button size="sm" onClick={() => setCreating(true)}>
            Créer la charge fixe
          </Button>
        );
      case 'price_change':
        return (
          <Button
            size="sm"
            loading={updateRule.isPending}
            onClick={() => updateRule.mutate({ id: signal.payload.ruleId, ...ruleInputWithAmount(signal.payload.rule, signal.payload.newAmount) })}
          >
            Mettre à jour la charge
          </Button>
        );
      case 'consent_expiring':
        return (
          <Button size="sm" loading={startConnection.isPending} onClick={() => startConnection.mutate(signal.payload.connectionId)}>
            Renouveler
          </Button>
        );
    }
  })();

  return (
    <>
      <ListRow
        lead={ICONS[signal.kind]}
        title={signalPhrase(signal)}
        trail={action}
        actions={
          <RowMenu label="Actions pour ce signal" items={[{ label: 'Écarter', onSelect: () => dismiss.mutate(signal.id) }]} />
        }
      />
      {signal.kind === 'new_recurring' ? (
        <Dialog open={creating} onClose={() => setCreating(false)} title="Nouvelle charge fixe" size="md">
          <RecurringRuleForm
            defaults={{ name: signal.payload.merchantName, label: signal.payload.merchantName, amount: signal.payload.amount, envelopeId: signal.payload.envelopeId, dayOfMonth: signal.payload.dayOfMonth }}
            onSubmit={(input) => createRule.mutate(input)}
            onCancel={() => setCreating(false)}
            submitting={createRule.isPending}
            serverError={createRule.error ? errorMessage(createRule.error) : null}
          />
        </Dialog>
      ) : null}
    </>
  );
}
