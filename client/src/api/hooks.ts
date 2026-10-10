import { useEffect, useRef } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import type {
  AnySignal,
  BankAuthStart,
  BankConnectionView,
  BankSyncRunResult,
  AssetSearchResult,
  BankSyncState,
  BinanceState,
  BinanceSyncResult,
  ForecastResponse,
  IdeaRunStart,
  IdeaRunView,
  IdeasView,
  ImportCommitInput,
  ImportPreview,
  MerchantDetail,
  MerchantStatus,
  MonthlyReport,
  NetWorthReport,
  Overview,
  PortfolioRange,
  PortfolioView,
  SpendingReport,
  SuggestResponse,
} from '@shared/api-types';
import type {
  Account,
  AccountInput,
  AccountPatch,
  BankLinkInput,
  BinanceKeys,
  Envelope,
  EnvelopeFund,
  EnvelopeInput,
  EnvelopePatch,
  HoldingInput,
  ImportRecord,
  RecurringRule,
  RecurringRuleInput,
  Settings,
  SortingApply,
  SortingRule,
  SortingRuleInput,
  TradeInput,
  TradePatch,
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
  invest: ['invest'] as const,
  portfolio: (range: PortfolioRange) => ['invest', 'portfolio', range] as const,
  assetSearch: (q: string) => ['invest', 'search', q] as const,
  ideas: ['invest', 'ideas'] as const,
  ideaRun: (id: number) => ['invest', 'run', id] as const,
  binanceSync: ['invest', 'binance', 'sync'] as const,
  merchant: (key: string) => ['merchants', 'detail', key] as const,
  merchantStatus: ['merchants', 'status'] as const,
  signals: ['signals'] as const,
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

// La liste active se déduit de la liste complète déjà en cache (archivés compris) le temps de son chargement :
// un formulaire ouvert depuis un écran qui l'a chargée s'affiche complet d'emblée.
export function useAccounts(archived = false) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.accounts(archived),
    queryFn: () => api.get<Account[]>(`/api/accounts${archived ? '?archived=true' : ''}`),
    placeholderData: archived ? undefined : () => qc.getQueryData<Account[]>(keys.accounts(true))?.filter((a) => !a.archived),
  });
}

export function useCreateAccount(opts?: MutOpts<Account, AccountInput>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (input) => api.post<Account>('/api/accounts', input), onSuccess: (...a) => { invalidate(['accounts']); opts?.onSuccess?.(...a); } });
}

export function useUpdateAccount(opts?: MutOpts<Account, { id: number } & AccountPatch>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: ({ id, ...input }) => api.patch<Account>(`/api/accounts/${id}`, input), onSuccess: (...a) => { invalidate(['accounts']); opts?.onSuccess?.(...a); } });
}

// Envelopes

// Même principe que useAccounts.
export function useEnvelopes(archived = false) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.envelopes(archived),
    queryFn: () => api.get<Envelope[]>(`/api/envelopes${archived ? '?archived=true' : ''}`),
    placeholderData: archived ? undefined : () => qc.getQueryData<Envelope[]>(keys.envelopes(true))?.filter((e) => !e.archived),
  });
}

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

export function useUndoFunding(opts?: MutOpts<void, number>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (id) => api.post<void>(`/api/fundings/${id}/undo`), onSuccess: (...a) => { invalidate(['envelopes']); opts?.onSuccess?.(...a); } });
}

export function useDismissFunding(opts?: MutOpts<void, number>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (id) => api.post<void>(`/api/fundings/${id}/dismiss`), onSuccess: (...a) => { invalidate(); opts?.onSuccess?.(...a); } });
}

export function useReorderEnvelopes(opts?: MutOpts<Envelope[], number[]>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (ids) => api.put<Envelope[]>('/api/envelopes/reorder', { ids }), onSuccess: (...a) => { invalidate(['envelopes']); opts?.onSuccess?.(...a); } });
}

// Transactions

/** `keepPrevious` garde la liste précédente affichée pendant le chargement d'un autre filtre. */
export const useTransactions = (filter: Partial<TransactionFilter> = {}, options: { enabled?: boolean; keepPrevious?: boolean } = {}) =>
  useQuery({
    queryKey: keys.transactions(filter),
    queryFn: () => api.get<Transaction[]>(`/api/transactions${toQuery(filter)}`),
    enabled: options.enabled,
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
  });

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

