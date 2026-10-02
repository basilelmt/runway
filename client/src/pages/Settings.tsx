import { Download, FileJson } from 'lucide-react';
import { useState } from 'react';
import { settingsSchema } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useSaveSettings, useSettings } from '@/api/hooks';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, Field, Input, SkeletonRows, useToast } from '@/components/ui';
import styles from './Settings.module.css';

export function SettingsPage() {
  const toast = useToast();
  const settings = useSettings();
  const save = useSaveSettings({ onSuccess: () => toast.success('Paramètres enregistrés'), onError: (e) => toast.error(errorMessage(e)) });

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
    const parsed = settingsSchema.safeParse({ forecastHorizonDays: Number(horizon), claudeModel: model });
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
    <div className="page">
      <PageHeader title="Paramètres" />

      <div className={styles.grid}>
        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>Prévision et Claude</h2>
          {settings.isPending ? (
            <SkeletonRows rows={2} />
          ) : (
            <form className={styles.form} onSubmit={submit} noValidate>
              <Field label="Horizon de prévision par défaut (jours)" error={errors.horizon} hint="Sur combien de jours projeter les soldes. Entre 7 et 730.">
                {(id, describedBy) => (
                  <Input id={id} aria-describedby={describedBy} type="number" min={7} max={730} value={horizon} onChange={(e) => setHorizon(e.target.value)} className={styles.short} />
                )}
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
        </Card>

        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>Sauvegarde</h2>
          <p className={styles.text}>Toutes les données tiennent dans un fichier SQLite local. Ces exports en sont une copie lisible.</p>
          <ul className={styles.downloads}>
            <li>
              <a className={styles.download} href="/api/export.json" download>
                <FileJson aria-hidden />
                <span>
                  <strong>Export JSON</strong>
                  <span className={styles.downloadHint}>Tout : comptes, enveloppes, opérations, récurrences, règles, paramètres.</span>
                </span>
              </a>
            </li>
            <li>
              <a className={styles.download} href="/api/export.csv" download>
                <Download aria-hidden />
                <span>
                  <strong>Export CSV</strong>
                  <span className={styles.downloadHint}>Les opérations seules, lisibles dans un tableur.</span>
                </span>
              </a>
            </li>
          </ul>
        </Card>

        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>Trier avec Claude</h2>
          <p className={styles.text}>
            Le bouton « Trier avec Claude » de la page À trier lance Claude Code installé sur cette machine (<code className="mono">claude -p</code>), sans clé API ni outil : il lit
            les opérations, tes enveloppes et tes règles, puis propose un rangement que tu valides.
          </p>
          <p className={styles.text}>
            Il faut être connecté : dans un terminal, lance <code className="mono">claude</code> puis <code className="mono">/login</code>.
          </p>
        </Card>

        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>À propos</h2>
          <p className={styles.text}>
            <strong>Runway</strong>, suivi de dépenses par enveloppes, en local. Base de données dans <code className="mono">data/runway.db</code>.
          </p>
        </Card>
      </div>
    </div>
  );
}
