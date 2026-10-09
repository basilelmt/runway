import { Check } from 'lucide-react';
import type { Account, Envelope, Transaction } from '@shared/schemas';
import { Amount, Badge, Button, EnvelopeTag, ListRow } from '@/components/ui';
import { KIND_LABELS } from '@/lib/format';
import { displayLabel } from '@/lib/merchants';
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
};

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Les relevés PDF gardent le texte brut en note : inutile de l'afficher s'il ne fait que répéter le libellé. */
function repeatsLabel(note: string, label: string): boolean {
  const n = squash(note);
  const l = squash(label);
  return n.startsWith(l.slice(0, 24)) || l.startsWith(n.slice(0, 24));
}

export function TransactionRow({ transaction: t, accounts, envelopes, viewAccountId, onClick, onConfirm, confirming }: TransactionRowProps) {
  const amount = signedAmount(t, viewAccountId);
  const envelope = t.envelopeId != null ? envelopes.get(t.envelopeId) : undefined;
  const fromEnvelope = t.fromEnvelopeId != null ? envelopes.get(t.fromEnvelopeId) : undefined;
  const account = t.accountId != null ? accounts.get(t.accountId) : undefined;
  const planned = t.status === 'planned';
  const name = displayLabel(t, accounts, viewAccountId);

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
      onClick={onClick}
      clickLabel={onClick ? `Modifier ${name}` : undefined}
      title={<span title={t.label}>{name}</span>}
      meta={
        <>
          {t.kind !== 'expense' ? <Badge tone={t.kind === 'income' ? 'positive' : 'neutral'}>{KIND_LABELS[t.kind]}</Badge> : null}
          {t.kind === 'expense' ? envelope ? <EnvelopeTag name={envelope.name} color={envelope.color} /> : <Badge tone="marking">À ranger</Badge> : null}
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
