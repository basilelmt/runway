import { WalletCards, X } from 'lucide-react';
import type { FundingView } from '@shared/api-types';
import { formatMonth } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useDismissFunding, useUndoFunding } from '@/api/hooks';
import { Button, ButtonLink, Notice, useToast } from '@/components/ui';
import { plural } from '@/lib/format';

type FundingBannerProps = {
  funding: FundingView;
  /** Lien vers la page Budget, utile depuis l'accueil. */
  budgetLink?: boolean;
};

/** Annonce la répartition automatique du dernier salaire, annulable. */
export function FundingBanner({ funding, budgetLink = false }: FundingBannerProps) {
  const toast = useToast();
  const undo = useUndoFunding({ onSuccess: () => toast.success('Répartition annulée'), onError: (e) => toast.error(errorMessage(e)) });
  const dismiss = useDismissFunding({ onError: (e) => toast.error(errorMessage(e)) });

  return (
    <Notice
      tone="neutral"
      icon={<WalletCards />}
      label="Répartition du salaire"
      action={
        <>
          {budgetLink ? (
            <ButtonLink to="/budget" size="sm" variant="ghost">
              Voir le budget
            </ButtonLink>
          ) : null}
          <Button size="sm" variant="ghost" aria-label="Annuler la répartition" loading={undo.isPending} disabled={dismiss.isPending} onClick={() => undo.mutate(funding.id)}>
            Annuler
          </Button>
          <Button size="sm" variant="ghost" icon={<X />} aria-label="Fermer" disabled={undo.isPending} onClick={() => dismiss.mutate(funding.id)} />
        </>
      }
    >
      Salaire réparti : <strong>{formatEuros(funding.total)}</strong> dans {plural(funding.envelopeCount, 'enveloppe')} pour {formatMonth(funding.month)}
      {funding.shortfallCount > 0 ? <span className="muted"> · {plural(funding.shortfallCount, 'enveloppe incomplète', 'enveloppes incomplètes')} faute d’argent</span> : null}
    </Notice>
  );
}