// Le serveur relance la détection des signaux après toute modification de charge fixe (création,
// montant, pause, suppression) : le client invalide aussi leur liste pour rester synchrone.
export function useCreateRecurringRule(opts?: MutOpts<RecurringRuleView, RecurringRuleInput>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (input) => api.post<RecurringRuleView>('/api/recurring-rules', input), onSuccess: (...a) => { invalidate(keys.rules, keys.signals); opts?.onSuccess?.(...a); } });
}

export function useUpdateRecurringRule(opts?: MutOpts<RecurringRuleView, { id: number } & RecurringRuleInput>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: ({ id, ...input }) => api.put<RecurringRuleView>(`/api/recurring-rules/${id}`, input), onSuccess: (...a) => { invalidate(keys.rules, keys.signals); opts?.onSuccess?.(...a); } });
}

export function useSetRuleActive(opts?: MutOpts<RecurringRuleView, { id: number; active: boolean }>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: ({ id, active }) => api.patch<RecurringRuleView>(`/api/recurring-rules/${id}/active`, { active }), onSuccess: (...a) => { invalidate(keys.rules, keys.signals); opts?.onSuccess?.(...a); } });
}

export function useDeleteRecurringRule(opts?: MutOpts<void, number>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (id) => api.delete(`/api/recurring-rules/${id}`), onSuccess: (...a) => { invalidate(keys.rules, keys.signals); opts?.onSuccess?.(...a); } });
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
  // Le serveur lance le nommage des marchands et relance la détection des signaux après un import.
  return useMutation({ ...opts, mutationFn: (input) => api.post<ImportRecord>('/api/imports/commit', input), onSuccess: (...a) => { invalidate(keys.imports, ['accounts'], keys.merchantStatus, keys.signals); opts?.onSuccess?.(...a); } });
}

// Marchands

export const useMerchant = (key: string | null) =>
  useQuery({ queryKey: keys.merchant(key ?? ''), queryFn: () => api.get<MerchantDetail>(`/api/merchants/${encodeURIComponent(key!)}`), enabled: key !== null });

/** Renomme un marchand pour toutes ses opérations ; un nom vide le rend à Claude. */
export function useRenameMerchant(opts?: MutOpts<MerchantDetail, { key: string; name: string }>) {
  const invalidate = useInvalidate();
  return useMutation({
    ...opts,
    mutationFn: ({ key, name }) => api.put<MerchantDetail>(`/api/merchants/${encodeURIComponent(key)}`, { name }),
    onSuccess: (...a) => {
      invalidate(['merchants']);
      opts?.onSuccess?.(...a);
    },
  });
}

/**
 * État du nommage, lu tel quel (sans suivi ni invalidation : voir `useMerchantNamingSync`,
 * monté une fois dans la coquille de l'appli, qui s'en charge pour toute la session).
 */
export const useMerchantStatus = () => useQuery({ queryKey: keys.merchantStatus, queryFn: () => api.get<MerchantStatus>('/api/merchants/status') });

/**
 * Suit le nommage par Claude en tâche de fond pour toute la session, même hors des Réglages :
 * interroge toutes les 3 secondes pendant une exécution, puis rafraîchit les opérations et marchands affichés.
 * Partage son cache avec `useMerchantStatus` : une fois montée ici, la page Réglages reçoit les mêmes mises à jour.
 */
export function useMerchantNamingSync(): void {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.merchantStatus,
    queryFn: () => api.get<MerchantStatus>('/api/merchants/status'),
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });
  const running = query.data?.running ?? false;
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) {
      for (const key of [['transactions'], ['transaction'], ['merchants', 'detail']]) void qc.invalidateQueries({ queryKey: key });
    }
    wasRunning.current = running;
  }, [running, qc]);
}

