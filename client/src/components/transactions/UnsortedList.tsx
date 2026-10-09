import { CheckCheck, Inbox, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SuggestResponse } from '@shared/api-types';
import type { Transaction } from '@shared/schemas';
import { ApiError, errorMessage } from '@/api/client';
import { useAccounts, useApplySorting, useEnvelopes, useSuggestSorting, useTransactions, useUpdateTransaction } from '@/api/hooks';
import { RuleBanner } from '@/components/transactions/RuleBanner';
import { Amount, Button, Dot, EmptyState, GroupLabel, InlinePill, ListRow, ListRowSkeleton, Notice, listRowDate, useToast } from '@/components/ui';
import { formatDateCompact, plural } from '@/lib/format';
import { displayLabel } from '@/lib/merchants';
import { prefersReducedMotion } from '@/lib/motion';
import styles from './UnsortedList.module.css';

/** Durée de la sortie d'une ligne rangée, alignée sur `.leaving` dans le CSS. */
const LEAVE_MS = 260;

type Banner = { transactionId: number; label: string; name: string; envelopeId: number };

function claudeErrorTitle(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'claude_not_installed':
        return 'Claude Code est introuvable';
      case 'claude_not_logged_in':
        return 'Claude Code n’est pas connecté';
      case 'claude_timeout':
        return 'Claude a mis trop de temps';
      default:
        return 'Le tri automatique a échoué';
    }
  }
  return 'Le tri automatique a échoué';
}

