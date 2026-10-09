import { ChevronDown, ChevronUp, GripVertical, ListFilter, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import type { SortingRule } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useApplySortingRules, useCreateSortingRule, useDeleteSortingRule, useEnvelopes, useReorderSortingRules, useSortingRules, useUpdateSortingRule } from '@/api/hooks';
import { RuleTester } from '@/components/sorting/RuleTester';
import { SortingRuleDialog } from '@/components/sorting/SortingRuleDialog';
import { Button, ConfirmDialog, EmptyState, EnvelopeTag, ListRow, ListRowSkeleton, RowMenu, SectionHeader, useToast } from '@/components/ui';
import styles from './SortingRules.module.css';

type DialogState = { open: false } | { open: true; rule: SortingRule | null };

export function SortingRulesSettings() {
  const toast = useToast();
  const rules = useSortingRules();
  const envelopes = useEnvelopes();
  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [deleting, setDeleting] = useState<SortingRule | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  const close = () => setDialog({ open: false });
  const create = useCreateSortingRule({ onSuccess: () => { toast.success('Règle créée'); close(); } });
  const update = useUpdateSortingRule({ onSuccess: () => { toast.success('Règle enregistrée'); close(); } });
  const remove = useDeleteSortingRule({ onSuccess: () => { toast.success('Règle supprimée'); setDeleting(null); } });
  const reorder = useReorderSortingRules({ onError: (e) => toast.error(errorMessage(e)) });

  const list = rules.data ?? [];
  const envelopeOf = (id: number) => envelopes.data?.find((e) => e.id === id) ?? null;

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= list.length) return;
    const ids = list.map((r) => r.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    reorder.mutate(ids);
  }

  function moveId(id: number, delta: number) {
    move(list.findIndex((r) => r.id === id), list.findIndex((r) => r.id === id) + delta);
  }

  function dropOn(targetId: number) {
    if (dragId === null || dragId === targetId) return;
    move(list.findIndex((r) => r.id === dragId), list.findIndex((r) => r.id === targetId));
  }

  function onHandleKey(e: KeyboardEvent, id: number) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveId(id, e.key === 'ArrowUp' ? -1 : 1);
    }
  }

  const activeMutation = dialog.open && dialog.rule ? update : create;
  const applyAll = useApplySortingRules({
    onSuccess: ({ assigned }) => toast.success(assigned === 0 ? 'Rien à ranger : aucune opération ne correspond' : `${assigned} opération${assigned > 1 ? 's' : ''} rangée${assigned > 1 ? 's' : ''}`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <SectionHeader
        title="Règles de tri"
        description="Chaque nouvelle dépense dont le libellé contient le motif est rangée dans l’enveloppe, sans tenir compte des majuscules ni des accents. La première règle qui correspond l’emporte."
        aside={
          <div className={styles.toolbarActions}>
            <Button size="sm" variant="ghost" icon={<Wand2 />} onClick={() => applyAll.mutate()} loading={applyAll.isPending} disabled={list.length === 0}>
              Appliquer aux opérations à ranger
            </Button>
            <Button size="sm" icon={<Plus />} onClick={() => setDialog({ open: true, rule: null })}>
              Nouvelle règle
            </Button>
          </div>
        }
      />

      <RuleTester envelopes={envelopes.data ?? []} refreshKey={rules.dataUpdatedAt} />

      {rules.isPending ? (
        <ListRowSkeleton rows={6} actions />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<ListFilter />}
          title="Aucune règle de tri"
          description="Une règle range automatiquement les dépenses importées dont le libellé contient un motif, par exemple « carrefour » dans Courses."
          action={
            <Button variant="primary" onClick={() => setDialog({ open: true, rule: null })}>
              Créer une règle
            </Button>
          }
        />
      ) : (
        <ol className="ledger" aria-label="Règles par priorité">
          {list.map((rule, i) => {
            const env = envelopeOf(rule.envelopeId);
            return (
              <li
                key={rule.id}
                className={[styles.dragRow, dragId === rule.id ? styles.dragging : '', overId === rule.id && dragId !== rule.id ? styles.over : ''].join(' ')}
                draggable
                onDragStart={(e) => {
                  setDragId(rule.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverId(rule.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(rule.id);
                  setOverId(null);
                }}
              >
                <ListRow
                  as="div"
                  lead={
                    <>
                      <button
                        type="button"
                        className={styles.handle}
                        aria-label={`Déplacer la règle « ${rule.pattern} » dans la liste (flèches haut et bas)`}
                        onKeyDown={(e) => onHandleKey(e, rule.id)}
                      >
                        <GripVertical aria-hidden />
                      </button>
                      <span className={['num', styles.priority].join(' ')}>{i + 1}</span>
                    </>
                  }
                  title={
                    <>
                      <span className="mono">{rule.pattern}</span> <span className={styles.arrow}>→</span>{' '}
                      {env ? <EnvelopeTag name={env.name} color={env.color} /> : <span className="muted">Enveloppe supprimée</span>}
                    </>
                  }
                  actions={
                    <RowMenu
                      label={`Actions pour « ${rule.pattern} »`}
                      items={[
                        { label: 'Monter', icon: <ChevronUp />, onSelect: () => moveId(rule.id, -1), disabled: i === 0 || reorder.isPending },
                        { label: 'Descendre', icon: <ChevronDown />, onSelect: () => moveId(rule.id, 1), disabled: i === list.length - 1 || reorder.isPending },
                        { label: 'Modifier', icon: <Pencil />, onSelect: () => setDialog({ open: true, rule }) },
                        { label: 'Supprimer', icon: <Trash2 />, onSelect: () => setDeleting(rule), danger: true },
                      ]}
                    />
                  }
                />
              </li>
            );
          })}
        </ol>
      )}

      <SortingRuleDialog
        open={dialog.open}
        onClose={close}
        envelopes={envelopes.data ?? []}
        initial={dialog.open ? dialog.rule : null}
        submitting={activeMutation.isPending}
        serverError={activeMutation.error ? errorMessage(activeMutation.error) : null}
        onSubmit={(input) => {
          if (dialog.open && dialog.rule) update.mutate({ id: dialog.rule.id, ...input });
          else create.mutate(input);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="Supprimer cette règle ?"
        confirmLabel="Supprimer"
        loading={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : null}
      >
        <span className="mono">{deleting?.pattern}</span>
      </ConfirmDialog>
    </div>
  );
}
