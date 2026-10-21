import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Account, Envelope, Transaction } from '@shared/schemas';
import { Amount, Badge, Button, EnvelopeTag, ListRow, type ListRowClick } from '@/components/ui';
import { KIND_LABELS } from '@/lib/format';
import { displayLabel, repeatsLabel } from '@/lib/merchants';
import { opensSheet } from './opensSheet';
import { signedAmount } from './signed';
import styles from './TransactionRow.module.css';

type TransactionRowProps = {
  transaction: Transaction;
  accounts: Map<number, Account>;
  envelopes: Map<number, Envelope>;
  /** Compte depuis lequel on regarde (filtre actif), pour le signe des transferts. */
  viewAccountId?: number;
  onClick?: () => void;
  onConfirm?: () => void;
  confirming?: boolean;
  /** Cette dépense a au moins une avance ouverte : porte la pastille « Avance ». */
  hasOpenAdvance?: boolean;
  /** Début de ligne, hors d'une liste groupée par jour : la date (dernières opérations de l'Accueil). */
  lead?: ReactNode;
};

export function TransactionRow({ transaction: t, accounts, envelopes, viewAccountId, onClick, onConfirm, confirming, hasOpenAdvance, lead }: TransactionRowProps) {
  const amount = signedAmount(t, viewAccountId);
  const envelope = t.envelopeId != null ? envelopes.get(t.envelopeId) : undefined;
  const fromEnvelope = t.fromEnvelopeId != null ? envelopes.get(t.fromEnvelopeId) : undefined;
  const account = t.accountId != null ? accounts.get(t.accountId) : undefined;
  const planned = t.status === 'planned';
  const name = displayLabel(t, accounts, viewAccountId);
  const click: ListRowClick = onClick ? { onClick, clickLabel: `${opensSheet(t) ? 'Ouvrir' : 'Modifier'} ${name}` } : {};
  // Un revenu rangé dans une enveloppe est un remboursement : il affiche son enveloppe comme une dépense.
  const isReimbursement = t.kind === 'income' && envelope != null;

  const where =
    // Le titre dit déjà « Virement vers/depuis » : pas la peine de répéter le même couple de comptes en dessous.
    t.kind === 'transfer'
      ? ''
      : t.kind === 'allocation'
        ? `${fromEnvelope?.name ?? 'Pas encore réparti'} → ${envelope?.name ?? '?'}`
        : account?.name ?? '';

  return (
    <ListRow
      muted={planned}
      {...click}
      lead={lead}
      title={<span title={t.label}>{name}</span>}
      meta={
        <>
          {t.kind !== 'expense' && !isReimbursement ? <Badge tone={t.kind === 'income' ? 'positive' : 'neutral'}>{KIND_LABELS[t.kind]}</Badge> : null}
          {t.kind === 'expense' || isReimbursement ? envelope ? <EnvelopeTag name={envelope.name} color={envelope.color} /> : <Badge tone="marking">À ranger</Badge> : null}
          {t.kind === 'expense' && hasOpenAdvance ? <Badge tone="marking">Avance</Badge> : null}
          {planned ? <Badge tone="warning">Prévue</Badge> : null}
          {where ? <span className={styles.where}>{where}</span> : null}
          {t.note && !repeatsLabel(t.note, t.label) ? <span className={styles.note}>{t.note}</span> : null}
        </>
      }
      trail={<Amount cents={amount} tone={amount > 0 && t.kind !== 'allocation' ? 'always' : 'neutral'} />}
      actions={
        planned && onConfirm ? (
          <Button size="sm" variant="secondary" icon={<Check />} onClick={onConfirm} loading={confirming}>
            Confirmer
          </Button>
        ) : undefined
      }
    />
  );
}
