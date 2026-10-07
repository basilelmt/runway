import { useState, type ReactNode } from 'react';
import type { ImportPreviewRow } from '@shared/api-types';
import type { Account, Envelope } from '@shared/schemas';
import { Amount, Badge, Button, InlinePill } from '@/components/ui';
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

function Section({ title, count, children, defaultOpen = true }: { title: string; count: number; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className={styles.section} open={defaultOpen && count > 0}>
      <summary className={styles.summary}>
        <span className={styles.summaryTitle}>{title}</span>
        <Badge tone={count > 0 ? 'neutral' : 'info'}>{count}</Badge>
      </summary>
      {count > 0 ? <div className="ledger">{children}</div> : <p className={styles.none}>Aucune ligne</p>}
    </details>
  );
}

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

  const envelopeSelect = (row: ImportPreviewRow) =>
    row.status === 'transfer' && row.transferToAccountId !== null ? (
      <Badge tone="info">Virement vers {accountName(row.transferToAccountId)}</Badge>
    ) : row.signedAmount < 0 ? (
      <InlinePill
        aria-label={`Enveloppe pour ${row.label}`}
        value={row.envelopeId}
        placeholder="À ranger"
        options={envelopes.map((env) => ({ value: env.id, label: env.name, color: env.color }))}
        onChange={(v) => update(row.index, { envelopeId: v })}
      />
    ) : (
      <span className={styles.income}>Revenu</span>
    );

  if (toImport === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.nothing}>
          <p className={styles.nothingTitle}>Rien de nouveau dans ce relevé</p>
          <p className="muted">{plural(duplicates.length, 'opération déjà importée', 'opérations déjà importées')}.</p>
        </div>
        <div className={styles.actions}>
          <Button onClick={onCancel}>Choisir un autre fichier</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.counts}>
        <span>
          <strong>{fresh.length}</strong> nouvelles
        </span>
        <span>
          <strong>{matched.length}</strong> rapprochées
        </span>
        <span className="muted">
          <strong>{duplicates.length}</strong> doublons ignorés
        </span>
      </div>

      <Section title="Nouvelles" count={fresh.length}>
        {fresh.map((row) => (
          <div key={row.index} className={styles.row}>
            <span className={[styles.date, 'num'].join(' ')}>{formatDateCompact(row.date)}</span>
            <span className={styles.label}>
              {row.label}
              {detached.has(row.index) ? <Badge tone="info">détachée</Badge> : null}
            </span>
            <span className={styles.envelope}>{envelopeSelect(row)}</span>
            <Amount cents={row.signedAmount} tone="always" className={styles.amount} />
          </div>
        ))}
      </Section>

      <Section title="Rapprochées" count={matched.length}>
        {matched.map((row) => (
          <div key={row.index} className={[styles.row, styles.matchedRow].join(' ')}>
            <span className={[styles.date, 'num'].join(' ')}>{formatDateCompact(row.date)}</span>
            <span className={styles.label}>
              {row.label}
              <span className={styles.replaces}>↳ remplace la prévue « {row.plannedLabel} »</span>
            </span>
            <span className={styles.envelope}>
              <Button size="sm" variant="ghost" onClick={() => detach(row)}>
                Détacher
              </Button>
            </span>
            <Amount cents={row.signedAmount} tone="always" className={styles.amount} />
          </div>
        ))}
      </Section>

      <Section title="Doublons ignorés" count={duplicates.length} defaultOpen={false}>
        {duplicates.map((row) => (
          <div key={row.index} className={[styles.row, styles.duplicate].join(' ')} aria-disabled>
            <span className={[styles.date, 'num'].join(' ')}>{formatDateCompact(row.date)}</span>
            <span className={styles.label}>{row.label}</span>
            <span className={styles.envelope}>{row.status === 'internal' ? <Badge tone="info">virement déjà saisi</Badge> : null}</span>
            <Amount cents={row.signedAmount} tone="neutral" className={styles.amount} />
          </div>
        ))}
      </Section>

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
