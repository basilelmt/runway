import { useId, useState, type ReactNode } from 'react';
import { today } from '@shared/dates';
import { transactionInputSchema, type Transaction, type TransactionInput } from '@shared/schemas';
import { useEnvelopes } from '@/api/hooks';
import { AmountHero, Button, ChipPicker, DateField, DialogFooter, Field, Input, Textarea } from '@/components/ui';
import styles from './AllocationForm.module.css';

type AllocationFormProps = {
  initial?: Partial<Pick<Transaction, 'amount' | 'date' | 'label' | 'envelopeId' | 'fromEnvelopeId' | 'note'>>;
  submitLabel: string;
  submitting?: boolean;
  serverError?: string | null;
  onSubmit: (input: TransactionInput) => void;
  onCancel: () => void;
  footerStart?: ReactNode;
};

/** Répartition : de « Pas encore réparti » ou d'une enveloppe vers une autre. Aucun compte ne bouge. */
export function AllocationForm({ initial, submitLabel, submitting, serverError, onSubmit, onCancel, footerStart }: AllocationFormProps) {
  const envelopes = useEnvelopes();
  const formId = useId();
  const [amount, setAmount] = useState<number | null>(initial?.amount ?? null);
  const [fromEnvelopeId, setFromEnvelopeId] = useState<number | null>(initial?.fromEnvelopeId ?? null);
  const [envelopeId, setEnvelopeId] = useState<number | null>(initial?.envelopeId ?? null);
  const [date, setDate] = useState(initial?.date ?? today());
  const [label, setLabel] = useState(initial?.label ?? 'Répartition');
  const [note, setNote] = useState(initial?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clear = (key: string) => setErrors((e) => ({ ...e, [key]: '' }));

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = transactionInputSchema.safeParse({
      kind: 'allocation',
      date,
      amount: amount ?? 0,
      label,
      accountId: null,
      toAccountId: null,
      envelopeId,
      fromEnvelopeId,
      note: note.trim() || null,
    });
    const next: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
    if (amount === null || amount <= 0) next.amount = 'Indique un montant';
    if (Object.keys(next).length > 0 || !parsed.success) {
      setErrors(next);
      return;
    }
    onSubmit(parsed.data);
  }

  const envelopeOptions = (envelopes.data ?? []).map((env) => ({ value: env.id, label: env.name, color: env.color }));

  return (
    <form id={formId} className={styles.form} onSubmit={submit} noValidate>
      <div>
        <AmountHero
          id={`${formId}-amount`}
          value={amount}
          onChange={(cents) => {
            setAmount(cents);
            clear('amount');
          }}
          invalid={Boolean(errors.amount)}
          describedBy={errors.amount ? `${formId}-amount-error` : undefined}
          autoFocus
        />
        {errors.amount ? (
          <p id={`${formId}-amount-error`} className={styles.amountError} role="alert">
            {errors.amount}
          </p>
        ) : null}
      </div>

      <Field label="De" error={errors.fromEnvelopeId}>
        {(id, describedBy, labelId) => (
          <ChipPicker
            id={id}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            value={fromEnvelopeId}
            onChange={(v) => {
              setFromEnvelopeId(v);
              clear('fromEnvelopeId');
            }}
            options={[{ value: null, label: 'Pas encore réparti' }, ...envelopeOptions]}
          />
        )}
      </Field>

      <Field label="Vers" error={errors.envelopeId}>
        {(id, describedBy, labelId) => (
          <ChipPicker
            id={id}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            value={envelopeId}
            onChange={(v) => {
              setEnvelopeId(v);
              clear('envelopeId');
              clear('fromEnvelopeId');
            }}
            options={envelopeOptions}
          />
        )}
      </Field>

      <div className={styles.grid}>
        <Field label="Date" error={errors.date}>
          {(id, describedBy) => <DateField id={id} aria-describedby={describedBy} value={date} onChange={(v) => v && setDate(v)} />}
        </Field>
        <Field label="Libellé" error={errors.label}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                clear('label');
              }}
            />
          )}
        </Field>
      </div>

      <Field label="Note">{(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Facultatif" />}</Field>

      {serverError ? (
        <p className={styles.serverError} role="alert">
          {serverError}
        </p>
      ) : null}

      <DialogFooter start={footerStart}>
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" form={formId} variant="primary" loading={submitting}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
