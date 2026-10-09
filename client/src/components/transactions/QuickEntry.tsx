import { ArrowLeftRight, Check, Minus, Plus, Sparkles } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { addDays, today } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { transactionInputSchema, type Transaction, type TransactionInput } from '@shared/schemas';
import { testSortingRule, useAccounts, useEnvelopes, useTransactions } from '@/api/hooks';
import { Amount, AmountHero, Button, ChipPicker, DateField, DialogFooter, Dot, FieldError, GroupLabel, Kbd, ListRow, Segmented, Select, Textarea } from '@/components/ui';
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
  mode?: 'create' | 'edit';
  /** Opération modifiée en mode `edit` ; jamais une répartition (voir AllocationForm). */
  initial?: Transaction;
  submitting?: boolean;
  serverError?: string | null;
  /** `again` : l'utilisateur veut saisir une autre opération juste après. */
  onSubmit: (input: TransactionInput, again: boolean) => void;
  /** Change à chaque enregistrement réussi en mode « une autre » : le formulaire se vide. */
  resetKey?: number;
  /** Action à gauche du pied (Supprimer). */
  footerStart?: ReactNode;
  /** Action avant le bouton principal (Confirmer sans modifier). */
  footerExtra?: ReactNode;
};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Saisie d'une opération : le montant d'abord, puis le libellé qui propose l'enveloppe. Sert aussi à la modifier. */
export function QuickEntry({ mode = 'create', initial, submitting, serverError, onSubmit, resetKey = 0, footerStart, footerExtra }: QuickEntryProps) {
  const accounts = useAccounts();
  const envelopes = useEnvelopes();
  const amountRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const editing = mode === 'edit';

  const [kind, setKind] = useState<Kind>(initial && initial.kind !== 'allocation' ? initial.kind : 'expense');
  const [amount, setAmount] = useState<number | null>(initial?.amount ?? null);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [date, setDate] = useState(initial?.date ?? today());
  const [accountId, setAccountId] = useState<number | null>(initial?.accountId ?? null);
  const [toAccountId, setToAccountId] = useState<number | null>(initial?.toAccountId ?? null);
  const [envelopeId, setEnvelopeId] = useState<number | null>(initial?.envelopeId ?? null);
  const [envelopeSource, setEnvelopeSource] = useState<EnvelopeSource>(initial ? 'user' : null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [showNote, setShowNote] = useState(Boolean(initial?.note));
  const [focusNote, setFocusNote] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastReset, setLastReset] = useState(resetKey);

  // Après « Enregistrer et en saisir une autre » : on garde type, date et compte, on vide le reste.
  if (resetKey !== lastReset) {
    setLastReset(resetKey);
    setAmount(null);
    setLabel('');
    setEnvelopeId(null);
    setEnvelopeSource(null);
    setNote('');
    setShowNote(false);
    setFocusNote(false);
    setErrors({});
  }
  useEffect(() => amountRef.current?.focus(), [resetKey]);

  const effectiveAccount = accountId ?? accounts.data?.[0]?.id ?? null;
  const yesterday = addDays(today(), -1);

  // Suggestions : opérations passées dont le libellé contient la saisie (création seulement).
  const query = useDebounced(editing ? '' : label.trim(), 200);
  // Pas de requête tant que la saisie est trop courte pour suggérer quoi que ce soit (ni en modification).
  const history = useTransactions({ q: query, kind, limit: 40 }, { enabled: query.length >= 2 });
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
    if (editing || kind !== 'expense' || envelopeSource === 'user' || envelopeSource === 'history' || query.length < 2) return;
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
  }, [query, kind, envelopeSource, editing]);

  function pickSuggestion(t: Transaction) {
    setLabel(t.label);
    if (t.kind === 'expense' && t.envelopeId) {
      setEnvelopeId(t.envelopeId);
      setEnvelopeSource('history');
    }
    if (t.accountId) setAccountId(t.accountId);
    if (amount === null) setAmount(t.amount);
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
    // Un bouton (même téléporté dans le pied du dialogue) garde son propre comportement.
    if (e.key === 'Enter' && e.shiftKey && !editing && !submitting && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      submit(true);
    }
  }

  const sign: '−' | '+' | '' = kind === 'expense' ? '−' : kind === 'income' ? '+' : '';
  const otherDate = date !== today() && date !== yesterday;
  const accountOptions = (accounts.data ?? []).map((a) => (
    <option key={a.id} value={a.id}>
      {a.name}
    </option>
  ));
  const submitText = editing ? 'Enregistrer' : amount ? `Enregistrer ${SUBMIT_LABEL[kind]} de ${formatEuros(Math.abs(amount))}` : 'Enregistrer';

  return (
    <form
      id={formId}
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      onKeyDown={onKeyDown}
      noValidate
    >
      {editing ? null : (
        <div className={styles.kinds}>
          <Segmented
            label="Type d’opération"
            value={kind}
            onChange={(v) => {
              setKind(v);
              setErrors({});
            }}
            options={KINDS.map((k) => ({ value: k.value, label: k.label, icon: <k.icon aria-hidden /> }))}
          />
        </div>
      )}

      <AmountHero
        ref={amountRef}
        id={`${formId}-amount`}
        value={amount}
        onChange={(cents) => {
          setAmount(cents);
          setErrors((x) => ({ ...x, amount: '' }));
        }}
        sign={sign}
        tone={kind === 'income' ? 'income' : 'neutral'}
        invalid={Boolean(errors.amount)}
        describedBy={errors.amount ? `${formId}-amount-error` : undefined}
        autoFocus
      />
      <FieldError id={`${formId}-amount-error`}>{errors.amount}</FieldError>

      <div className={styles.labelBlock}>
        <label htmlFor={`${formId}-label`} className="visually-hidden">
          Libellé
        </label>
        <input
          id={`${formId}-label`}
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
        <FieldError>{errors.label}</FieldError>
        {suggestions.length > 0 ? (
          <ul className="ledger" aria-label="Opérations passées">
            {suggestions.map((t) => {
              const env = t.envelopeId != null ? envelopes.data?.find((e) => e.id === t.envelopeId) : undefined;
              return (
                <ListRow
                  key={t.id}
                  compact
                  onClick={() => pickSuggestion(t)}
                  clickLabel={`Reprendre « ${t.label} »`}
                  title={t.label}
                  meta={
                    env ? (
                      <>
                        <Dot color={env.color} size={8} /> {env.name}
                      </>
                    ) : undefined
                  }
                  trail={<Amount cents={t.amount} tone="neutral" />}
                />
              );
            })}
          </ul>
        ) : null}
      </div>

      {kind === 'expense' ? (
        <div className={styles.group}>
          {/* Le groupe est nommé par son intitulé entier : « proposée par tes règles » est annoncé avec. */}
          <GroupLabel as="p" id={`${formId}-envelope`}>
            Enveloppe{' '}
            {envelopeSource === 'rule' || envelopeSource === 'history' ? (
              <span className={styles.auto}>
                <Sparkles aria-hidden /> {envelopeSource === 'rule' ? 'proposée par tes règles' : 'comme la dernière fois'}
              </span>
            ) : null}
          </GroupLabel>
          <ChipPicker
            aria-labelledby={`${formId}-envelope`}
            value={envelopeId}
            onChange={chooseEnvelope}
            options={[{ value: null, label: 'À ranger plus tard' }, ...(envelopes.data ?? []).map((env) => ({ value: env.id, label: env.name, color: env.color }))]}
          />
        </div>
      ) : null}

      <div className={styles.meta}>
        <div className={styles.dates} role="group" aria-label="Date">
          <ChipPicker
            aria-label="Date rapide"
            value={date}
            onChange={(v) => setDate(v)}
            options={[
              { value: today(), label: 'Aujourd’hui' },
              { value: yesterday, label: 'Hier' },
            ]}
          />
          <DateField
            variant="chip"
            aria-label="Autre date"
            value={otherDate ? date : null}
            placeholder="Autre date"
            shortcuts={false}
            max={editing ? undefined : today()}
            onChange={(v) => v && setDate(v)}
          />
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
        <FieldError>{errors.toAccountId ?? errors.accountId}</FieldError>
      </div>

      {showNote ? (
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Une note pour plus tard" aria-label="Note" autoFocus={focusNote} />
      ) : (
        <Button
          type="button"
          variant="text"
          className={styles.addNote}
          onClick={() => {
            setShowNote(true);
            setFocusNote(true);
          }}
        >
          + Ajouter une note
        </Button>
      )}

      <FieldError>{serverError}</FieldError>

      <DialogFooter
        start={
          editing ? (
            footerStart
          ) : (
            <Button type="button" variant="text" className={styles.again} onClick={() => submit(true)} disabled={submitting}>
              Enregistrer et en saisir une autre <Kbd>⇧</Kbd>
              <Kbd>↵</Kbd>
            </Button>
          )
        }
      >
        {footerExtra}
        <Button type="submit" form={formId} variant="primary" loading={submitting} icon={<Check />} className={editing ? undefined : styles.submit}>
          {submitText}
        </Button>
      </DialogFooter>
    </form>
  );
}
