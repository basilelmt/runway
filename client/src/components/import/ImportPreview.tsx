import { useState } from 'react';
import type { ImportPreviewRow } from '@shared/api-types';
import type { Account, Envelope } from '@shared/schemas';
import { Amount, Badge, Button, Disclosure, EmptyState, InlinePill, ListRow, listRowDate, Stat, StatGroup, statNumber } from '@/components/ui';
import { formatDateCompact, plural } from '@/lib/format';
import styles from './ImportPreview.module.css';

type ImportPreviewProps = {
  rows: ImportPreviewRow[];
  envelopes: Envelope[];
  accounts?: Account[];
  onChange: (rows: ImportPreviewRow[]) => void;
  onCommit: () => void;
  onCancel: () => void;
  committing?: boolean;
};

/** Aperçu d'un relevé avant écriture : nouvelles, rapprochées, doublons. */
export function ImportPreview({ rows, envelopes, accounts = [], onChange, onCommit, onCancel, committing = false }: ImportPreviewProps) {
  const [detached, setDetached] = useState<Set<number>>(new Set());
  const fresh = rows.filter((r) => r.status === 'new' || r.status === 'transfer');
  const matched = rows.filter((r) => r.status === 'matched');
  const duplicates = rows.filter((r) => r.status === 'duplicate' || r.status === 'internal');
  const toImport = fresh.length + matched.length;
  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? `compte ${id}`;

  function update(index: number, patch: Partial<ImportPreviewRow>) {
    onChange(rows.map((r) => (r.index === index ? { ...r, ...patch } : r)));
  }

  function detach(row: ImportPreviewRow) {
    setDetached((s) => new Set(s).add(row.index));
    update(row.index, { status: 'new', plannedId: null, plannedLabel: null });
  }

  if (toImport === 0) {
    return (
      <div className={styles.wrap}>
        <EmptyState
          title="Rien de nouveau dans ce relevé"
          description={`${plural(duplicates.length, 'opération déjà importée', 'opérations déjà importées')}.`}
          action={
            <Button onClick={onCancel}>Choisir un autre fichier</Button>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <StatGroup>
        <Stat label="Nouvelles">
          <span className={statNumber}>{fresh.length}</span>
        </Stat>
        <Stat label="Rapprochées">
          <span className={statNumber}>{matched.length}</span>
        </Stat>
        <Stat label="Doublons ignorés">
          <span className={statNumber}>{duplicates.length}</span>
        </Stat>
      </StatGroup>

      <Disclosure label="Nouvelles" count={fresh.length} defaultOpen>
        {fresh.length === 0 ? (
          <p className="muted">Aucune ligne</p>
        ) : (
          <ul className="ledger">
            {fresh.map((row) => {
              const transferTo = row.status === 'transfer' && row.transferToAccountId !== null ? accountName(row.transferToAccountId) : null;
              return (
                <ListRow
                  key={row.index}
                  compact
                  lead={<span className={listRowDate}>{formatDateCompact(row.date)}</span>}
                  title={row.label}
                  meta={
                    <>
                      {detached.has(row.index) ? <Badge tone="info">détachée</Badge> : null}
                      {transferTo !== null ? <Badge tone="info">Virement vers {transferTo}</Badge> : row.signedAmount >= 0 ? <Badge tone="positive">Revenu</Badge> : null}
                    </>
                  }
                  trail={<Amount cents={row.signedAmount} tone="always" />}
                  actions={
                    transferTo === null && row.signedAmount < 0 ? (
                      <InlinePill
                        aria-label={`Enveloppe pour ${row.label}`}
                        value={row.envelopeId}
                        placeholder="À ranger"
                        options={envelopes.map((env) => ({ value: env.id, label: env.name, color: env.color }))}
                        onChange={(v) => update(row.index, { envelopeId: v })}
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </ul>
        )}
      </Disclosure>

      <Disclosure label="Rapprochées" count={matched.length}>
        {matched.length === 0 ? (
          <p className="muted">Aucune ligne</p>
        ) : (
          <ul className="ledger">
            {matched.map((row) => (
              <ListRow
                key={row.index}
                compact
                lead={<span className={listRowDate}>{formatDateCompact(row.date)}</span>}
                title={row.label}
                meta={<span className={styles.replaces}>↳ remplace la prévue « {row.plannedLabel} »</span>}
                trail={<Amount cents={row.signedAmount} tone="always" />}
                actions={
                  <Button size="sm" variant="ghost" onClick={() => detach(row)}>
                    Détacher
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </Disclosure>

      <Disclosure label="Doublons ignorés" count={duplicates.length}>
        {duplicates.length === 0 ? (
          <p className="muted">Aucune ligne</p>
        ) : (
          <ul className="ledger">
            {duplicates.map((row) => (
              <ListRow
                key={row.index}
                compact
                muted
                lead={<span className={listRowDate}>{formatDateCompact(row.date)}</span>}
                title={row.label}
                meta={row.status === 'internal' ? <Badge tone="info">virement déjà saisi</Badge> : null}
                trail={<Amount cents={row.signedAmount} tone="neutral" />}
              />
            ))}
          </ul>
        )}
      </Disclosure>

      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel} disabled={committing}>
          Annuler
        </Button>
        <Button variant="primary" onClick={onCommit} loading={committing}>
          Importer {plural(toImport, 'opération')}
        </Button>
      </div>
    </div>
  );
}
