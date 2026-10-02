import { ChevronDown, ChevronUp, GripVertical, ListFilter, Plus } from 'lucide-react';
import { useState } from 'react';
import type { SortingRule } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useCreateSortingRule, useDeleteSortingRule, useEnvelopes, useReorderSortingRules, useSortingRules, useUpdateSortingRule } from '@/api/hooks';
import { PageHeader } from '@/components/layout/PageHeader';
import { RuleTester } from '@/components/sorting/RuleTester';
import { SortingRuleDialog } from '@/components/sorting/SortingRuleDialog';
import { Button, Dot, EmptyState, SkeletonRows, useToast } from '@/components/ui';
import styles from './SortingRules.module.css';

type DialogState = { open: false } | { open: true; rule: SortingRule | null };

export function SortingRulesPage() {
  const toast = useToast();
  const rules = useSortingRules();
  const envelopes = useEnvelopes();
  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  const close = () => setDialog({ open: false });
  const create = useCreateSortingRule({ onSuccess: () => { toast.success('Règle créée'); close(); } });
  const update = useUpdateSortingRule({ onSuccess: () => { toast.success('Règle enregistrée'); close(); } });
  const remove = useDeleteSortingRule({ onSuccess: () => toast.success('Règle supprimée'), onError: (e) => toast.error(errorMessage(e)) });
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

  function dropOn(targetId: number) {
    if (dragId === null || dragId === targetId) return;
    move(list.findIndex((r) => r.id === dragId), list.findIndex((r) => r.id === targetId));
  }

  const activeMutation = dialog.open && dialog.rule ? update : create;

  return (
    <div className="page">
      <PageHeader
        title="Règles de tri"
        subtitle="La première règle qui correspond l'emporte."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setDialog({ open: true, rule: null })}>
            Nouvelle règle
          </Button>
        }
      />

      <p className={styles.explain}>Le motif est cherché dans le libellé de chaque dépense importée, sans tenir compte de la casse ni des accents.</p>

      <RuleTester envelopes={envelopes.data ?? []} refreshKey={rules.dataUpdatedAt} />

      {rules.isPending ? (
        <SkeletonRows rows={4} />
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
        <ol className={['ledger', styles.list].join(' ')} aria-label="Règles par priorité">
          {list.map((rule, i) => {
            const env = envelopeOf(rule.envelopeId);
            return (
              <li
                key={rule.id}
                className={[styles.row, dragId === rule.id ? styles.dragging : '', overId === rule.id && dragId !== rule.id ? styles.over : ''].join(' ')}
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
                <span className={styles.handle} aria-hidden>
                  <GripVertical />
                </span>
                <span className={['mono', styles.priority].join(' ')}>{i + 1}</span>
                <span className={['mono', styles.pattern].join(' ')}>{rule.pattern}</span>
                <span className={styles.arrow} aria-hidden>
                  →
                </span>
                <span className={styles.envelope}>
                  {env ? (
                    <>
                      <Dot color={env.color} /> {env.name}
                    </>
                  ) : (
                    <span className="muted">Enveloppe supprimée</span>
                  )}
                </span>
                <span className={styles.actions}>
                  <Button size="sm" variant="ghost" aria-label="Monter" icon={<ChevronUp />} disabled={i === 0 || reorder.isPending} onClick={() => move(i, i - 1)} />
                  <Button size="sm" variant="ghost" aria-label="Descendre" icon={<ChevronDown />} disabled={i === list.length - 1 || reorder.isPending} onClick={() => move(i, i + 1)} />
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ open: true, rule })}>
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (window.confirm(`Supprimer la règle « ${rule.pattern} » ?`)) remove.mutate(rule.id);
                    }}
                  >
                    Supprimer
                  </Button>
                </span>
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
    </div>
  );
}
