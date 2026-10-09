import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { addDays, addMonths, endOfMonth, startOfMonth, today } from '@shared/dates';
import type { Account, Envelope, TransactionFilter, TransactionStatus } from '@shared/schemas';
import { Button, DateRangeField, FilterPill, SearchPill, Segmented } from '@/components/ui';
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

/**
 * Lien vers Opérations sur une plage de dates : le preset « Ce mois » ou « Mois dernier » quand
 * la plage y correspond, pour que l'écran l'affiche sélectionné, des dates explicites sinon.
 */
export function operationsHref({ envelope, from, to }: { envelope?: number; from: string; to: string }): string {
  const preset = (['month', 'last-month'] as const).find((p) => {
    const range = periodRange(p);
    return range.from === from && range.to === to;
  });
  const params = filtersToParams({ ...DEFAULT_FILTERS, envelope, period: preset ?? 'custom', from, to });
  return `/operations${params.size ? `?${params}` : ''}`;
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
        <SearchPill placeholder="Rechercher un marchand ou un libellé (/)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
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

      <div className={styles.line}>
        <FilterPill className={styles.grow} aria-label="Compte" value={value.account ? String(value.account) : ''} resetValue="" onChange={(v) => onChange({ ...value, account: v ? Number(v) : undefined })}>
          <option value="">Tous les comptes</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </FilterPill>
        <FilterPill className={styles.grow} aria-label="Enveloppe" value={value.envelope ? String(value.envelope) : ''} resetValue="" onChange={(v) => onChange({ ...value, envelope: v ? Number(v) : undefined })}>
          <option value="">Toutes les enveloppes</option>
          {envelopes.map((env) => (
            <option key={env.id} value={env.id}>
              {env.name}
            </option>
          ))}
        </FilterPill>
        {value.period === 'custom' ? (
          <DateRangeField
            variant="pill"
            aria-label="Période personnalisée"
            from={value.from ?? null}
            to={value.to ?? null}
            onChange={({ from, to }) => onChange({ ...value, from: from ?? undefined, to: to ?? undefined })}
          />
        ) : null}
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
