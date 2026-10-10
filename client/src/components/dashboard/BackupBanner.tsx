import { AlertTriangle } from 'lucide-react';
import { useBackups } from '@/api/hooks';
import { ButtonLink, Notice } from '@/components/ui';
import { formatBackupMoment } from '@/lib/format';

const STALE_DAYS = 7;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

/** Bandeau d'alerte si aucune sauvegarde n'a réussi depuis 7 jours. */
export function BackupBanner() {
  const backups = useBackups();
  const data = backups.data;
  if (!data) return null;
  const stale = !data.lastSuccessAt || new Date().getTime() - new Date(data.lastSuccessAt).getTime() > STALE_MS;
  if (!stale) return null;

  return (
    <Notice
      tone="negative"
      icon={<AlertTriangle />}
      label="Sauvegardes en retard"
      action={
        <ButtonLink to="/reglages" size="sm" variant="ghost">
          Voir Réglages
        </ButtonLink>
      }
    >
      {data.lastSuccessAt ? <>Aucune sauvegarde réussie depuis {formatBackupMoment(data.lastSuccessAt)}.</> : 'Aucune sauvegarde n’a encore réussi.'}
    </Notice>
  );
}