export function useNameMerchants(opts?: MutOpts<MerchantStatus, void>) {
  const qc = useQueryClient();
  return useMutation({
    ...opts,
    mutationFn: () => api.post<MerchantStatus>('/api/merchants/name'),
    onSuccess: (...a) => {
      qc.setQueryData(keys.merchantStatus, a[0]);
      opts?.onSuccess?.(...a);
    },
  });
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
      // Le serveur lance le nommage des marchands et relance la détection des signaux sur les nouvelles opérations.
      if (a[0].reason === 'ok') invalidate(keys.bankSync, keys.imports, ['accounts'], keys.merchantStatus, keys.signals);
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

// Signaux

export const useSignals = () => useQuery({ queryKey: keys.signals, queryFn: () => api.get<AnySignal[]>('/api/signals') });

export function useDismissSignal(opts?: MutOpts<void, number>) {
  const invalidate = useInvalidate();
  return useMutation({
    ...opts,
    mutationFn: (id) => api.post<void>(`/api/signals/${id}/dismiss`),
    onSuccess: (...a) => {
      invalidate(keys.signals);
      opts?.onSuccess?.(...a);
    },
  });
}

// Investir

/**
 * Mutation de l'écran Investir : toute écriture rafraîchit le portefeuille et les idées,
 * même en échec (une synchro Binance ratée enregistre son erreur côté serveur).
 */
function useInvestMutation<TData, TVars>(fn: (vars: TVars) => Promise<TData>, opts?: MutOpts<TData, TVars>, mutationKey?: readonly unknown[]) {
  const qc = useQueryClient();
  return useMutation({
    ...opts,
    mutationKey,
    mutationFn: fn,
    onSettled: (...a) => {
      void qc.invalidateQueries({ queryKey: keys.invest });
      return opts?.onSettled?.(...a);
    },
  });
}

export const usePortfolio = (range: PortfolioRange) =>
  useQuery({ queryKey: keys.portfolio(range), queryFn: () => api.get<PortfolioView>(`/api/invest/portfolio?range=${range}`), placeholderData: (prev) => prev });

export const useAssetSearch = (query: string) =>
  useQuery({
    queryKey: keys.assetSearch(query.trim()),
    queryFn: () => api.get<AssetSearchResult[]>(`/api/invest/search?q=${encodeURIComponent(query.trim())}`),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });

export const useCreateHolding = (opts?: MutOpts<{ id: number }, HoldingInput>) => useInvestMutation((input) => api.post<{ id: number }>('/api/invest/holdings', input), opts);
export const useDeleteHolding = (opts?: MutOpts<void, number>) => useInvestMutation((id) => api.delete(`/api/invest/holdings/${id}`), opts);
export const useAddTrade = (opts?: MutOpts<unknown, { holdingId: number } & TradeInput>) =>
  useInvestMutation(({ holdingId, ...input }) => api.post(`/api/invest/holdings/${holdingId}/trades`, input), opts);
export const useUpdateTrade = (opts?: MutOpts<unknown, { id: number } & TradePatch>) => useInvestMutation(({ id, ...patch }) => api.patch(`/api/invest/trades/${id}`, patch), opts);
export const useDeleteTrade = (opts?: MutOpts<void, number>) => useInvestMutation((id) => api.delete(`/api/invest/trades/${id}`), opts);

export const useSaveBinance = (opts?: MutOpts<BinanceState, BinanceKeys>) => useInvestMutation((keys) => api.put<BinanceState>('/api/invest/binance', keys), opts);
export const useDisconnectBinance = (opts?: MutOpts<void, void>) => useInvestMutation(() => api.delete('/api/invest/binance'), opts);
export const useSyncBinance = (opts?: MutOpts<BinanceSyncResult, number | undefined>) =>
  useInvestMutation((onlyIfStaleMinutes) => api.post<BinanceSyncResult>('/api/invest/binance/sync', onlyIfStaleMinutes ? { onlyIfStaleMinutes } : {}), opts, keys.binanceSync);

export const useIdeas = () => useQuery({ queryKey: keys.ideas, queryFn: () => api.get<IdeasView>('/api/invest/ideas') });
export const useStartIdeaRun = (opts?: MutOpts<IdeaRunStart, 'manual' | 'weekly'>) =>
  useInvestMutation((trigger) => api.post<IdeaRunStart>('/api/invest/ideas/runs', { trigger }), opts);

/** Suit une fournée toutes les 3 secondes tant qu'elle tourne, puis rafraîchit les idées. */
export function useIdeaRun(id: number | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.ideaRun(id ?? 0),
    queryFn: async () => {
      const run = await api.get<IdeaRunView>(`/api/invest/ideas/runs/${id}`);
      if (run.status !== 'running') void qc.invalidateQueries({ queryKey: keys.ideas });
      return run;
    },
    enabled: id !== null,
    refetchInterval: (q) => (q.state.status === 'error' ? false : q.state.data?.status === 'running' || !q.state.data ? 3000 : false),
  });
}
