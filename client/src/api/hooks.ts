import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import type {
  BankAuthStart,
  BankConnectionView,
  BankSyncRunResult,
  BankSyncState,
  ForecastResponse,
  ImportCommitInput,
  ImportPreview,
  MonthlyReport,
  NetWorthReport,
  Overview,
  SpendingReport,
  SuggestResponse,
} from '@shared/api-types';
import type {
  Account,
  AccountInput,
  AccountPatch,
  BankLinkInput,
  Envelope,
  EnvelopeFund,
  EnvelopeInput,
  EnvelopePatch,
  ImportRecord,
  RecurringRule,
  RecurringRuleInput,
  Settings,
  SortingApply,
  SortingRule,
  SortingRuleInput,
  Transaction,
  TransactionFilter,
  TransactionInput,
} from '@shared/schemas';
import { api } from './client';

export type RecurringRuleView = RecurringRule & { nextDate: string | null; monthlyEquivalent: number };

/** Clés de cache. Toute écriture invalide les vues dérivées (overview, forecast, reports). */
export const keys = {
  overview: ['overview'] as const,
  accounts: (archived = false) => ['accounts', { archived }] as const,
  envelopes: (archived = false) => ['envelopes', { archived }] as const,
  transactions: (filter: Partial<TransactionFilter> = {}) => ['transactions', filter] as const,
  transaction: (id: number) => ['transaction', id] as const,
  rules: ['recurring-rules'] as const,
  sortingRules: ['sorting-rules'] as const,
  settings: ['settings'] as const,
  forecast: (horizon?: number) => ['forecast', horizon ?? null] as const,
  spending: (from?: string, to?: string) => ['reports', 'spending', from ?? null, to ?? null] as const,
  monthly: (months: number) => ['reports', 'monthly', months] as const,
  netWorth: (months: number, horizon: number) => ['reports', 'net-worth', months, horizon] as const,
  imports: ['imports'] as const,
  bankSync: ['bank-sync'] as const,
  bankSyncRun: ['bank-sync', 'run'] as const,
};

const DERIVED = [['overview'], ['forecast'], ['reports'], ['transactions'], ['transaction']];

function useInvalidate() {
  const qc = useQueryClient();
  return (...extra: readonly (readonly unknown[])[]) => {
    for (const key of [...DERIVED, ...extra]) void qc.invalidateQueries({ queryKey: key });
  };
}

type MutOpts<TData, TVars> = Omit<UseMutationOptions<TData, Error, TVars>, 'mutationFn'>;

function toQuery(filter: Partial<TransactionFilter>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined || v === '' || v === false) continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

// Overview, forecast, reports

export const useOverview = () => useQuery({ queryKey: keys.overview, queryFn: () => api.get<Overview>('/api/overview') });

export const useForecast = (horizon?: number) =>
  useQuery({ queryKey: keys.forecast(horizon), queryFn: () => api.get<ForecastResponse>(`/api/forecast${horizon ? `?horizon=${horizon}` : ''}`) });

export const useSpending = (from?: string, to?: string) =>
  useQuery({
    queryKey: keys.spending(from, to),
    queryFn: () => api.get<SpendingReport>(`/api/reports/spending${toQuery({ from, to })}`),
  });

export const useMonthly = (months = 12) =>
  useQuery({ queryKey: keys.monthly(months), queryFn: () => api.get<MonthlyReport>(`/api/reports/monthly?months=${months}`) });

export const useNetWorth = (months = 12, horizon = 90) =>
  useQuery({
    queryKey: keys.netWorth(months, horizon),
    queryFn: () => api.get<NetWorthReport>(`/api/reports/net-worth?months=${months}&horizon=${horizon}`),
  });

// Accounts

export const useAccounts = (archived = false) =>
  useQuery({ queryKey: keys.accounts(archived), queryFn: () => api.get<Account[]>(`/api/accounts${archived ? '?archived=true' : ''}`) });

export function useCreateAccount(opts?: MutOpts<Account, AccountInput>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (input) => api.post<Account>('/api/accounts', input), onSuccess: (...a) => { invalidate(['accounts']); opts?.onSuccess?.(...a); } });
}

export function useUpdateAccount(opts?: MutOpts<Account, { id: number } & AccountPatch>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: ({ id, ...input }) => api.patch<Account>(`/api/accounts/${id}`, input), onSuccess: (...a) => { invalidate(['accounts']); opts?.onSuccess?.(...a); } });
}

// Envelopes

export const useEnvelopes = (archived = false) =>
  useQuery({ queryKey: keys.envelopes(archived), queryFn: () => api.get<Envelope[]>(`/api/envelopes${archived ? '?archived=true' : ''}`) });

export function useCreateEnvelope(opts?: MutOpts<Envelope, EnvelopeInput>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (input) => api.post<Envelope>('/api/envelopes', input), onSuccess: (...a) => { invalidate(['envelopes']); opts?.onSuccess?.(...a); } });
}

