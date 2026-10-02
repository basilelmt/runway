import { useMemo, useState } from 'react';
import { today } from '@shared/dates';
import { transactionInputSchema, transactionKinds, type Transaction, type TransactionInput, type TransactionKind } from '@shared/schemas';
import { useAccounts, useEnvelopes } from '@/api/hooks';
import { Button, DateInput, Field, Input, MoneyInput, Segmented, Select } from '@/components/ui';
import { KIND_LABELS } from '@/lib/format';
import styles from './TransactionForm.module.css';

export type TransactionFormValues = {
  kind: TransactionKind;
  date: string;
  amount: number | null;
  label: string;
  accountId: number | null;
  toAccountId: number | null;
  envelopeId: number | null;
  fromEnvelopeId: number | null;
  note: string;
};

type TransactionFormProps = {
  initial?: Partial<Transaction> & { kind?: TransactionKind };
  /** Restreint les types proposés (ex. seulement allocation). */
  kinds?: TransactionKind[];
  submitLabel?: string;
  submitting?: boolean;
  serverError?: string | null;
  onSubmit: (input: TransactionInput) => void;
  onCancel?: () => void;
};

const TO_ALLOCATE = 'to-allocate';

function initialValues(initial: TransactionFormProps['initial'], kinds: TransactionKind[]): TransactionFormValues {
  return {
    kind: initial?.kind ?? kinds[0] ?? 'expense',
    date: initial?.date ?? today(),
    amount: initial?.amount ?? null,
    label: initial?.label ?? '',
    accountId: initial?.accountId ?? null,
    toAccountId: initial?.toAccountId ?? null,
    envelopeId: initial?.envelopeId ?? null,
    fromEnvelopeId: initial?.fromEnvelopeId ?? null,
    note: initial?.note ?? '',
  };
}

function toInput(v: TransactionFormValues): TransactionInput {
  return {
    kind: v.kind,
    date: v.date,
    amount: v.amount ?? 0,
    label: v.label.trim(),
    accountId: v.kind === 'allocation' ? null : v.accountId,
    toAccountId: v.kind === 'transfer' ? v.toAccountId : null,
    envelopeId: v.kind === 'expense' || v.kind === 'allocation' ? v.envelopeId : null,
    fromEnvelopeId: v.kind === 'allocation' ? v.fromEnvelopeId : null,
    note: v.note.trim() || null,
  };
}

/** Formulaire d'opération, partagé entre la saisie rapide, l'édition et les dialogues d'allocation. */
export function TransactionForm({ initial, kinds = [...transactionKinds], submitLabel = 'Enregistrer', submitting, serverError, onSubmit, onCancel }: TransactionFormProps) {
  const accounts = useAccounts();
  const envelopes = useEnvelopes();
  const [values, setValues] = useState(() => initialValues(initial, kinds));
  const [errors, setErrors] = useState<Partial<Record<keyof TransactionFormValues, string>>>({});

  const set = <K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // Sans choix explicite, le premier compte est pris par défaut : le select n'est jamais vide.
  const effective: TransactionFormValues = { ...values, accountId: values.accountId ?? accounts.data?.[0]?.id ?? null };

  const kindOptions = useMemo(() => kinds.map((k) => ({ value: k, label: KIND_LABELS[k] })), [kinds]);

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = transactionInputSchema.safeParse(toInput(effective));
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof TransactionFormValues | undefined;
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
  const envelopeOptions = (envelopes.data ?? []).map((env) => (
    <option key={env.id} value={env.id}>
      {env.name}
    </option>
  ));

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {kinds.length > 1 ? (
        <Segmented label="Type d'opération" value={values.kind} onChange={(k) => set('kind', k)} options={kindOptions} />
      ) : null}

      <div className={styles.grid}>
        <Field label="Montant" error={errors.amount}>
          {(id, describedBy) => (
            <MoneyInput id={id} aria-describedby={describedBy} value={values.amount} onChange={(c) => set('amount', c)} placeholder="0,00" autoFocus />
          )}
        </Field>
        <Field label="Date" error={errors.date}>
          {(id, describedBy) => <DateInput id={id} aria-describedby={describedBy} value={values.date} onChange={(e) => set('date', e.target.value)} />}
        </Field>
      </div>

      <Field label="Libellé" error={errors.label}>
        {(id, describedBy) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={values.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder={values.kind === 'allocation' ? 'Budget du mois' : values.kind === 'income' ? 'Salaire' : 'Carrefour'}
          />
        )}
      </Field>

      {values.kind !== 'allocation' ? (
        <div className={styles.grid}>
          <Field label={values.kind === 'transfer' ? 'Depuis le compte' : 'Compte'} error={errors.accountId}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} value={effective.accountId ?? ''} onChange={(e) => set('accountId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">Choisir</option>
                {accountOptions}
              </Select>
            )}
          </Field>
          {values.kind === 'transfer' ? (
            <Field label="Vers le compte" error={errors.toAccountId}>
              {(id, describedBy) => (
                <Select id={id} aria-describedby={describedBy} value={values.toAccountId ?? ''} onChange={(e) => set('toAccountId', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Choisir</option>
                  {accountOptions}
                </Select>
              )}
            </Field>
          ) : null}
          {values.kind === 'expense' ? (
            <Field label="Enveloppe" error={errors.envelopeId} hint={values.envelopeId === null ? 'Sans enveloppe, la dépense ira dans "À trier"' : undefined}>
              {(id, describedBy) => (
                <Select id={id} aria-describedby={describedBy} value={values.envelopeId ?? ''} onChange={(e) => set('envelopeId', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">À trier plus tard</option>
                  {envelopeOptions}
                </Select>
              )}
            </Field>
          ) : null}
        </div>
      ) : (
        <div className={styles.grid}>
          <Field label="Depuis" error={errors.fromEnvelopeId}>
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={values.fromEnvelopeId ?? TO_ALLOCATE}
                onChange={(e) => set('fromEnvelopeId', e.target.value === TO_ALLOCATE ? null : Number(e.target.value))}
              >
                <option value={TO_ALLOCATE}>À répartir</option>
                {envelopeOptions}
              </Select>
            )}
          </Field>
          <Field label="Vers l'enveloppe" error={errors.envelopeId}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} value={values.envelopeId ?? ''} onChange={(e) => set('envelopeId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">Choisir</option>
                {envelopeOptions}
              </Select>
            )}
          </Field>
        </div>
      )}

      <Field label="Note" error={errors.note}>
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={values.note} onChange={(e) => set('note', e.target.value)} placeholder="Facultatif" />}
      </Field>

      {serverError ? (
        <p className={styles.serverError} role="alert">
          {serverError}
        </p>
      ) : null}

      <div className={styles.actions}>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
        <Button type="submit" variant="primary" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
