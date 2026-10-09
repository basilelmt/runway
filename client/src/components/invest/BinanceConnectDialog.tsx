import { useId, useState } from 'react';
import { binanceKeysSchema } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useSaveBinance } from '@/api/hooks';
import { Button, Dialog, DialogFooter, Field, FieldError, Input, useToast } from '@/components/ui';
import styles from './Forms.module.css';

type Props = { open: boolean; onClose: () => void };

/** Saisie d'une clé API Binance en lecture seule. */
export function BinanceConnectDialog({ open, onClose }: Props) {
  const formId = useId();
  const toast = useToast();
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [errors, setErrors] = useState<{ apiKey?: string; apiSecret?: string }>({});
  // La première synchro part toute seule depuis l'écran dès que Binance apparaît relié.
  const save = useSaveBinance({
    onSuccess: () => {
      toast.success('Binance relié, synchronisation en cours');
      onClose();
    },
  });

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = binanceKeysSchema.safeParse({ apiKey, apiSecret });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as 'apiKey' | 'apiSecret'] ??= issue.message;
      return setErrors(next);
    }
    save.mutate(parsed.data);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Relier Binance"
      description="Runway lit tes soldes et ton historique d’achats. Il ne peut ni acheter, ni vendre, ni retirer."
    >
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        <ol className={styles.help}>
          <li>Sur binance.com : Profil, puis Gestion des API, puis Créer une API (clé générée par le système).</li>
          <li>Ne laisse cochée que « Activer la lecture ». Runway refuse une clé qui peut trader ou retirer.</li>
          <li>Colle la clé API et la clé secrète ci-dessous.</li>
        </ol>
        <Field label="Clé API" error={errors.apiKey}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} className="mono" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoFocus />}
        </Field>
        <Field label="Clé secrète" error={errors.apiSecret}>
          {(id, describedBy) => (
            <Input id={id} aria-describedby={describedBy} className="mono" type="password" autoComplete="off" spellCheck={false} value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
          )}
        </Field>
        <FieldError>{save.error ? errorMessage(save.error) : null}</FieldError>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={save.isPending}>
            Relier
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