export function useUpdateEnvelope(opts?: MutOpts<Envelope, { id: number } & EnvelopePatch>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: ({ id, ...input }) => api.patch<Envelope>(`/api/envelopes/${id}`, input), onSuccess: (...a) => { invalidate(['envelopes']); opts?.onSuccess?.(...a); } });
}

export function useFundEnvelopes(opts?: MutOpts<Transaction[], EnvelopeFund>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (input) => api.post<Transaction[]>('/api/envelopes/fund', input), onSuccess: (...a) => { invalidate(); opts?.onSuccess?.(...a); } });
}

export function useReorderEnvelopes(opts?: MutOpts<Envelope[], number[]>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (ids) => api.put<Envelope[]>('/api/envelopes/reorder', { ids }), onSuccess: (...a) => { invalidate(['envelopes']); opts?.onSuccess?.(...a); } });
}

// Transactions

export const useTransactions = (filter: Partial<TransactionFilter> = {}, options: { enabled?: boolean } = {}) =>
  useQuery({ queryKey: keys.transactions(filter), queryFn: () => api.get<Transaction[]>(`/api/transactions${toQuery(filter)}`), enabled: options.enabled });

export function useCreateTransaction(opts?: MutOpts<Transaction, TransactionInput>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (input) => api.post<Transaction>('/api/transactions', input), onSuccess: (...a) => { invalidate(); opts?.onSuccess?.(...a); } });
}

export function useUpdateTransaction(opts?: MutOpts<Transaction, { id: number } & TransactionInput>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: ({ id, ...input }) => api.put<Transaction>(`/api/transactions/${id}`, input), onSuccess: (...a) => { invalidate(); opts?.onSuccess?.(...a); } });
}

export function useConfirmTransaction(opts?: MutOpts<Transaction, number>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (id) => api.post<Transaction>(`/api/transactions/${id}/confirm`), onSuccess: (...a) => { invalidate(); opts?.onSuccess?.(...a); } });
}

export function useDeleteTransaction(opts?: MutOpts<void, number>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (id) => api.delete(`/api/transactions/${id}`), onSuccess: (...a) => { invalidate(); opts?.onSuccess?.(...a); } });
}

// Recurring rules

export const useRecurringRules = () => useQuery({ queryKey: keys.rules, queryFn: () => api.get<RecurringRuleView[]>('/api/recurring-rules') });

export function useCreateRecurringRule(opts?: MutOpts<RecurringRuleView, RecurringRuleInput>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (input) => api.post<RecurringRuleView>('/api/recurring-rules', input), onSuccess: (...a) => { invalidate(keys.rules); opts?.onSuccess?.(...a); } });
}

export function useUpdateRecurringRule(opts?: MutOpts<RecurringRuleView, { id: number } & RecurringRuleInput>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: ({ id, ...input }) => api.put<RecurringRuleView>(`/api/recurring-rules/${id}`, input), onSuccess: (...a) => { invalidate(keys.rules); opts?.onSuccess?.(...a); } });
}

export function useSetRuleActive(opts?: MutOpts<RecurringRuleView, { id: number; active: boolean }>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: ({ id, active }) => api.patch<RecurringRuleView>(`/api/recurring-rules/${id}/active`, { active }), onSuccess: (...a) => { invalidate(keys.rules); opts?.onSuccess?.(...a); } });
}

export function useDeleteRecurringRule(opts?: MutOpts<void, number>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (id) => api.delete(`/api/recurring-rules/${id}`), onSuccess: (...a) => { invalidate(keys.rules); opts?.onSuccess?.(...a); } });
}

// Sorting rules and Claude

export const useSortingRules = () => useQuery({ queryKey: keys.sortingRules, queryFn: () => api.get<SortingRule[]>('/api/sorting-rules') });

export function useCreateSortingRule(opts?: MutOpts<SortingRule, SortingRuleInput>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (input) => api.post<SortingRule>('/api/sorting-rules', input), onSuccess: (...a) => { invalidate(keys.sortingRules); opts?.onSuccess?.(...a); } });
}

export function useUpdateSortingRule(opts?: MutOpts<SortingRule, { id: number } & SortingRuleInput>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: ({ id, ...input }) => api.put<SortingRule>(`/api/sorting-rules/${id}`, input), onSuccess: (...a) => { invalidate(keys.sortingRules); opts?.onSuccess?.(...a); } });
}

export function useDeleteSortingRule(opts?: MutOpts<void, number>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (id) => api.delete(`/api/sorting-rules/${id}`), onSuccess: (...a) => { invalidate(keys.sortingRules); opts?.onSuccess?.(...a); } });
}

export function useReorderSortingRules(opts?: MutOpts<SortingRule[], number[]>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (ids) => api.put<SortingRule[]>('/api/sorting-rules/reorder', { ids }), onSuccess: (...a) => { invalidate(keys.sortingRules); opts?.onSuccess?.(...a); } });
}

