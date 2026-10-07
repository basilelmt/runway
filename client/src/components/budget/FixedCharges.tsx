import { Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
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
import { Amount, Badge, Button, Dialog, Dot, Skeleton, useToast } from '@/components/ui';
import styles from './FixedCharges.module.css';

type DialogState = { mode: 'create' } | { mode: 'edit'; rule: RecurringRuleView } | { mode: 'delete'; rule: RecurringRuleView } | null;

/** Ce qui revient chaque mois (loyer, salaire, abonnements) et ce qu'il reste pour vivre et épargner. */
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
  const monthly = (kind: RecurringRuleView['kind']) => list.filter((r) => r.active && r.kind === kind).reduce((s, r) => s + r.monthlyEquivalent, 0);
  const income = monthly('income');
  const expense = monthly('expense');
  const transfer = monthly('transfer');

  function target(rule: RecurringRuleView) {
    const account = rule.accountId ? accountName.get(rule.accountId) : '';
    if (rule.kind === 'transfer') return `${account} → ${rule.toAccountId ? accountName.get(rule.toAccountId) : ''}`;
    if (rule.kind === 'expense') {
      const env = rule.envelopeId ? envelopeById.get(rule.envelopeId) : null;
      return env ? (
        <>
          <Dot color={env.color} size={8} /> {env.name}
        </>
      ) : (
        'à ranger'
      );
    }
    return account;
  }

  const row = (rule: RecurringRuleView) => (
    <li key={rule.id} className={['hover-row', styles.row, rule.active ? '' : styles.paused].join(' ')}>
      <div className={styles.main}>
        <span className={styles.name}>
          {rule.name}
          {!rule.active ? <Badge tone="warning">En pause</Badge> : null}
        </span>
        <span className={styles.details}>
          {describeFrequency(rule)} · {target(rule)}
        </span>
      </div>
      <span className={styles.next}>{rule.nextDate ? `le ${formatDateShort(rule.nextDate)}` : 'terminée'}</span>
      <Amount cents={rule.kind === 'income' ? rule.amount : -rule.amount} tone={rule.kind === 'income' ? 'always' : 'neutral'} className={styles.amount} />
      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          icon={rule.active ? <Pause /> : <Play />}
          onClick={() => setActive.mutate({ id: rule.id, active: !rule.active })}
          aria-label={rule.active ? `Mettre ${rule.name} en pause` : `Reprendre ${rule.name}`}
          title={rule.active ? 'Mettre en pause' : 'Reprendre'}
        />
        <Button variant="ghost" size="sm" icon={<Pencil />} onClick={() => setDialog({ mode: 'edit', rule })} aria-label={`Modifier ${rule.name}`} title="Modifier" />
        <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={() => setDialog({ mode: 'delete', rule })} aria-label={`Supprimer ${rule.name}`} title="Supprimer" />
      </div>
    </li>
  );

  return (
    <section aria-labelledby="fixed-title" className={styles.section}>
      <div className="section-title">
        <h2 id="fixed-title">Charges fixes et revenus</h2>
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setDialog({ mode: 'create' })}>
          Ajouter
        </Button>
      </div>
      <p className={styles.intro}>Ce qui revient tout seul. Runway les attend dans la prévision et les rapproche du relevé quand ils passent.</p>

      {rules.isPending ? (
        <Skeleton height={160} />
      ) : rules.isError ? (
        <p className={styles.error} role="alert">
          {errorMessage(rules.error)}
        </p>
      ) : (
        <>
          <dl className={styles.totals}>
            <div>
              <dt>Revenus par mois</dt>
              <dd>
                <Amount cents={income} size="lg" tone="neutral" />
              </dd>
            </div>
            <div>
              <dt>Charges par mois</dt>
              <dd>
                <Amount cents={expense} size="lg" tone="neutral" />
              </dd>
            </div>
            {transfer > 0 ? (
              <div>
                <dt>Virements programmés</dt>
                <dd>
                  <Amount cents={transfer} size="lg" tone="neutral" />
                </dd>
              </div>
            ) : null}
            <div className={styles.rest}>
              <dt>Reste pour vivre et investir</dt>
              <dd>
                <Amount cents={income - expense - transfer} size="lg" tone="neutral" className={income - expense - transfer < 0 ? styles.negative : ''} animate />
              </dd>
            </div>
          </dl>

          {list.length === 0 ? (
            <p className={styles.intro}>Ajoute ton salaire, ton loyer et tes abonnements pour voir ce qu’il te reste chaque mois.</p>
          ) : (
            <div className={styles.groups}>
              {incomes.length > 0 ? (
                <div>
                  <h3 className={styles.groupTitle}>Revenus</h3>
                  <ul className="ledger">{incomes.map(row)}</ul>
                </div>
              ) : null}
              {outgoings.length > 0 ? (
                <div>
                  <h3 className={styles.groupTitle}>Charges et virements</h3>
                  <ul className="ledger">{outgoings.map(row)}</ul>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}

      <Dialog
        open={dialog?.mode === 'create' || dialog?.mode === 'edit'}
        onClose={() => setDialog(null)}
        title={dialog?.mode === 'edit' ? `Modifier « ${dialog.rule.name} »` : 'Nouvelle charge fixe ou revenu'}
        size="lg"
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

      <Dialog
        open={dialog?.mode === 'delete'}
        onClose={() => setDialog(null)}
        title="Supprimer cette ligne ?"
        description="Les opérations déjà passées restent. Plus aucune occurrence ne sera attendue."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Annuler
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => dialog?.mode === 'delete' && remove.mutate(dialog.rule.id)}>
              Supprimer
            </Button>
          </>
        }
      >
        {dialog?.mode === 'delete' ? (
          <p>
            <strong>{dialog.rule.name}</strong>, {describeFrequency(dialog.rule).toLowerCase()}.
          </p>
        ) : null}
        {remove.error ? (
          <p className={styles.error} role="alert">
            {errorMessage(remove.error)}
          </p>
        ) : null}
      </Dialog>
    </section>
  );
}