/** Dépenses sans enveloppe : on les range une à une, ou on laisse Claude proposer. */
export function UnsortedList() {
  const toast = useToast();
  const accounts = useAccounts();
  const envelopes = useEnvelopes();
  const unsorted = useTransactions({ unsorted: true, limit: 1000 });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [leaving, setLeaving] = useState<Set<number>>(new Set());
  const [suggestions, setSuggestions] = useState<SuggestResponse | null>(null);
  const [checkedRules, setCheckedRules] = useState<Set<string>>(new Set());

  const update = useUpdateTransaction({ onError: (e) => toast.error(errorMessage(e)) });
  const suggest = useSuggestSorting({
    onSuccess: (res) => {
      setSuggestions(res);
      setCheckedRules(new Set(res.rules.map((r) => r.pattern)));
      const count = res.suggestions.filter((s) => s.envelopeId !== null).length;
      if (res.warning) toast.error(`Tri interrompu : ${res.warning}`);
      else toast.success(count > 0 ? `Claude propose ${plural(count, 'enveloppe')}` : 'Claude n’a rien pu proposer');
    },
  });
  const apply = useApplySorting({
    onSuccess: (r) => {
      toast.success(`${plural(r.assigned, 'opération rangée', 'opérations rangées')}${r.rulesCreated ? `, ${plural(r.rulesCreated, 'règle créée', 'règles créées')}` : ''}`);
      setSuggestions(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const accountMap = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const envelopeMap = useMemo(() => new Map((envelopes.data ?? []).map((e) => [e.id, e])), [envelopes.data]);
  const suggestionFor = useMemo(() => new Map((suggestions?.suggestions ?? []).map((s) => [s.transactionId, s])), [suggestions]);
  const list = unsorted.data ?? [];
  const acceptable = list.filter((t) => (suggestionFor.get(t.id)?.envelopeId ?? null) !== null);

  function assign(t: Transaction, envelopeId: number) {
    const env = envelopeMap.get(envelopeId);
    if (!env) return;
    // La ligne glisse vers la droite et se replie, puis l'opération est rangée.
    setLeaving((ids) => new Set(ids).add(t.id));
    window.setTimeout(() => save(t, envelopeId, env.name), prefersReducedMotion() ? 0 : LEAVE_MS);
  }

  function save(t: Transaction, envelopeId: number, envelopeName: string) {
    update.mutate(
      { id: t.id, kind: t.kind, date: t.date, amount: t.amount, label: t.label, accountId: t.accountId, toAccountId: t.toAccountId, envelopeId, fromEnvelopeId: t.fromEnvelopeId, note: t.note },
      {
        onError: () =>
          setLeaving((ids) => {
            const next = new Set(ids);
            next.delete(t.id);
            return next;
          }),
        onSuccess: () => {
          toast.success(`Rangé dans ${envelopeName}`);
          setBanner({ transactionId: t.id, label: t.label, name: displayLabel(t), envelopeId });
          setSuggestions((s) => (s ? { ...s, suggestions: s.suggestions.filter((x) => x.transactionId !== t.id) } : s));
        },
      },
    );
  }

  function acceptAll() {
    apply.mutate({
      assignments: acceptable.map((t) => ({ transactionId: t.id, envelopeId: suggestionFor.get(t.id)!.envelopeId! })),
      rules: (suggestions?.rules ?? []).filter((r) => checkedRules.has(r.pattern)),
    });
  }

  return (
    <div className={styles.wrap}>
      {list.length > 0 ? (
        <div className={styles.bar}>
          <p className={styles.barText}>
            {plural(list.length, 'dépense', 'dépenses')} sans enveloppe. Range chacune dans la bonne enveloppe, Runway te proposera une règle pour les prochaines fois.
          </p>
          <Button variant="marking" icon={<Sparkles />} loading={suggest.isPending} onClick={() => suggest.mutate()} disabled={(envelopes.data ?? []).length === 0}>
            {suggest.isPending ? 'Claude réfléchit…' : 'Trier avec Claude'}
          </Button>
        </div>
      ) : null}

      {suggest.isPending ? <p className={styles.waiting}>Claude lit tes opérations et tes enveloppes. Cela peut prendre une minute.</p> : null}

      {suggest.error ? (
        <Notice tone="negative">
          <strong>{claudeErrorTitle(suggest.error)}</strong>
          <p className={styles.errorBody}>{errorMessage(suggest.error)}</p>
        </Notice>
      ) : null}

      {suggestions && list.length > 0 ? (
        <Notice
          tone="neutral"
          icon={<Sparkles />}
          label="Suggestions de Claude"
          action={
            <Button variant="primary" icon={<CheckCheck />} loading={apply.isPending} disabled={acceptable.length === 0} onClick={acceptAll}>
              Tout accepter
            </Button>
          }
        >
          <strong>{plural(acceptable.length, 'suggestion')}</strong>
          <p className={styles.suggestionsHint}>Les enveloppes proposées sont pré-remplies ci-dessous. Vérifie, ajuste, puis accepte.</p>
          {suggestions.rules.length > 0 ? (
            <fieldset className={styles.rules}>
              <GroupLabel as="p">Règles proposées, créées avec "Tout accepter"</GroupLabel>
              {suggestions.rules.map((r) => {
                const env = envelopeMap.get(r.envelopeId);
                return (
                  <label key={r.pattern} className={styles.rule}>
                    <input
                      type="checkbox"
                      checked={checkedRules.has(r.pattern)}
                      onChange={(e) =>
                        setCheckedRules((set) => {
                          const next = new Set(set);
                          if (e.target.checked) next.add(r.pattern);
                          else next.delete(r.pattern);
                          return next;
                        })
                      }
                    />
                    <span className="mono">{r.pattern}</span>
                    <span className="muted">→</span>
                    {env ? (
                      <span className={styles.ruleEnv}>
                        <Dot color={env.color} size={8} /> {env.name}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </fieldset>
          ) : null}
        </Notice>
      ) : null}

      {banner ? (
        <section className={styles.bannerBlock} aria-live="polite">
          <p className={styles.bannerTitle}>
            <span className={styles.bannerLabel}>{banner.name}</span> rangé dans <strong>{envelopeMap.get(banner.envelopeId)?.name}</strong>
          </p>
          <RuleBanner key={banner.transactionId} label={banner.label} envelopeId={banner.envelopeId} envelopeName={envelopeMap.get(banner.envelopeId)?.name ?? ''} onDone={() => setBanner(null)} />
        </section>
      ) : null}

      {unsorted.isPending ? (
        <ListRowSkeleton rows={5} meta={false} actions />
      ) : unsorted.error ? (
        <p className={styles.errorBody} role="alert">
          {errorMessage(unsorted.error)}
        </p>
      ) : list.length === 0 ? (
        <EmptyState icon={<Inbox />} title="Tout est rangé" description="Chaque dépense a son enveloppe. Les nouvelles opérations sans enveloppe arriveront ici." />
      ) : (
        <ul className="ledger stagger">
          {list.map((t) => {
            const suggestion = suggestionFor.get(t.id);
            const suggestedId = suggestion?.envelopeId ?? null;
            const account = t.accountId != null ? accountMap.get(t.accountId) : undefined;
            return (
              <li key={t.id} className={[styles.item, leaving.has(t.id) ? styles.leaving : ''].join(' ')}>
                <ListRow
                  as="div"
                  lead={<span className={listRowDate}>{formatDateCompact(t.date)}</span>}
                  title={<span title={t.label}>{displayLabel(t)}</span>}
                  meta={account?.name}
                  trail={<Amount cents={-t.amount} tone="neutral" />}
                  actions={
                    <>
                      {suggestion && suggestedId !== null ? (
                        <span className={styles.sparkle} title={suggestion.reason} aria-label={`Suggestion de Claude : ${suggestion.reason}`}>
                          <Sparkles />
                        </span>
                      ) : null}
                      <InlinePill
                        aria-label={`Enveloppe pour ${displayLabel(t)}`}
                        value={suggestedId}
                        placeholder="+ Enveloppe"
                        tone={suggestedId !== null ? 'suggested' : undefined}
                        options={(envelopes.data ?? []).map((env) => ({ value: env.id, label: env.name, color: env.color }))}
                        onChange={(v) => v !== null && assign(t, v)}
                        disabled={update.isPending && update.variables?.id === t.id}
                      />
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
