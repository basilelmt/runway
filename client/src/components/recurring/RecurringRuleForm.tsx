import { useId, useState } from 'react';
import { formatDateMedium, today } from '@shared/dates';
import { recurringRuleInputSchema, type Frequency, type RecurringRule, type RecurringRuleInput, type TransactionKind } from '@shared/schemas';
import { useAccounts, useEnvelopes } from '@/api/hooks';
import { AmountHero, Button, ChipPicker, DateField, DialogFooter, Field, FormSection, Input, Segmented, Select } from '@/components/ui';
import { FREQUENCY_LABELS, KIND_LABELS } from '@/lib/format';
import { describeFrequency } from './frequency';
import styles from './RecurringRuleForm.module.css';

/** Le budget mensuel des enveloppes remplace les règles d'allocation. */
type RuleKind = Exclude<TransactionKind, 'allocation'>;

type Values = {
  name: string;
  kind: RuleKind;
  amount: number | null;
  label: string;
  accountId: number | null;
  toAccountId: number | null;
  envelopeId: number | null;
  fromEnvelopeId: number | null;
  frequency: Frequency;
  interval: string;
  dayOfMonth: string;
  startDate: string;
  endDate: string | null;
};

type Props = {
  initial?: RecurringRule;
  submitting?: boolean;
  serverError?: string | null;
  onSubmit: (input: RecurringRuleInput) => void;
  onCancel: () => void;
};

const RULE_KINDS: RuleKind[] = ['expense', 'income', 'transfer'];
const KIND_OPTIONS = RULE_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }));
const FREQUENCY_OPTIONS = (Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }));

function initialValues(initial?: RecurringRule): Values {
  const start = initial?.startDate ?? today();
  return {
    name: initial?.name ?? '',
    kind: initial && initial.kind !== 'allocation' ? initial.kind : 'expense',
    amount: initial?.amount ?? null,
    label: initial?.label ?? '',
    accountId: initial?.accountId ?? null,
    toAccountId: initial?.toAccountId ?? null,
    envelopeId: initial?.envelopeId ?? null,
    fromEnvelopeId: initial?.fromEnvelopeId ?? null,
    frequency: initial?.frequency ?? 'monthly',
    interval: String(initial?.interval ?? 1),
    dayOfMonth: String(initial?.dayOfMonth ?? Number(start.slice(8, 10))),
    startDate: start,
    endDate: initial?.endDate ?? null,
  };
}

function toInput(v: Values, active: boolean): unknown {
  const monthly = v.frequency === 'monthly' || v.frequency === 'yearly';
  return {
    name: v.name.trim(),
    kind: v.kind,
    amount: v.amount ?? 0,
    label: v.label.trim() || v.name.trim(),
    accountId: v.accountId,
    toAccountId: v.kind === 'transfer' ? v.toAccountId : null,
    envelopeId: v.kind === 'expense' ? v.envelopeId : null,
    fromEnvelopeId: null,
    frequency: v.frequency,
    interval: Number(v.interval) || 1,
    dayOfMonth: monthly ? Number(v.dayOfMonth) || null : null,
    startDate: v.startDate,
    endDate: v.endDate,
    active,
  };
}

