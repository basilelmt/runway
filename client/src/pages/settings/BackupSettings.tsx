import { History, RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { settingsSchema } from '@shared/schemas';
import type { BackupEntry } from '@shared/api-types';
import { errorMessage } from '@/api/client';
import { useBackups, useRestoreBackup, useRunBackup, useSaveSettings, useSettings } from '@/api/hooks';
import { Button, ConfirmDialog, Disclosure, EmptyState, ErrorState, Field, Input, ListRow, ListRowSkeleton, Notice, RowMenu, SectionHeader, useToast } from '@/components/ui';
import { formatBackupMoment, formatBackupMomentCompact, formatBackupMomentWithPreposition, formatBackupSize } from '@/lib/format';
import styles from './Settings.module.css';

const HISTORY_PREVIEW = 10;

/** Section « Données » : état des sauvegardes automatiques, second dossier, sauvegarde manuelle et restauration. */
export function BackupSettings() {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const backups = useBackups();
  const settings = useSettings();

  const saveMirror = useSaveSettings({ onSuccess: () => toast.success('Second dossier enregistré'), onError: (e) => toast.error(errorMessage(e)) });
  const runBackup = useRunBackup({ onSuccess: () => toast.success('Sauvegarde créée'), onError: (e) => toast.error(errorMessage(e)) });
  const [restoring, setRestoring] = useState<BackupEntry | null>(null);
  const restore = useRestoreBackup({
    onSuccess: () => {
      setRestoring(null);
      toast.success('Sauvegarde restaurée');
      // Tout ce qui vient de l'API peut avoir changé : le cache entier repart de zéro.
      qc.clear();
      navigate('/');
    },
  });

  const [mirrorDir, setMirrorDir] = useState('');
  const [mirrorError, setMirrorError] = useState<string | undefined>();
  const [loaded, setLoaded] = useState<typeof settings.data | null>(null);
  if (settings.data && settings.data !== loaded) {
    setLoaded(settings.data);
    setMirrorDir(settings.data.backupMirrorDir);
  }

  function submitMirror(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = settingsSchema.safeParse({ ...settings.data, backupMirrorDir: mirrorDir.trim() });
    if (!parsed.success) {
      setMirrorError(parsed.error.issues.find((i) => i.path[0] === 'backupMirrorDir')?.message ?? 'Chemin invalide');
      return;
    }
    setMirrorError(undefined);
    saveMirror.mutate(parsed.data);
  }

  const data = backups.data;

  function row(b: BackupEntry) {
    return (
      <ListRow
        key={b.name}
        title={b.reasonLabel}
        meta={
          <>
            <span>{formatBackupMomentCompact(b.date)}</span>
            {b.inMirror ? <span>Aussi dans le second dossier</span> : null}
          </>
        }
        trail={formatBackupSize(b.size)}
        actions={
          <RowMenu
            label={`Actions pour la sauvegarde du ${formatBackupMomentCompact(b.date)}`}
            items={[{ label: 'Restaurer', icon: <RotateCcw />, onSelect: () => setRestoring(b) }]}
          />
        }
      />
    );
  }

  return (
    <section className={styles.section}>
      <SectionHeader
        title="Données"
        description="Le serveur sauvegarde la base tout seul : au démarrage, avant une migration, une fois par jour, et avant chaque restauration."
        aside={
          <Button size="sm" icon={<Save />} loading={runBackup.isPending} disabled={!data} onClick={() => runBackup.mutate()}>
            Sauvegarder maintenant
          </Button>
        }
      />
      {backups.isPending ? (
        <ListRowSkeleton rows={3} />
      ) : backups.isError || !data ? (
        <ErrorState title="Impossible de charger les sauvegardes" description={errorMessage(backups.error)} onRetry={() => backups.refetch()} />
      ) : (
        <>
          <div className="stack">
            {data.lastLocalError ? (
              <Notice tone="negative">Dernière sauvegarde en échec : {data.lastLocalError}</Notice>
            ) : (
              <Notice tone="neutral">{data.lastSuccessAt ? <>Dernière sauvegarde {formatBackupMoment(data.lastSuccessAt)}.</> : 'Aucune sauvegarde pour l’instant.'}</Notice>
            )}

            <form className={styles.form} onSubmit={submitMirror} noValidate>
              <Field label="Second dossier" error={mirrorError} hint="Chemin absolu : clé USB, NAS ou dossier synchronisé, pour survivre à une panne de la machine.">
                {(id, describedBy) => (
                  <Input id={id} aria-describedby={describedBy} value={mirrorDir} onChange={(e) => setMirrorDir(e.target.value)} placeholder="Vide : aucun second dossier" className="mono" spellCheck={false} />
                )}
              </Field>
              <p className={styles.text}>Les sauvegardes contiennent les clés Binance et Enable Banking, en clair : protège ce dossier comme la base elle-même.</p>
              {data.mirrorDir ? (
                data.lastMirrorError ? (
                  <Notice tone="negative">Copie vers le second dossier impossible : {data.lastMirrorError}</Notice>
                ) : (
                  <Notice tone="neutral">{data.lastSuccessAt ? <>Dernière copie {formatBackupMoment(data.lastSuccessAt)}.</> : 'Aucune copie pour l’instant.'}</Notice>
                )
              ) : null}
              <div className={styles.actions}>
                <Button type="submit" loading={saveMirror.isPending}>
                  Enregistrer
                </Button>
              </div>
            </form>
          </div>

          {data.backups.length === 0 ? (
            <EmptyState icon={<History />} title="Aucune sauvegarde pour l’instant" />
          ) : (
            <>
              <ul className="ledger">{data.backups.slice(0, HISTORY_PREVIEW).map(row)}</ul>
              {data.backups.length > HISTORY_PREVIEW ? (
                <Disclosure label="Afficher toutes les sauvegardes" openLabel="Masquer les sauvegardes plus anciennes" count={data.backups.length}>
                  <ul className="ledger">{data.backups.slice(HISTORY_PREVIEW).map(row)}</ul>
                </Disclosure>
              ) : null}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={restoring !== null}
        onClose={() => setRestoring(null)}
        onConfirm={() => restoring && restore.mutate(restoring.name)}
        title={restoring ? `Restaurer la sauvegarde ${formatBackupMomentWithPreposition(restoring.date)} ?` : ''}
        description="L’état actuel est sauvegardé avant."
        confirmLabel="Restaurer"
        tone="primary"
        loading={restore.isPending}
        error={restore.error ? errorMessage(restore.error) : null}
      />
    </section>
  );
}
