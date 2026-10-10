import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { AdvanceView } from '@shared/api-types';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useAdvancePeople, useAdvancesForExpense, useReopenAdvance, useSetAdvances } from '@/api/hooks';
import { Badge, FieldError, GroupLabel, Input, MoneyInput } from '@/components/ui';
import styles from './AdvancesEditor.module.css';

type Line = { person: string; amount: number | null };

const toLines = (views: AdvanceView[]): Line[] => views.map((a) => ({ person: a.person, amount: a.amount }));

/** Section « Avancé pour d'autres » du détail d'une dépense : avances ouvertes éditables, soldées en lecture seule. */
export function AdvancesEditor({ expenseId, expenseAmount }: { expenseId: number; expenseAmount: number }) {
  const advances = useAdvancesForExpense(expenseId);
  const people = useAdvancePeople();
  const setAdvances = useSetAdvances();
  const reopen = useReopenAdvance();
  const [source, setSource] = useState<AdvanceView[] | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  // Resynchronise le brouillon quand la liste serveur change (ouverture, ou après un enregistrement).
  if (advances.data && advances.data !== source) {
    setSource(advances.data);
    setLines(toLines(advances.data.filter((a) => a.refund === null && a.settledAt === null)));
  }

  const settled = (advances.data ?? []).filter((a) => a.refund !== null || a.settledAt !== null);
  const settledTotal = settled.reduce((s, a) => s + a.amount, 0);
  const openTotal = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const mine = Math.max(0, expenseAmount - settledTotal - openTotal);

  const datalistId = `advance-people-${expenseId}`;
  const knownPeople = [...new Set((people.data ?? []).map((p) => p.person))];

  function commit(next: Line[]) {
    const valid = next.filter((l) => l.person.trim().length > 0 && l.amount !== null && l.amount > 0).map((l) => ({ person: l.person.trim(), amount: l.amount! }));
    setAdvances.mutate({ expenseId, lines: valid });
  }

  function update(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function remove(index: number) {
    const next = lines.filter((_, i) => i !== index);
    setLines(next);
    commit(next);
  }

  if (!advances.data) return null;

  return (
    <div className={styles.section}>
      <GroupLabel as="p" id={`${datalistId}-label`}>
        Avancé pour d’autres
      </GroupLabel>
      <datalist id={datalistId}>
        {knownPeople.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {lines.length > 0 || settled.length > 0 ? (
        <ul className={styles.list}>
          {lines.map((line, i) => (
            <li key={i} className={styles.row}>
              <Input
                aria-label="Personne"
                list={datalistId}
                value={line.person}
                placeholder="Personne"
                autoComplete="off"
                onChange={(e) => update(i, { person: e.target.value })}
                onBlur={() => commit(lines)}
                className={styles.person}
              />
              <MoneyInput aria-label="Montant qu’elle doit" value={line.amount} placeholder="0,00" onChange={(v) => update(i, { amount: v })} onBlur={() => commit(lines)} className={styles.amount} />
              <button type="button" className={styles.remove} onClick={() => remove(i)} aria-label={`Retirer ${line.person || 'cette personne'}`}>
                <Trash2 aria-hidden />
              </button>
            </li>
          ))}
          {settled.map((a) => (
            <li key={a.id} className={[styles.row, styles.settledRow].join(' ')}>
              <span className={styles.person}>{a.person}</span>
              <span className={styles.amount}>{formatEuros(a.amount)}</span>
              <Badge tone="neutral">{a.refund ? 'Remboursée' : 'Soldée'}</Badge>
              <button type="button" className={styles.remove} onClick={() => reopen.mutate(a.id)} aria-label={`Rouvrir l’avance de ${a.person}`} disabled={reopen.isPending}>
                <RotateCcw aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button type="button" className={styles.add} onClick={() => setLines((current) => [...current, { person: '', amount: null }])}>
        <Plus aria-hidden /> Ajouter une personne
      </button>

      <p className={styles.mine}>
        Ta part : <strong className="num">{formatEuros(mine)}</strong> sur {formatEuros(expenseAmount)}
      </p>

      <FieldError>{setAdvances.error ? errorMessage(setAdvances.error) : null}</FieldError>
    </div>
  );
}
