import { Download, FileJson } from 'lucide-react';
import { useState } from 'react';
import { settingsSchema } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useSaveSettings, useSettings } from '@/api/hooks';
import { Button, Field, Input, SkeletonRows, useToast } from '@/components/ui';
import { MerchantSettings } from './MerchantSettings';
import styles from './Settings.module.css';

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
        <div className={styles.aside}>
          <h2>Prévision et tri</h2>
          <p>Jusqu’où Runway regarde devant pour repérer un découvert, et quel modèle Claude range tes opérations.</p>
          <p>
            Le tri lance Claude Code installé sur cette machine (<code className="mono">claude -p</code>), sans clé API. S’il n’est pas connecté, lance <code className="mono">claude</code> puis{' '}
            <code className="mono">/login</code> dans un terminal.
          </p>
        </div>
        <div className={styles.content}>
          {settings.isPending ? (
            <SkeletonRows rows={2} />
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
        </div>
      </section>

      <MerchantSettings />

      <section className={styles.section}>
        <div className={styles.aside}>
          <h2>Sauvegarde</h2>
          <p>
            Toutes les données tiennent dans un fichier local, <code className="mono">data/runway.db</code>. Ces exports en sont une copie lisible.
          </p>
        </div>
        <div className={styles.content}>
          <ul className={styles.downloads}>
            <li>
              <a className={['hover-row', styles.download].join(' ')} href="/api/export.json" download>
                <FileJson aria-hidden />
                <span>
                  <strong>Export JSON</strong>
                  <span className={styles.downloadHint}>Tout : comptes, enveloppes, opérations, marchands, charges fixes, règles, réglages.</span>
                </span>
              </a>
            </li>
            <li>
              <a className={['hover-row', styles.download].join(' ')} href="/api/export.csv" download>
                <Download aria-hidden />
                <span>
                  <strong>Export CSV</strong>
                  <span className={styles.downloadHint}>Les opérations seules, lisibles dans un tableur.</span>
                </span>
              </a>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
