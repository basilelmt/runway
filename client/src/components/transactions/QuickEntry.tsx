import { ArrowLeftRight, Check, Minus, Plus, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { addDays, today } from '@shared/dates';
import { formatEuros, parseEuros } from '@shared/money';
import { transactionInputSchema, type Transaction, type TransactionInput } from '@shared/schemas';
import { testSortingRule, useAccounts, useEnvelopes, useTransactions } from '@/api/hooks';
import { Button, DateInput, Dot, Select } from '@/components/ui';
import styles from './QuickEntry.module.css';

type Kind = 'expense' | 'income' | 'transfer';

const KINDS: { value: Kind; label: string; icon: typeof Minus }[] = [
  { value: 'expense', label: 'Dépense', icon: Minus },
  { value: 'income', label: 'Revenu', icon: Plus },
  { value: 'transfer', label: 'Virement', icon: ArrowLeftRight },
];

const SUBMIT_LABEL: Record<Kind, string> = { expense: 'la dépense', income: 'le revenu', transfer: 'le virement' };

/** D'où vient l'enveloppe proposée : choix de l'utilisateur, règle de tri ou opération passée. */
type EnvelopeSource = 'user' | 'rule' | 'history' | null;

type QuickEntryProps = {
  submitting?: boolean;
  serverError?: string | null;
  /** `again` : l'utilisateur veut saisir une autre opération juste après. */
  onSubmit: (input: TransactionInput, again: boolean) => void;
  /** Change à chaque enregistrement réussi en mode « une autre » : le formulaire se vide. */
  resetKey?: number;
};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Saisie rapide d'une opération : le montant d'abord, puis le libellé qui propose l'enveloppe. */
export function QuickEntry({ submitting, serverError, onSubmit, resetKey = 0 }: QuickEntryProps) {
  const accounts = useAccounts();
  const envelopes = useEnvelopes();
  const amountRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<Kind>('expense');
  const [amountText, setAmountText] = useState('');
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState<number | null>(null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [envelopeId, setEnvelopeId] = useState<number | null>(null);
  const [envelopeSource, setEnvelopeSource] = useState<EnvelopeSource>(null);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastReset, setLastReset] = useState(resetKey);

  // Après « Enregistrer et en saisir une autre » : on garde type, date et compte, on vide le reste.
  if (resetKey !== lastReset) {
    setLastReset(resetKey);
    setAmountText('');
    setLabel('');
    setEnvelopeId(null);
    setEnvelopeSource(null);
    setNote('');
    setShowNote(false);
    setErrors({});
  }
  useEffect(() => amountRef.current?.focus(), [resetKey]);

  const amount = parseEuros(amountText);
  const effectiveAccount = accountId ?? accounts.data?.[0]?.id ?? null;
  const yesterday = addDays(today(), -1);

  // Suggestions : opérations passées dont le libellé contient la saisie.
  const query = useDebounced(label.trim(), 200);
  const history = useTransactions({ q: query, kind, limit: 40 });
  const suggestions = useMemo(() => {
    if (query.length < 2) return [];
    const seen = new Set<string>();
    const out: Transaction[] = [];
    for (const t of history.data ?? []) {
      const key = t.label.trim().toLowerCase();
      if (seen.has(key) || key === label.trim().toLowerCase()) continue;
      seen.add(key);
      out.push(t);
      if (out.length === 3) break;
    }
    return out;
  }, [history.data, query, label]);

  // Tant que l'utilisateur n'a pas choisi, les règles de tri proposent l'enveloppe.
  useEffect(() => {
    if (kind !== 'expense' || envelopeSource === 'user' || envelopeSource === 'history' || query.length < 2) return;
    let cancelled = false;
    testSortingRule(query)
      .then(({ envelopeId: found }) => {
        if (cancelled) return;
        setEnvelopeId(found);
        setEnvelopeSource(found ? 'rule' : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [query, kind, envelopeSource]);

  function pickSuggestion(t: Transaction) {
    setLabel(t.label);
    if (t.kind === 'expense' && t.envelopeId) {
      setEnvelopeId(t.envelopeId);
      setEnvelopeSource('history');
    }
    if (t.accountId) setAccountId(t.accountId);
    if (amount === null) setAmountText((t.amount / 100).toFixed(2).replace('.', ','));
  }

  function chooseEnvelope(id: number | null) {
    setEnvelopeId(id);
    setEnvelopeSource('user');
  }

  function submit(again: boolean) {
    const input: TransactionInput = {
      kind,
      date,
      amount: amount ?? 0,
      label: label.trim(),
      accountId: effectiveAccount,
      toAccountId: kind === 'transfer' ? toAccountId : null,
      envelopeId: kind === 'expense' ? envelopeId : null,
      fromEnvelopeId: null,
      note: note.trim() || null,
    };
    const parsed = transactionInputSchema.safeParse(input);
    const next: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
    if (amount === null || amount <= 0) next.amount = 'Indique un montant';
    if (Object.keys(next).length > 0 || !parsed.success) {
      setErrors(next);
      if (next.amount) amountRef.current?.focus();
      return;
    }
    onSubmit(parsed.data, again);
  }

  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      submit(true);
    }
  }

  const sign = kind === 'expense' ? '−' : kind === 'income' ? '+' : '';
  const accountOptions = (accounts.data ?? []).map((a) => (
    <option key={a.id} value={a.id}>
      {a.name}
    </option>
  ));

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      onKeyDown={onKeyDown}
      noValidate
    >
      <div className={styles.kinds} role="radiogroup" aria-label="Type d’opération">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            className={[styles.kind, kind === k.value ? styles.kindActive : '', styles[k.value]].join(' ')}
            onClick={() => {
              setKind(k.value);
              setErrors({});
            }}
          >
            <k.icon aria-hidden />
            {k.label}
          </button>
        ))}
      </div>

      <div className={[styles.amount, errors.amount ? styles.amountError : '', styles[kind]].join(' ')}>
        <label htmlFor="quick-amount" className="visually-hidden">
          Montant
        </label>
        {sign ? (
          <span className={styles.sign} aria-hidden>
            {sign}
          </span>
        ) : null}
        <input
          ref={amountRef}
          id="quick-amount"
          className={['num', styles.amountInput].join(' ')}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={amountText}
          size={Math.max(1, amountText.length || 1)}
          onChange={(e) => {
            setAmountText(e.target.value.replace(/[^\d,.\s]/g, ''));
            setErrors((x) => ({ ...x, amount: '' }));
          }}
          onBlur={() => {
            if (amount !== null) setAmountText((Math.abs(amount) / 100).toFixed(2).replace('.', ','));
          }}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={errors.amount ? 'quick-amount-error' : undefined}
          autoFocus
        />
        <span className={styles.currency} aria-hidden>
          €
        </span>
      </div>
      {errors.amount ? (
        <p id="quick-amount-error" className={styles.error} role="alert">
          {errors.amount}
        </p>
      ) : null}

      <div className={styles.labelBlock}>
        <label htmlFor="quick-label" className="visually-hidden">
          Libellé
        </label>
        <input
          id="quick-label"
          className={styles.labelInput}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setErrors((x) => ({ ...x, label: '' }));
          }}
          placeholder={kind === 'income' ? 'D’où vient cet argent ?' : kind === 'transfer' ? 'Pourquoi ce virement ?' : 'Pour quoi ?'}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={errors.label ? true : undefined}
        />
        {errors.label ? <p className={styles.error}>{errors.label}</p> : null}
        {suggestions.length > 0 ? (
          <ul className={styles.suggestions} aria-label="Opérations passées">
            {suggestions.map((t) => {
              const env = t.envelopeId != null ? envelopes.data?.find((e) => e.id === t.envelopeId) : undefined;
              return (
                <li key={t.id}>
                  <button type="button" className={styles.suggestion} onClick={() => pickSuggestion(t)}>
                    <span className={styles.suggestionLabel}>{t.label}</span>
                    {env ? (
                      <span className={styles.suggestionMeta}>
                        <Dot color={env.color} size={8} /> {env.name}
                      </span>
                    ) : null}
                    <span className={['num', styles.suggestionMeta].join(' ')}>{formatEuros(t.amount)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {kind === 'expense' ? (
        <fieldset className={styles.group}>
          <legend className={styles.legend}>
            Enveloppe
            {envelopeSource === 'rule' || envelopeSource === 'history' ? (
              <span className={styles.auto}>
                <Sparkles aria-hidden /> {envelopeSource === 'rule' ? 'proposée par tes règles' : 'comme la dernière fois'}
              </span>
            ) : null}
          </legend>
          <div className={styles.chips}>
            <button type="button" className={[styles.chip, envelopeId === null ? styles.chipActive : ''].join(' ')} onClick={() => chooseEnvelope(null)} aria-pressed={envelopeId === null}>
              À ranger plus tard
            </button>
            {(envelopes.data ?? []).map((env) => (
              <button
                key={env.id}
                type="button"
                className={[styles.chip, envelopeId === env.id ? styles.chipActive : ''].join(' ')}
                onClick={() => chooseEnvelope(env.id)}
                aria-pressed={envelopeId === env.id}
                style={{ '--chip': env.color } as CSSProperties}
              >
                <Dot color={env.color} size={8} />
                {env.name}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className={styles.meta}>
        <div className={styles.dates} role="group" aria-label="Date">
          <button type="button" className={[styles.chip, date === today() ? styles.chipActive : ''].join(' ')} onClick={() => setDate(today())} aria-pressed={date === today()}>
            Aujourd’hui
          </button>
          <button type="button" className={[styles.chip, date === yesterday ? styles.chipActive : ''].join(' ')} onClick={() => setDate(yesterday)} aria-pressed={date === yesterday}>
            Hier
          </button>
          <DateInput aria-label="Autre date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} className={[styles.dateInput, date !== today() && date !== yesterday ? styles.dateActive : ''].join(' ')} />
        </div>

        <div className={styles.accounts}>
          <label className={styles.inline}>
            <span>{kind === 'income' ? 'Sur' : 'Depuis'}</span>
            <Select aria-label={kind === 'income' ? 'Compte crédité' : 'Compte débité'} value={effectiveAccount ?? ''} onChange={(e) => setAccountId(Number(e.target.value) || null)} className={styles.compactSelect}>
              {accountOptions}
            </Select>
          </label>
          {kind === 'transfer' ? (
            <label className={styles.inline}>
              <span>vers</span>
              <Select aria-label="Compte destination" value={toAccountId ?? ''} onChange={(e) => setToAccountId(Number(e.target.value) || null)} className={styles.compactSelect}>
                <option value="">Choisir</option>
                {accountOptions}
              </Select>
            </label>
          ) : null}
        </div>
        {errors.accountId || errors.toAccountId ? <p className={styles.error}>{errors.toAccountId ?? errors.accountId}</p> : null}
      </div>

      {showNote ? (
        <textarea className={styles.note} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Une note pour plus tard" aria-label="Note" rows={2} autoFocus />
      ) : (
        <button type="button" className={styles.addNote} onClick={() => setShowNote(true)}>
          + Ajouter une note
        </button>
      )}

      {serverError ? (
        <p className={styles.error} role="alert">
          {serverError}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={styles.again} onClick={() => submit(true)} disabled={submitting}>
          Enregistrer et en saisir une autre <kbd>⇧</kbd>
          <kbd>↵</kbd>
        </button>
        <Button type="submit" variant="primary" loading={submitting} icon={<Check />} className={styles.submit}>
          {amount ? `Enregistrer ${SUBMIT_LABEL[kind]} de ${formatEuros(Math.abs(amount))}` : 'Enregistrer'}
        </Button>
      </div>
    </form>
  );
}
