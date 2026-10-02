import { Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { PageHeader } from '@/components/layout/PageHeader';
import { describeFrequency } from '@/components/recurring/frequency';
import { RecurringRuleForm } from '@/components/recurring/RecurringRuleForm';
import { Amount, Badge, Button, Card, Dialog, Dot, EmptyState, SkeletonRows, useToast } from '@/components/ui';
import { formatDateShort, KIND_LABELS } from '@/lib/format';
import styles from './Recurring.module.css';

type DialogState = { mode: 'create' } | { mode: 'edit'; rule: RecurringRuleView } | { mode: 'delete'; rule: RecurringRuleView } | null;

export function RecurringPage() {
  const rules = useRecurringRules();
  const accounts = useAccounts(true);
  const envelopes = useEnvelopes(true);
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);

  const create = useCreateRecurringRule({ onSuccess: (r) => { toast.success(`Règle « ${r.name} » créée`); setDialog(null); } });
  const update = useUpdateRecurringRule({ onSuccess: (r) => { toast.success(`Règle « ${r.name} » enregistrée`); setDialog(null); } });
  const setActive = useSetRuleActive({ onSuccess: (r) => toast.success(r.active ? `« ${r.name} » reprise` : `« ${r.name} » en pause`), onError: (e) => toast.error(errorMessage(e)) });
  const remove = useDeleteRecurringRule({ onSuccess: () => { toast.success('Règle supprimée'); setDialog(null); }, onError: (e) => toast.error(errorMessage(e)) });

  const accountName = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a.name])), [accounts.data]);
  const envelopeById = useMemo(() => new Map((envelopes.data ?? []).map((e) => [e.id, e])), [envelopes.data]);

  const totals = useMemo(() => {
    const active = (rules.data ?? []).filter((r) => r.active);
    return {
      expense: active.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.monthlyEquivalent, 0),
      income: active.filter((r) => r.kind === 'income').reduce((s, r) => s + r.monthlyEquivalent, 0),
    };
  }, [rules.data]);

  function target(rule: RecurringRuleView) {
    switch (rule.kind) {
      case 'expense': {
        const env = rule.envelopeId ? envelopeById.get(rule.envelopeId) : null;
        return (
          <>
            {rule.accountId ? accountName.get(rule.accountId) : ''}
            {env ? (
              <>
                {' · '}
                <Dot color={env.color} size={8} /> {env.name}
              </>
            ) : (
              <> · à trier</>
            )}
          </>
        );
      }
      case 'income':
        return rule.accountId ? accountName.get(rule.accountId) : '';
      case 'transfer':
        return `${rule.accountId ? accountName.get(rule.accountId) : ''} → ${rule.toAccountId ? accountName.get(rule.toAccountId) : ''}`;
      case 'allocation': {
        const to = rule.envelopeId ? envelopeById.get(rule.envelopeId) : null;
        const from = rule.fromEnvelopeId ? envelopeById.get(rule.fromEnvelopeId) : null;
        return (
          <>
            {from ? from.name : 'À répartir'} → {to ? <Dot color={to.color} size={8} /> : null} {to?.name ?? ''}
          </>
        );
      }
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Récurrences"
        subtitle="Ce qui revient tous les mois, toutes les semaines, tous les ans."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setDialog({ mode: 'create' })}>
            Nouvelle règle
          </Button>
        }
      />

      {rules.data && rules.data.length > 0 ? (
        <div className={styles.totals}>
          <Card padding="sm" className={styles.total}>
            <span className="eyebrow">Revenus par mois</span>
            <Amount cents={totals.income} size="lg" tone="neutral" />
          </Card>
          <Card padding="sm" className={styles.total}>
            <span className="eyebrow">Dépenses par mois</span>
            <Amount cents={-totals.expense} size="lg" />
          </Card>
          <Card padding="sm" className={styles.total}>
            <span className="eyebrow">Reste par mois</span>
            <Amount cents={totals.income - totals.expense} size="lg" tone="always" />
          </Card>
        </div>
      ) : null}

      {rules.isPending ? (
        <SkeletonRows rows={4} />
      ) : rules.isError ? (
        <EmptyState title="Impossible de charger les règles" description={errorMessage(rules.error)} />
      ) : rules.data.length === 0 ? (
        <EmptyState
          icon={<Repeat />}
          title="Aucune récurrence"
          description="Loyer, salaire, abonnements, budget mensuel des enveloppes : tout ce qui revient alimente la prévision."
          action={
            <Button variant="primary" icon={<Plus />} onClick={() => setDialog({ mode: 'create' })}>
              Créer une règle
            </Button>
          }
        />
      ) : (
        <div className="ledger">
          {rules.data.map((rule) => (
            <div key={rule.id} className={[styles.row, rule.active ? '' : styles.paused].join(' ')}>
              <div className={styles.main}>
                <div className={styles.nameLine}>
                  <span className={styles.name}>{rule.name}</span>
                  <Badge tone="neutral">{KIND_LABELS[rule.kind]}</Badge>
                  {!rule.active ? <Badge tone="warning">En pause</Badge> : null}
                </div>
                <p className={styles.details}>
                  {describeFrequency(rule)} · {target(rule)}
                </p>
              </div>
              <div className={styles.next}>
                <span className="eyebrow">Prochaine</span>
                <span className="mono">{rule.nextDate ? formatDateShort(rule.nextDate) : '—'.replace('—', 'aucune')}</span>
              </div>
              <Amount cents={rule.kind === 'expense' ? -rule.amount : rule.amount} tone={rule.kind === 'income' ? 'always' : 'auto'} />
              <div className={styles.actions}>
                <Button variant="ghost" size="sm" icon={rule.active ? <Pause /> : <Play />} onClick={() => setActive.mutate({ id: rule.id, active: !rule.active })} aria-label={rule.active ? 'Mettre en pause' : 'Reprendre'} title={rule.active ? 'Mettre en pause' : 'Reprendre'} />
                <Button variant="ghost" size="sm" icon={<Pencil />} onClick={() => setDialog({ mode: 'edit', rule })} aria-label="Modifier" title="Modifier" />
                <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={() => setDialog({ mode: 'delete', rule })} aria-label="Supprimer" title="Supprimer" />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialog?.mode === 'create' || dialog?.mode === 'edit'} onClose={() => setDialog(null)} title={dialog?.mode === 'edit' ? `Modifier « ${dialog.rule.name} »` : 'Nouvelle règle récurrente'} size="lg">
        {dialog?.mode === 'create' ? (
          <RecurringRuleForm onSubmit={(input) => create.mutate(input)} onCancel={() => setDialog(null)} submitting={create.isPending} serverError={create.error ? errorMessage(create.error) : null} />
        ) : dialog?.mode === 'edit' ? (
          <RecurringRuleForm key={dialog.rule.id} initial={dialog.rule} onSubmit={(input) => update.mutate({ id: dialog.rule.id, ...input })} onCancel={() => setDialog(null)} submitting={update.isPending} serverError={update.error ? errorMessage(update.error) : null} />
        ) : null}
      </Dialog>

      <Dialog
        open={dialog?.mode === 'delete'}
        onClose={() => setDialog(null)}
        title="Supprimer cette règle ?"
        description="Les opérations déjà créées restent, mais plus aucune occurrence ne sera générée."
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
      </Dialog>
    </div>
  );
}
