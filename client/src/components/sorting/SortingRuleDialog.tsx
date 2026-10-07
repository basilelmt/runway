import { useId, useState } from 'react';
import { sortingRuleInputSchema, type Envelope, type SortingRule, type SortingRuleInput } from '@shared/schemas';
import { Button, ChipPicker, Dialog, DialogFooter, Field, Input } from '@/components/ui';
import styles from './SortingRuleDialog.module.css';

type SortingRuleDialogProps = {
  open: boolean;
  onClose: () => void;
  envelopes: Envelope[];
  initial?: SortingRule | null;
  onSubmit: (input: SortingRuleInput) => void;
  submitting?: boolean;
  serverError?: string | null;
};

/** Création ou édition d'une règle de tri : motif et enveloppe. */
export function SortingRuleDialog({ open, onClose, envelopes, initial, onSubmit, submitting, serverError }: SortingRuleDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={initial ? 'Modifier la règle' : 'Nouvelle règle de tri'} size="md">
      {open ? <RuleForm key={initial?.id ?? 'new'} envelopes={envelopes} initial={initial} onSubmit={onSubmit} onCancel={onClose} submitting={submitting} serverError={serverError} /> : null}
    </Dialog>
  );
}

function RuleForm({
  envelopes,
  initial,
  onSubmit,
  onCancel,
  submitting,
  serverError,
}: Pick<SortingRuleDialogProps, 'envelopes' | 'initial' | 'onSubmit' | 'submitting' | 'serverError'> & { onCancel: () => void }) {
  const [pattern, setPattern] = useState(initial?.pattern ?? '');
  const [envelopeId, setEnvelopeId] = useState<number | null>(initial?.envelopeId ?? envelopes[0]?.id ?? null);
  const [errors, setErrors] = useState<{ pattern?: string; envelopeId?: string }>({});
  const formId = useId();

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = sortingRuleInputSchema.safeParse({ pattern, envelopeId });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'pattern' && !next.pattern) next.pattern = issue.message;
        if (key === 'envelopeId' && !next.envelopeId) next.envelopeId = 'Enveloppe requise';
      }
      setErrors(next);
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <form id={formId} className={styles.form} onSubmit={submit} noValidate>
      <Field label="Le libellé contient" error={errors.pattern} hint="Sans tenir compte de la casse ni des accents">
        {(id, describedBy) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={pattern}
            autoFocus
            placeholder="carrefour"
            className="mono"
            onChange={(e) => {
              setPattern(e.target.value);
              setErrors((er) => ({ ...er, pattern: undefined }));
            }}
          />
        )}
      </Field>
      <Field label="Ranger dans" error={errors.envelopeId}>
        {(id, describedBy, labelId) => (
          <ChipPicker
            id={id}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            value={envelopeId}
            onChange={(v) => {
              setEnvelopeId(v);
              setErrors((er) => ({ ...er, envelopeId: undefined }));
            }}
            options={envelopes.map((env) => ({ value: env.id, label: env.name, color: env.color }))}
          />
        )}
      </Field>
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
          {initial ? 'Enregistrer' : 'Créer la règle'}
        </Button>
      </DialogFooter>
    </form>
  );
}
