import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { addDays, addMonths, endOfMonth, startOfMonth, today } from '@shared/dates';
import type { Account, Envelope, TransactionFilter, TransactionStatus } from '@shared/schemas';
import { Button, DateInput, Input, Segmented, Select } from '@/components/ui';
import styles from './TransactionFilters.module.css';

export type Period = 'month' | 'last-month' | '30d' | 'all' | 'custom';

export type FiltersState = {
  account: number | undefined;
  envelope: number | undefined;
  period: Period;
  from: string | undefined;
  to: string | undefined;
  q: string;
  status: TransactionStatus | undefined;
};

export const DEFAULT_FILTERS: FiltersState = { account: undefined, envelope: undefined, period: 'month', from: undefined, to: undefined, q: '', status: undefined };

/** Bornes de dates d'un preset, calculées au moment de la requête. */
export function periodRange(period: Period, from?: string, to?: string): { from?: string; to?: string } {
  const t = today();
  switch (period) {
    case 'month':
      return { from: startOfMonth(t), to: endOfMonth(t) };
    case 'last-month': {
      const prev = addMonths(startOfMonth(t), -1);
      return { from: prev, to: endOfMonth(prev) };
    }
    case '30d':
      return { from: addDays(t, -30), to: t };
    case 'all':
      return {};
    case 'custom':
      return { from, to };
  }
}

export function toApiFilter(f: FiltersState): Partial<TransactionFilter> {
  const range = periodRange(f.period, f.from, f.to);
  return {
    account: f.account,
    envelope: f.envelope,
    from: range.from,
    to: range.to,
    q: f.q.trim() || undefined,
    status: f.status,
  };
}

export function filtersFromParams(params: URLSearchParams): FiltersState {
  const period = params.get('period') as Period | null;
  const status = params.get('status') as TransactionStatus | null;
  return {
    account: params.get('account') ? Number(params.get('account')) : undefined,
    envelope: params.get('envelope') ? Number(params.get('envelope')) : undefined,
    period: period && ['month', 'last-month', '30d', 'all', 'custom'].includes(period) ? period : 'month',
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    q: params.get('q') ?? '',
    status: status === 'confirmed' || status === 'planned' ? status : undefined,
  };
}

export function filtersToParams(f: FiltersState): URLSearchParams {
  const params = new URLSearchParams();
  if (f.account) params.set('account', String(f.account));
  if (f.envelope) params.set('envelope', String(f.envelope));
  if (f.period !== 'month') params.set('period', f.period);
  if (f.period === 'custom') {
    if (f.from) params.set('from', f.from);
    if (f.to) params.set('to', f.to);
  }
  if (f.q.trim()) params.set('q', f.q.trim());
  if (f.status) params.set('status', f.status);
  return params;
}

type TransactionFiltersProps = {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
  accounts: Account[];
  envelopes: Envelope[];
};

export function TransactionFilters({ value, onChange, accounts, envelopes }: TransactionFiltersProps) {
  // La recherche est débouncée pour ne pas spammer l'API ni l'URL à chaque frappe.
  const [q, setQ] = useState(value.q);
  const [lastQ, setLastQ] = useState(value.q);
  if (value.q !== lastQ) {
    setLastQ(value.q);
    setQ(value.q);
  }
  useEffect(() => {
    if (q === value.q) return;
    const id = window.setTimeout(() => onChange({ ...value, q }), 250);
    return () => window.clearTimeout(id);
  }, [q, value, onChange]);

  const isDefault = JSON.stringify(value) === JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className={styles.filters}>
      <div className={styles.line}>
        <div className={styles.search}>
          <Search className={styles.searchIcon} aria-hidden />
          <Input type="search" placeholder="Rechercher un libellé (/)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" className={styles.searchInput} />
        </div>
        <Segmented
          label="Période"
          value={value.period}
          onChange={(period) => onChange({ ...value, period })}
          options={[
            { value: 'month', label: 'Ce mois' },
            { value: 'last-month', label: 'Mois dernier' },
            { value: '30d', label: '30 jours' },
            { value: 'all', label: 'Tout' },
            { value: 'custom', label: 'Dates' },
          ]}
        />
      </div>

      {value.period === 'custom' ? (
        <div className={styles.dates}>
          <DateInput aria-label="Du" value={value.from ?? ''} onChange={(e) => onChange({ ...value, from: e.target.value || undefined })} />
          <span className="muted">au</span>
          <DateInput aria-label="Au" value={value.to ?? ''} onChange={(e) => onChange({ ...value, to: e.target.value || undefined })} />
        </div>
      ) : null}

      <div className={styles.line}>
        <Select aria-label="Compte" value={value.account ?? ''} onChange={(e) => onChange({ ...value, account: e.target.value ? Number(e.target.value) : undefined })} className={styles.select}>
          <option value="">Tous les comptes</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Enveloppe" value={value.envelope ?? ''} onChange={(e) => onChange({ ...value, envelope: e.target.value ? Number(e.target.value) : undefined })} className={styles.select}>
          <option value="">Toutes les enveloppes</option>
          {envelopes.map((env) => (
            <option key={env.id} value={env.id}>
              {env.name}
            </option>
          ))}
        </Select>
        <Segmented
          label="Statut"
          value={value.status ?? 'all'}
          onChange={(s) => onChange({ ...value, status: s === 'all' ? undefined : s })}
          options={[
            { value: 'all', label: 'Toutes' },
            { value: 'confirmed', label: 'Passées' },
            { value: 'planned', label: 'Prévues' },
          ]}
        />
        {!isDefault ? (
          <Button variant="ghost" icon={<X />} onClick={() => onChange(DEFAULT_FILTERS)}>
            Réinitialiser
          </Button>
        ) : null}
      </div>
    </div>
  );
}
