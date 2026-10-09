import { Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDateShort } from '@shared/dates';
import { errorMessage } from '@/api/client';
import {
  useAccounts,
  useCreateRecurringRule,
  useDeleteRecurringRule,
  useEnvelopes,
  useRecurringRules,
  useSetRuleActive,
  useUpdateRecurringRule,
  type RecurringRuleView,
} from '@/api/hooks';
import { describeFrequency } from '@/components/recurring/frequency';
import { RecurringRuleForm } from '@/components/recurring/RecurringRuleForm';
import { Amount, Badge, Button, ConfirmDialog, Dialog, EmptyState, EnvelopeTag, ErrorState, GroupLabel, ListRow, ListRowSkeleton, RowMenu, SectionHeader, useToast } from '@/components/ui';
import styles from './FixedCharges.module.css';

type DialogState = { mode: 'create' } | { mode: 'edit'; rule: RecurringRuleView } | { mode: 'delete'; rule: RecurringRuleView } | null;

/** Ce qui revient chaque mois : salaire, loyer, abonnements, virements programmés. */
export function FixedCharges() {
  const rules = useRecurringRules();
  const accounts = useAccounts(true);
  const envelopes = useEnvelopes(true);
  const [dialog, setDialog] = useState<DialogState>(null);
  const toast = useToast();

  const done = (message: string) => {
    toast.success(message);
    setDialog(null);
  };
  const create = useCreateRecurringRule({ onSuccess: (r) => done(`« ${r.name} » ajouté`) });
  const update = useUpdateRecurringRule({ onSuccess: (r) => done(`« ${r.name} » enregistré`) });
  const setActive = useSetRuleActive({ onSuccess: (r) => toast.success(r.active ? `« ${r.name} » reprend` : `« ${r.name} » en pause`), onError: (e) => toast.error(errorMessage(e)) });
  const remove = useDeleteRecurringRule({ onSuccess: () => done('Supprimé') });

  const accountName = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a.name])), [accounts.data]);
  const envelopeById = useMemo(() => new Map((envelopes.data ?? []).map((e) => [e.id, e])), [envelopes.data]);

  const list = (rules.data ?? []).filter((r) => r.kind !== 'allocation');
  const incomes = list.filter((r) => r.kind === 'income');
  const outgoings = list.filter((r) => r.kind !== 'income');

  /** Fréquence et destination : comptes du virement, enveloppe de la charge ou compte du revenu. */
  function meta(rule: RecurringRuleView) {
    const frequency = describeFrequency(rule);
    const account = rule.accountId ? accountName.get(rule.accountId) : '';
    if (rule.kind === 'transfer') return `${frequency} · ${account} → ${rule.toAccountId ? accountName.get(rule.toAccountId) : ''}`;
    if (rule.kind === 'expense') {
      const env = rule.envelopeId ? envelopeById.get(rule.envelopeId) : null;
      return env ? (
        <>
          <span>{frequency}</span>
          <EnvelopeTag name={env.name} color={env.color} />
        </>
      ) : (
        `${frequency} · à ranger`
      );
    }
    return `${frequency} · ${account}`;
  }

  const row = (rule: RecurringRuleView) => (
    <ListRow
      key={rule.id}
      muted={!rule.active}
      onClick={() => setDialog({ mode: 'edit', rule })}
      clickLabel={`Modifier ${rule.name}`}
      title={rule.name}
      meta={
        <>
          {!rule.active ? <Badge tone="warning">En pause</Badge> : null}
          {meta(rule)}
        </>
      }
      trail={<Amount cents={rule.kind === 'income' ? rule.amount : -rule.amount} tone={rule.kind === 'income' ? 'always' : 'neutral'} />}
      trailSub={rule.nextDate ? `le ${formatDateShort(rule.nextDate)}` : 'terminée'}
      actions={
        <RowMenu
          label={`Actions pour ${rule.name}`}
          items={[
            rule.active
              ? { label: 'Mettre en pause', icon: <Pause />, onSelect: () => setActive.mutate({ id: rule.id, active: false }) }
              : { label: 'Reprendre', icon: <Play />, onSelect: () => setActive.mutate({ id: rule.id, active: true }) },
            { label: 'Modifier', icon: <Pencil />, onSelect: () => setDialog({ mode: 'edit', rule }) },
            { label: 'Supprimer', icon: <Trash2 />, onSelect: () => setDialog({ mode: 'delete', rule }), danger: true },
          ]}
        />
      }
    />
  );

  return (
    <section aria-labelledby="fixed-title">
      <SectionHeader
        id="fixed-title"
        title="Charges fixes et revenus"
        description="Ce qui revient tout seul. Runway les attend dans la prévision et les rapproche du relevé quand ils passent."
        aside={
          <Button size="sm" icon={<Plus />} onClick={() => setDialog({ mode: 'create' })}>
            Ajouter
          </Button>
        }
      />

      {rules.isPending ? (
        <ListRowSkeleton rows={5} actions />
      ) : rules.isError ? (
        <ErrorState title="Impossible de charger les charges fixes" description={errorMessage(rules.error)} onRetry={() => rules.refetch()} />
      ) : (
        <div className={styles.body}>
          {list.length === 0 ? (
            <EmptyState
              icon={<Repeat />}
              title="Aucune charge fixe ni revenu"
              description="Ajoute ton salaire, ton loyer et tes abonnements : leurs montants comptent dans le budget de leur enveloppe."
              action={
                <Button variant="secondary" icon={<Plus />} onClick={() => setDialog({ mode: 'create' })}>
                  Ajouter
                </Button>
              }
            />
          ) : (
            <div>
              {incomes.length > 0 ? (
                <>
                  <GroupLabel>Revenus</GroupLabel>
                  <ul className="ledger">{incomes.map(row)}</ul>
                </>
              ) : null}
              {outgoings.length > 0 ? (
                <>
                  <GroupLabel>Charges et virements</GroupLabel>
                  <ul className="ledger">{outgoings.map(row)}</ul>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      <Dialog
        open={dialog?.mode === 'create' || dialog?.mode === 'edit'}
        onClose={() => setDialog(null)}
        title={dialog?.mode === 'edit' ? `Modifier « ${dialog.rule.name} »` : 'Nouvelle charge fixe ou revenu'}
        size="md"
      >
        {dialog?.mode === 'create' ? (
          <RecurringRuleForm onSubmit={(input) => create.mutate(input)} onCancel={() => setDialog(null)} submitting={create.isPending} serverError={create.error ? errorMessage(create.error) : null} />
        ) : dialog?.mode === 'edit' ? (
          <RecurringRuleForm
            key={dialog.rule.id}
            initial={dialog.rule}
            onSubmit={(input) => update.mutate({ id: dialog.rule.id, ...input })}
            onCancel={() => setDialog(null)}
            submitting={update.isPending}
            serverError={update.error ? errorMessage(update.error) : null}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={dialog?.mode === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => dialog?.mode === 'delete' && remove.mutate(dialog.rule.id)}
        title="Supprimer cette ligne ?"
        description="Les opérations déjà passées restent. Plus aucune occurrence ne sera attendue."
        confirmLabel="Supprimer"
        loading={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : null}
      >
        {dialog?.mode === 'delete' ? (
          <span>
            <strong>{dialog.rule.name}</strong>, {describeFrequency(dialog.rule).toLowerCase()}.
          </span>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