export function useApplySortingRules(opts?: MutOpts<{ assigned: number }, void>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: () => api.post<{ assigned: number }>('/api/sorting-rules/apply'), onSuccess: (...a) => { invalidate(); opts?.onSuccess?.(...a); } });
}

export const testSortingRule = (label: string) => api.post<{ envelopeId: number | null }>('/api/sorting-rules/test', { label });

export function useSuggestSorting(opts?: MutOpts<SuggestResponse, void>) {
  return useMutation({ ...opts, mutationFn: () => api.post<SuggestResponse>('/api/sorting/suggest') });
}

export function useApplySorting(opts?: MutOpts<{ assigned: number; rulesCreated: number }, SortingApply>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (input) => api.post<{ assigned: number; rulesCreated: number }>('/api/sorting/apply', input), onSuccess: (...a) => { invalidate(keys.sortingRules); opts?.onSuccess?.(...a); } });
}

// Imports

export const useImports = () => useQuery({ queryKey: keys.imports, queryFn: () => api.get<ImportRecord[]>('/api/imports') });

export type ImportPreviewWithFile = ImportPreview & { fileName: string };

export function usePreviewImport(opts?: MutOpts<ImportPreviewWithFile, { file: File; accountId?: number | null; section?: number | null }>) {
  return useMutation({
    ...opts,
    mutationFn: ({ file, accountId, section }) => {
      const form = new FormData();
      form.append('file', file);
      if (accountId) form.append('accountId', String(accountId));
      if (section != null) form.append('section', String(section));
      return api.upload<ImportPreviewWithFile>('/api/imports/preview', form);
    },
  });
}

export function useCommitImport(opts?: MutOpts<ImportRecord, ImportCommitInput & { bankAccountNumber?: string | null }>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (input) => api.post<ImportRecord>('/api/imports/commit', input), onSuccess: (...a) => { invalidate(keys.imports, ['accounts']); opts?.onSuccess?.(...a); } });
}

// Settings

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api.get<Settings>('/api/settings') });

export function useSaveSettings(opts?: MutOpts<Settings, Settings>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (input) => api.put<Settings>('/api/settings', input), onSuccess: (...a) => { invalidate(keys.settings); opts?.onSuccess?.(...a); } });
}

// Synchronisation bancaire

export const useBankSync = () => useQuery({ queryKey: keys.bankSync, queryFn: () => api.get<BankSyncState>('/api/bank-sync') });

export function useTestBankCredentials(opts?: MutOpts<{ name: string; environment: string }, void>) {
  return useMutation({ ...opts, mutationFn: () => api.post<{ name: string; environment: string }>('/api/bank-sync/test', {}) });
}

export function useStartBankConnection(opts?: MutOpts<BankAuthStart, number | undefined>) {
  return useMutation({ ...opts, mutationFn: (connectionId) => api.post<BankAuthStart>('/api/bank-sync/connections', { connectionId: connectionId ?? null }) });
}

export function useCompleteBankConnection(opts?: MutOpts<BankConnectionView, { connectionId: number; code: string; state: string }>) {
  const invalidate = useInvalidate();
  return useMutation({
    ...opts,
    mutationFn: ({ connectionId, code, state }) => api.post<BankConnectionView>(`/api/bank-sync/connections/${connectionId}/complete`, { code, state }),
    onSuccess: (...a) => {
      invalidate(keys.bankSync);
      opts?.onSuccess?.(...a);
    },
  });
}

export function useLinkBankAccounts(opts?: MutOpts<BankConnectionView, { connectionId: number } & BankLinkInput>) {
  const invalidate = useInvalidate();
  return useMutation({
    ...opts,
    mutationFn: ({ connectionId, links }) => api.put<BankConnectionView>(`/api/bank-sync/connections/${connectionId}/accounts`, { links }),
    onSuccess: (...a) => {
      invalidate(keys.bankSync);
      opts?.onSuccess?.(...a);
    },
  });
}

export function useRunBankSync(opts?: MutOpts<BankSyncRunResult, number | undefined>) {
  const invalidate = useInvalidate();
  return useMutation({
    ...opts,
    mutationKey: keys.bankSyncRun,
    mutationFn: (onlyIfStaleMinutes) => api.post<BankSyncRunResult>('/api/bank-sync/run', onlyIfStaleMinutes ? { onlyIfStaleMinutes } : {}),
    onSuccess: (...a) => {
      if (a[0].reason === 'ok') invalidate(keys.bankSync, keys.imports, ['accounts']);
      opts?.onSuccess?.(...a);
    },
  });
}

export function useDisconnectBank(opts?: MutOpts<void, number>) {
  const invalidate = useInvalidate();
  return useMutation({
    ...opts,
    mutationFn: (id) => api.delete(`/api/bank-sync/connections/${id}`),
    onSuccess: (...a) => {
      invalidate(keys.bankSync);
      opts?.onSuccess?.(...a);
    },
  });
}
