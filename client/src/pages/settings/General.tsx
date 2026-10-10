import { Download, FileJson } from 'lucide-react';
import { useState } from 'react';
import { settingsSchema } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useSaveSettings, useSettings } from '@/api/hooks';
import { Button, ErrorState, Field, Input, ListRow, ListRowSkeleton, SectionHeader, useToast } from '@/components/ui';
import { BackupSettings } from './BackupSettings';
import { MerchantSettings } from './MerchantSettings';
import styles from './Settings.module.css';

/** Télécharge un export sans quitter la page (la ligne qui le déclenche n'est pas un vrai lien). */
function downloadExport(href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = '';
  a.click();
}

export function GeneralSettings() {
  const toast = useToast();
  const settings = useSettings();
  const save = useSaveSettings({ onSuccess: () => toast.success('Réglages enregistrés'), onError: (e) => toast.error(errorMessage(e)) });

  const [horizon, setHorizon] = useState('90');
  const [model, setModel] = useState('');
  const [errors, setErrors] = useState<{ horizon?: string; model?: string }>({});

  // Le formulaire se remplit à l'arrivée des réglages (et se resynchronise après enregistrement).
  const [loaded, setLoaded] = useState<typeof settings.data | null>(null);
  if (settings.data && settings.data !== loaded) {
    setLoaded(settings.data);
    setHorizon(String(settings.data.forecastHorizonDays));
    setModel(settings.data.claudeModel);
  }

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = settingsSchema.safeParse({ ...settings.data, forecastHorizonDays: Number(horizon), claudeModel: model });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'forecastHorizonDays') next.horizon = 'Entre 7 et 730 jours';
        if (issue.path[0] === 'claudeModel') next.model = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <div>
      <section className={styles.section}>
        <SectionHeader
          title="Prévision et tri"
          description={
            <>
              Jusqu’où Runway regarde devant pour repérer un découvert, et quel modèle Claude range tes opérations.
              <br />
              Le tri lance Claude Code installé sur cette machine (<code className="mono">claude -p</code>), sans clé API. S’il n’est pas connecté, lance <code className="mono">claude</code> puis{' '}
              <code className="mono">/login</code> dans un terminal.
            </>
          }
        />
        {settings.isPending ? (
          <ListRowSkeleton rows={2} />
        ) : settings.isError ? (
          <ErrorState title="Impossible de charger les réglages" description={errorMessage(settings.error)} onRetry={() => settings.refetch()} />
        ) : (
          <form className={styles.form} onSubmit={submit} noValidate>
            <Field label="Horizon de prévision (jours)" error={errors.horizon} hint="Entre 7 et 730.">
              {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="number" min={7} max={730} value={horizon} onChange={(e) => setHorizon(e.target.value)} className={styles.short} />}
            </Field>
            <Field label="Modèle Claude" error={errors.model} hint="Vide pour le modèle par défaut de Claude Code, sinon par exemple sonnet, opus ou haiku.">
              {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Par défaut" className={styles.short} />}
            </Field>
            <div className={styles.actions}>
              <Button type="submit" variant="primary" loading={save.isPending}>
                Enregistrer
              </Button>
            </div>
          </form>
        )}
      </section>

      <MerchantSettings />

      <BackupSettings />

      <section className={styles.section}>
        <SectionHeader
          title="Exports"
          description={
            <>
              Toutes les données tiennent dans un fichier local, <code className="mono">data/runway.db</code>, sauvegardé automatiquement (section Données ci-dessus). Ces exports en sont une copie lisible.
            </>
          }
        />
        <ul className="ledger">
          <ListRow
            lead={<FileJson aria-hidden />}
            title="Export JSON"
            meta="Tout : comptes, enveloppes, opérations, marchands, charges fixes, règles, réglages."
            onClick={() => downloadExport('/api/export.json')}
            clickLabel="Télécharger l’export JSON"
          />
          <ListRow
            lead={<Download aria-hidden />}
            title="Export CSV"
            meta="Les opérations seules, lisibles dans un tableur."
            onClick={() => downloadExport('/api/export.csv')}
            clickLabel="Télécharger l’export CSV"
          />
        </ul>
      </section>
    </div>
  );
}
