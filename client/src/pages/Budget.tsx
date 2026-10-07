import { Plus, WalletCards } from 'lucide-react';
import { useState } from 'react';
import type { EnvelopeWithBalance } from '@shared/api-types';
import { errorMessage } from '@/api/client';
import { useOverview, useReorderEnvelopes, useUpdateEnvelope } from '@/api/hooks';
import { AllocateDialog } from '@/components/envelopes/AllocateDialog';
import { EnvelopeCard } from '@/components/envelopes/EnvelopeCard';
import { EnvelopeFormDialog } from '@/components/envelopes/EnvelopeFormDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { Amount, Button, Dialog, EmptyState, Skeleton, useToast } from '@/components/ui';
import styles from './Envelopes.module.css';

type AllocState = { mode: 'allocate' | 'move'; envelope?: EnvelopeWithBalance } | null;

export function EnvelopesPage() {
  const overview = useOverview();
  const toast = useToast();
  const [order, setOrder] = useState<EnvelopeWithBalance[]>([]);
  const [source, setSource] = useState<EnvelopeWithBalance[] | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [alloc, setAlloc] = useState<AllocState>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EnvelopeWithBalance | null>(null);
  const [archiving, setArchiving] = useState<EnvelopeWithBalance | null>(null);

  const reorder = useReorderEnvelopes({ onError: (e) => toast.error(errorMessage(e)) });
  const update = useUpdateEnvelope({
    onSuccess: () => {
      toast.success('Enveloppe archivée');
      setArchiving(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Copie locale pour un réordonnancement optimiste, resynchronisée quand le serveur répond.
  if (overview.data && overview.data.envelopes !== source) {
    setSource(overview.data.envelopes);
    setOrder(overview.data.envelopes);
  }

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setOrder(next);
    reorder.mutate(next.map((e) => e.id));
  }

  function drop(targetId: number) {
    if (dragId === null) return;
    move(
      order.findIndex((e) => e.id === dragId),
      order.findIndex((e) => e.id === targetId),
    );
    setDragId(null);
    setOverId(null);
  }

  return (
    <div className="page">
      <PageHeader
        title="Enveloppes"
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
            Nouvelle enveloppe
          </Button>
        }
      />

      <section className={styles.toAllocate}>
        <div>
          <p className="eyebrow">À répartir</p>
          {overview.data ? <Amount cents={overview.data.toAllocate} size="xl" /> : <Skeleton width={200} height={44} />}
          <p className={styles.hint}>
            {overview.data && overview.data.toAllocate < 0
              ? 'Tu as alloué plus que ce que tes comptes contiennent.'
              : 'Argent présent sur tes comptes budget et pas encore rangé dans une enveloppe.'}
          </p>
        </div>
        <Button variant="marking" icon={<Plus />} onClick={() => setAlloc({ mode: 'allocate' })} disabled={order.length === 0}>
          Allouer
        </Button>
      </section>

      {overview.isPending ? (
        <ul className={styles.grid}>
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton height={180} />
            </li>
          ))}
        </ul>
      ) : overview.error ? (
        <p className={styles.error} role="alert">
          {errorMessage(overview.error)}
        </p>
      ) : order.length === 0 ? (
        <EmptyState
          icon={<WalletCards />}
          title="Crée ta première enveloppe"
          description="Courses, Loyer, Sorties, Vacances : chaque enveloppe est une boîte dans laquelle tu ranges une part de ton argent."
          action={
            <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
              Créer une enveloppe
            </Button>
          }
        />
      ) : (
        <ul className={styles.grid}>
          {order.map((env, i) => (
            <EnvelopeCard
              key={env.id}
              envelope={env}
              dragging={dragId === env.id}
              dragOver={overId === env.id && dragId !== env.id}
              onDragStart={() => setDragId(env.id)}
              onDragOver={(e) => {
                e.preventDefault();
                if (overId !== env.id) setOverId(env.id);
              }}
              onDrop={() => drop(env.id)}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onMoveUp={i > 0 ? () => move(i, i - 1) : undefined}
              onMoveDown={i < order.length - 1 ? () => move(i, i + 1) : undefined}
              onAllocate={() => setAlloc({ mode: 'allocate', envelope: env })}
              onMove={() => setAlloc({ mode: 'move', envelope: env })}
              onEdit={() => setEditing(env)}
              onArchive={() => setArchiving(env)}
            />
          ))}
        </ul>
      )}

      <AllocateDialog
        open={alloc !== null}
        onClose={() => setAlloc(null)}
        envelopeId={alloc?.mode === 'allocate' ? alloc.envelope?.id ?? null : null}
        fromEnvelopeId={alloc?.mode === 'move' ? alloc.envelope?.id ?? null : null}
        envelopeName={alloc?.envelope?.name}
      />
      {creating ? <EnvelopeFormDialog open onClose={() => setCreating(false)} /> : null}
      {editing ? <EnvelopeFormDialog key={editing.id} open envelope={editing} onClose={() => setEditing(null)} /> : null}
      <Dialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title="Archiver cette enveloppe ?"
        description={'Elle disparaît de la grille et son solde est rendu à "À répartir". Les dépenses déjà rangées dedans sont conservées.'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setArchiving(null)}>
              Annuler
            </Button>
            <Button variant="danger" loading={update.isPending} onClick={() => archiving && update.mutate({ id: archiving.id, archived: true })}>
              Archiver
            </Button>
          </>
        }
      >
        <p className={styles.dialogName}>{archiving?.name}</p>
        {archiving && archiving.balance !== 0 ? (
          <p className={styles.hint}>
            Solde actuel : <Amount cents={archiving.balance} size="sm" />
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