/** Formulaire d'une règle récurrente : modèle d'opération plus fréquence. */
export function RecurringRuleForm({ initial, submitting, serverError, onSubmit, onCancel }: Props) {
  const accounts = useAccounts();
  const envelopes = useEnvelopes();
  const [values, setValues] = useState(() => initialValues(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const formId = useId();

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // Sans choix explicite, le premier compte est pris par défaut : le select n'est jamais vide.
  const effective: Values = { ...values, accountId: values.accountId ?? accounts.data?.[0]?.id ?? null };

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = recurringRuleInputSchema.safeParse(toInput(effective, initial?.active ?? true));
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Values | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      if (values.amount === null) next.amount = 'Montant requis';
      setErrors(next);
      return;
    }
    onSubmit(parsed.data);
  }

  const accountOptions = (accounts.data ?? []).map((a) => (
    <option key={a.id} value={a.id}>
      {a.name}
    </option>
  ));
  const monthly = values.frequency === 'monthly' || values.frequency === 'yearly';
  const unitLabel = { daily: 'jours', weekly: 'semaines', monthly: 'mois', yearly: 'ans' }[values.frequency];
  const summary = [
    describeFrequency({ frequency: values.frequency, interval: Number(values.interval) || 1, dayOfMonth: monthly ? Number(values.dayOfMonth) || null : null, startDate: values.startDate }),
    `à partir du ${formatDateMedium(values.startDate)}`,
    values.endDate ? `jusqu’au ${formatDateMedium(values.endDate)}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <form id={formId} className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.top}>
        <Segmented label="Type d'opération" value={values.kind} onChange={(k) => set('kind', k)} options={KIND_OPTIONS} />
        <AmountHero
          id={`${formId}-amount`}
          value={values.amount}
          onChange={(c) => set('amount', c)}
          sign={values.kind === 'expense' ? '−' : values.kind === 'income' ? '+' : ''}
          tone={values.kind === 'income' ? 'income' : 'neutral'}
          invalid={Boolean(errors.amount)}
          describedBy={errors.amount ? `${formId}-amount-error` : undefined}
        />
        {errors.amount ? (
          <p id={`${formId}-amount-error`} className={styles.amountError} role="alert">
            {errors.amount}
          </p>
        ) : null}
      </div>

      <div className={styles.grid}>
        <Field label="Nom" error={errors.name}>
          {(id, by) => <Input id={id} aria-describedby={by} value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="Loyer" autoFocus />}
        </Field>
        <Field label="Libellé des opérations" hint="Par défaut, le nom de la règle" error={errors.label}>
          {(id, by) => <Input id={id} aria-describedby={by} value={values.label} onChange={(e) => set('label', e.target.value)} placeholder={values.name || 'Loyer'} />}
        </Field>
      </div>

      <div className={styles.grid}>
        <Field label={values.kind === 'transfer' ? 'Depuis le compte' : 'Compte'} error={errors.accountId}>
          {(id, by) => (
            <Select id={id} aria-describedby={by} value={effective.accountId ?? ''} onChange={(e) => set('accountId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choisir</option>
              {accountOptions}
            </Select>
          )}
        </Field>
        {values.kind === 'transfer' ? (
          <Field label="Vers le compte" error={errors.toAccountId}>
            {(id, by) => (
              <Select id={id} aria-describedby={by} value={values.toAccountId ?? ''} onChange={(e) => set('toAccountId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">Choisir</option>
                {accountOptions}
              </Select>
            )}
          </Field>
        ) : null}
      </div>

      {values.kind === 'expense' ? (
        <Field label="Enveloppe" error={errors.envelopeId}>
          {(id, by, labelId) => (
            <ChipPicker
              id={id}
              aria-labelledby={labelId}
              aria-describedby={by}
              value={values.envelopeId}
              onChange={(v) => set('envelopeId', v)}
              options={[{ value: null, label: 'À ranger' }, ...(envelopes.data ?? []).map((env) => ({ value: env.id, label: env.name, color: env.color }))]}
            />
          )}
        </Field>
      ) : null}

      <FormSection title="Quand">
        <div className={styles.grid}>
          <Field label="Répéter" error={errors.frequency}>
            {(id, by) => (
              <Select id={id} aria-describedby={by} value={values.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)}>
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={`Tous les N ${unitLabel}`} error={errors.interval}>
            {(id, by) => <Input id={id} aria-describedby={by} type="number" min={1} max={365} value={values.interval} onChange={(e) => set('interval', e.target.value)} />}
          </Field>
          {monthly ? (
            <Field label="Jour du mois" hint="31 tombe le dernier jour des mois courts" error={errors.dayOfMonth}>
              {(id, by) => <Input id={id} aria-describedby={by} type="number" min={1} max={31} value={values.dayOfMonth} onChange={(e) => set('dayOfMonth', e.target.value)} />}
            </Field>
          ) : null}
        </div>
        <div className={styles.grid}>
          <Field label="À partir du" error={errors.startDate}>
            {(id, by) => <DateField id={id} aria-describedby={by} value={values.startDate} onChange={(v) => v && set('startDate', v)} />}
          </Field>
          <Field label="Jusqu’au" error={errors.endDate}>
            {(id, by) => <DateField id={id} aria-describedby={by} value={values.endDate} onChange={(v) => set('endDate', v)} placeholder="Sans fin" clearable min={values.startDate} />}
          </Field>
        </div>
        <p className={styles.summary} aria-live="polite">
          {summary}
        </p>
      </FormSection>

      {serverError ? (
        <p className={styles.serverError} role="alert">
          {serverError}
        </p>
      ) : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" form={formId} variant="primary" loading={submitting}>
          {initial ? 'Enregistrer' : 'Ajouter'}
        </Button>
      </DialogFooter>
    </form>
  );
}
