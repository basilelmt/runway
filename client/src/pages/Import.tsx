import { useState } from 'react';
import type { ImportPreviewRow } from '@shared/api-types';
import { errorMessage } from '@/api/client';
import { useAccounts, useCommitImport, useEnvelopes, usePreviewImport, type ImportPreviewWithFile } from '@/api/hooks';
import { PageHeader } from '@/components/layout/PageHeader';
import { DropZone } from '@/components/import/DropZone';
import { ImportPreview } from '@/components/import/ImportPreview';
import { Card, Field, Select, useToast } from '@/components/ui';
import { plural } from '@/lib/format';
import styles from './Import.module.css';

type Draft = { file: File; preview: ImportPreviewWithFile; rows: ImportPreviewRow[] };

export function ImportPage() {
  const toast = useToast();
  const accounts = useAccounts();
  const envelopes = useEnvelopes();
  const [draft, setDraft] = useState<Draft | null>(null);

  const preview = usePreviewImport({
    onSuccess: (p, { file }) => setDraft({ file, preview: p, rows: p.rows }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const commit = useCommitImport({
    onSuccess: (record) => {
      toast.success(`${plural(record.newCount, 'opération importée', 'opérations importées')}, ${record.matchedCount} rapprochée${record.matchedCount > 1 ? 's' : ''}`);
      setDraft(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function handleCommit() {
    if (!draft || draft.preview.accountId === null) return;
    const duplicates = draft.rows.filter((r) => r.status === 'duplicate' || r.status === 'internal').length;
    commit.mutate({
      fileName: draft.preview.fileName,
      accountId: draft.preview.accountId,
      bankAccountNumber: draft.preview.bankAccountNumber,
      duplicateCount: duplicates,
      rows: draft.rows
        .filter((r) => r.status === 'new' || r.status === 'matched' || r.status === 'transfer')
        .map(({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId, note, transferToAccountId }) => ({
          index,
          date,
          label,
          signedAmount,
          fingerprint,
          plannedId,
          envelopeId,
          note,
          transferToAccountId,
        })),
    });
  }

  const accountName = (id: number) => accounts.data?.find((a) => a.id === id)?.name ?? `Compte ${id}`;

  return (
    <div className="page">
      <PageHeader
        back={{ to: '/operations', label: 'Opérations' }}
        title="Importer un relevé"
        subtitle="Relevés CSV ou PDF de La Banque Postale. Utile pour l’historique ancien : au quotidien, la synchronisation bancaire s’en charge. Les doublons sont ignorés et les opérations prévues sont rapprochées."
      />

      {draft === null ? (
        <DropZone busy={preview.isPending} onFile={(file) => preview.mutate({ file })} />
      ) : (
        <Card className={styles.previewCard}>
          <div className={styles.fileLine}>
            <span className={styles.fileName}>{draft.preview.fileName}</span>
            {draft.preview.accountId !== null ? (
              <span className="muted">
                {accountName(draft.preview.accountId)}
                {draft.preview.bankAccountNumber ? <span className="mono"> · {draft.preview.bankAccountNumber}</span> : null}
              </span>
            ) : null}
          </div>

          {draft.preview.sections.length > 1 ? (
            <div className={styles.accountPick}>
              <Field label="Compte du relevé à importer" hint="Un relevé PDF couvre plusieurs comptes : importe-les un par un.">
                {(id, describedBy) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={draft.preview.sectionIndex}
                    disabled={preview.isPending}
                    onChange={(e) => preview.mutate({ file: draft.file, section: Number(e.target.value) })}
                  >
                    {draft.preview.sections.map((s) => (
                      <option key={s.index} value={s.index}>
                        {s.accountName} · {s.bankAccountNumber} · {plural(s.rowCount, 'opération')}
                        {s.accountId === null ? ' · compte inconnu' : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          ) : null}

          {draft.preview.accountId === null ? (
            <div className={styles.accountPick}>
              <Field
                label="Ce relevé correspond à quel compte ?"
                hint={draft.preview.bankAccountNumber ? `Numéro détecté : ${draft.preview.bankAccountNumber}. Il sera mémorisé pour les prochains imports.` : 'Aucun numéro de compte dans le fichier.'}
              >
                {(id, describedBy) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value=""
                    disabled={preview.isPending}
                    onChange={(e) => {
                      const accountId = Number(e.target.value);
                      if (accountId) preview.mutate({ file: draft.file, accountId, section: draft.preview.sections.length > 1 ? draft.preview.sectionIndex : null });
                    }}
                  >
                    <option value="">Choisir un compte</option>
                    {(accounts.data ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          ) : (
            <ImportPreview
              rows={draft.rows}
              envelopes={envelopes.data ?? []}
              accounts={accounts.data ?? []}
              onChange={(rows) => setDraft({ ...draft, rows })}
              onCommit={handleCommit}
              onCancel={() => setDraft(null)}
              committing={commit.isPending}
            />
          )}
        </Card>
      )}

    </div>
  );
}
