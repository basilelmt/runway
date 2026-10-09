import { useId, useState } from 'react';
import { isEnvelopeCharge } from '@core/budget';
import { today } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { envelopeInputSchema, type Envelope } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useCreateEnvelope, useRecurringRules, useUpdateEnvelope, type RecurringRuleView } from '@/api/hooks';
import { describeRhythm } from '@/components/recurring/frequency';
import { Button, Checkbox, Dialog, DialogFooter, Field, FieldError, Input, MoneyInput, useToast } from '@/components/ui';
import styles from './EnvelopeFormDialog.module.css';

export const ENVELOPE_COLORS = ['#4f8a5b', '#c2703d', '#3f6fae', '#9a4f9c', '#b8961a', '#2a8f8a', '#b74a5e', '#6b7280'];

type FormState = { name: string; color: string; monthlyExtra: number | null; isSavings: boolean };

type EnvelopeFormDialogProps = { open: boolean; envelope?: Envelope; onClose: () => void };

export function EnvelopeFormDialog({ open, envelope, onClose }: EnvelopeFormDialogProps) {
  const toast = useToast();
  const formId = useId();
  const chargesId = useId();
  const rules = useRecurringRules();
  const now = today();
  // Une nouvelle enveloppe n'a pas encore de charges.
  const charges = envelope ? (rules.data ?? []).filter((r) => r.envelopeId === envelope.id && isEnvelopeCharge(r, now)) : [];
  const [form, setForm] = useState<FormState>({
    name: envelope?.name ?? '',
    color: envelope?.color ?? ENVELOPE_COLORS[0]!,
    monthlyExtra: envelope?.monthlyExtra ?? null,
    isSavings: envelope?.isSavings ?? false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const create = useCreateEnvelope({
    onSuccess: () => {
      toast.success('Enveloppe créée');
      onClose();
    },
  });
  const update = useUpdateEnvelope({
    onSuccess: () => {
      toast.success('Enveloppe modifiée');
      onClose();
    },
  });
  const serverError = create.error ?? update.error;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = envelopeInputSchema.safeParse({ name: form.name, color: form.color, monthlyExtra: form.monthlyExtra, isSavings: form.isSavings });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    if (envelope) update.mutate({ id: envelope.id, ...parsed.data });
    else create.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onClose={onClose} title={envelope ? 'Modifier l’enveloppe' : 'Nouvelle enveloppe'} size="sm">
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        <Field label="Nom" error={errors.name}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Courses" autoFocus />}
        </Field>
        <Field label="Couleur" error={errors.color}>
          {(id, _describedBy, labelId) => (
            <div className={styles.colors} role="group" aria-labelledby={labelId}>
              {ENVELOPE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={[styles.swatch, form.color === c ? styles.swatchActive : ''].join(' ')}
                  style={{ background: c }}
                  onClick={() => set('color', c)}
                  aria-label={`Couleur ${c}`}
                  aria-pressed={form.color === c}
                />
              ))}
              <label className={[styles.custom, ENVELOPE_COLORS.includes(form.color) ? '' : styles.swatchActive].join(' ')} title="Couleur personnalisée">
                <input id={id} type="color" value={form.color} onChange={(e) => set('color', e.target.value)} aria-label="Couleur personnalisée" />
                <span style={{ background: form.color }} />
              </label>
            </div>
          )}
        </Field>
        <Field
          label={charges.length > 0 ? 'En plus des charges' : 'Budget mensuel'}
          hint={charges.length > 0 ? undefined : 'Ce que tu prévois d’y mettre chaque mois. « Répartir » le propose automatiquement et la prévision en tient compte.'}
          error={errors.monthlyExtra}
        >
          {(id, describedBy) => (
            <MoneyInput
              id={id}
              aria-describedby={[describedBy, charges.length > 0 ? chargesId : null].filter(Boolean).join(' ') || undefined}
              value={form.monthlyExtra}
              onChange={(c) => set('monthlyExtra', c)}
              placeholder="Facultatif"
            />
          )}
        </Field>
        {charges.length > 0 ? <ChargesBreakdown id={chargesId} charges={charges} extra={form.monthlyExtra} /> : null}
        <Checkbox
          label="Enveloppe d’épargne"
          hint="Ce qui en sort (versement vers un courtier, un PEA) compte comme mis de côté, pas comme une dépense."
          checked={form.isSavings}
          onChange={(e) => set('isSavings', e.target.checked)}
        />
        <FieldError>{serverError ? errorMessage(serverError) : null}</FieldError>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={create.isPending || update.isPending}>
            {envelope ? 'Enregistrer' : 'Créer l’enveloppe'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** Budget de l'enveloppe : chaque charge ramenée au mois, puis le complément et le total. */
function ChargesBreakdown({ id, charges, extra }: { id: string; charges: RecurringRuleView[]; extra: number | null }) {
  const total = charges.reduce((s, r) => s + r.monthlyEquivalent, 0) + (extra ?? 0);
  return (
    <ul id={id} className={styles.charges} aria-label="Charges de l’enveloppe">
      {charges.map((r) => {
        const rhythm = describeRhythm(r);
        return (
          <li key={r.id}>
            <span>{r.name}</span> <span className="num">{formatEuros(r.monthlyEquivalent)}</span>
            {rhythm ? <span> ({formatEuros(r.amount)} {rhythm})</span> : null}
          </li>
        );
      })}
      <li className={styles.total}>
        {extra ? `+ ${formatEuros(extra)} ` : ''}= <strong className="num">{formatEuros(total)}</strong> par mois
      </li>
    </ul>
  );
}
