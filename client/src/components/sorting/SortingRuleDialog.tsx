import { useState } from 'react';
import { sortingRuleInputSchema, type Envelope, type SortingRule, type SortingRuleInput } from '@shared/schemas';
import { Button, Dialog, Field, Input, Select } from '@/components/ui';
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
    <Dialog open={open} onClose={onClose} title={initial ? 'Modifier la règle' : 'Nouvelle règle de tri'} size="sm">
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
    <form className={styles.form} onSubmit={submit} noValidate>
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
        {(id, describedBy) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={envelopeId ?? ''}
            onChange={(e) => {
              setEnvelopeId(e.target.value ? Number(e.target.value) : null);
              setErrors((er) => ({ ...er, envelopeId: undefined }));
            }}
          >
            <option value="">Choisir</option>
            {envelopes.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {serverError ? (
        <p className={styles.serverError} role="alert">
          {serverError}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {initial ? 'Enregistrer' : 'Créer la règle'}
        </Button>
      </div>
    </form>
  );
}
