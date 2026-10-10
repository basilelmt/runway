import { z } from 'zod';
import { signJwt } from './jwt';
import { bankTransactionSchema, BankProviderError, type Aspsp, type BankProvider, type BankTransaction, type SessionInfo } from './provider';

export type PsuInfo = { ip: string; userAgent: string };

export type EnableBankingOptions = {
  appId: string;
  privateKey: string;
  /**
   * Utilisateur présent (action depuis l'interface) : les en-têtes `Psu-*` disent à Enable Banking que la
   * personne est en ligne, ce qui ne consomme pas le quota DSP2 des accès sans présence (4 par jour). Null pour
   * la synchro de fond : la personne n'est pas là, et le prétendre serait faux.
   */
  psu: PsuInfo | null;
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Délai maximal d'une requête, en millisecondes. */
  timeoutMs?: number;
};

const DEFAULT_BASE_URL = 'https://api.enablebanking.com';
const DEFAULT_TIMEOUT_MS = 30_000;
/** Garde-fou contre une pagination qui ne s'arrête pas. */
const MAX_TRANSACTION_PAGES = 50;

/** Cause lisible d'un échec réseau : `fetch failed` cache souvent la vraie raison (DNS, connexion refusée). */
function networkCause(err: unknown, timeoutMs: number): string {
  if (err instanceof Error && err.name === 'TimeoutError') return `pas de réponse après ${Math.round(timeoutMs / 1000)} s`;
  if (err instanceof Error) return err.cause instanceof Error ? `${err.message} (${err.cause.message})` : err.message;
  return String(err);
}

const aspspsSchema = z.object({ aspsps: z.array(z.object({ name: z.string(), country: z.string(), maximum_consent_validity: z.number().nullish() })) });
const authSchema = z.object({ url: z.string() });
const sessionSchema = z.object({
  session_id: z.string(),
  access: z.object({ valid_until: z.string().nullish() }).nullish(),
  accounts: z.array(
    z.object({
      uid: z.string(),
      account_id: z.object({ iban: z.string().nullish() }).nullish(),
      name: z.string().nullish(),
      product: z.string().nullish(),
    }),
  ),
});
const sessionStatusSchema = z.object({ status: z.string(), access: z.object({ valid_until: z.string().nullish() }).nullish() });
const transactionsSchema = z.object({ transactions: z.array(bankTransactionSchema), continuation_key: z.string().nullish() });
const applicationSchema = z.object({ name: z.string(), environment: z.string() });

export class EnableBankingClient implements BankProvider {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly opts: EnableBankingOptions) {
    this.fetchFn = opts.fetch ?? globalThis.fetch;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async request<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const authorization = `Bearer ${signJwt(this.opts.appId, this.opts.privateKey)}`;
    let res: Response;
    let text: string;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization,
          accept: 'application/json',
          'content-type': 'application/json',
          ...(this.opts.psu ? { 'psu-ip-address': this.opts.psu.ip, 'psu-user-agent': this.opts.psu.userAgent } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      text = await res.text();
    } catch (err) {
      throw new BankProviderError(`Enable Banking injoignable : ${networkCause(err, this.timeoutMs)}`, 0);
    }
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new BankProviderError(`Réponse illisible d'Enable Banking (${res.status})`, res.status);
    }
    if (!res.ok) {
      const err = (data ?? {}) as { message?: unknown; error?: unknown; code?: unknown };
      // Le message distant est en anglais et sans contexte : on le préfixe pour qu'il reste compréhensible dans un toast.
      const remote = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : null;
      const message = remote ? `Enable Banking a refusé la demande : ${remote}` : `Enable Banking a répondu ${res.status}`;
      // Le format d'erreur d'Enable Banking porte un code HTTP numérique dans `code` et l'identifiant dans `error`.
      const code = typeof err.code === 'string' ? err.code : typeof err.error === 'string' ? err.error : null;
      throw new BankProviderError(message, res.status, code);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path.join('.');
      throw new BankProviderError(`Réponse inattendue d'Enable Banking sur ${path}${field ? ` (${field})` : ''}`, res.status);
    }
    return parsed.data;
  }

  async getApplication(): Promise<{ name: string; environment: string }> {
    return this.request('GET', '/application', applicationSchema);
  }

  async getMaxConsentSeconds(aspsp: Aspsp): Promise<number | null> {
    const { aspsps } = await this.request('GET', `/aspsps?country=${encodeURIComponent(aspsp.country)}`, aspspsSchema);
    return aspsps.find((a) => a.name === aspsp.name)?.maximum_consent_validity ?? null;
  }

  async startAuth(input: { aspsp: Aspsp; validUntil: string; redirectUrl: string; state: string }): Promise<{ url: string }> {
    const { url } = await this.request('POST', '/auth', authSchema, {
      access: { valid_until: input.validUntil },
      aspsp: input.aspsp,
      state: input.state,
      redirect_url: input.redirectUrl,
      psu_type: 'personal',
    });
    return { url };
  }

  async createSession(code: string): Promise<SessionInfo> {
    const s = await this.request('POST', '/sessions', sessionSchema, { code });
    return {
      sessionId: s.session_id,
      validUntil: s.access?.valid_until ?? null,
      accounts: s.accounts.map((a) => ({ uid: a.uid, iban: a.account_id?.iban ?? null, name: a.name?.trim() || a.product?.trim() || 'Compte' })),
    };
  }

  async getSession(sessionId: string): Promise<{ status: string; validUntil: string | null }> {
    const s = await this.request('GET', `/sessions/${encodeURIComponent(sessionId)}`, sessionStatusSchema);
    return { status: s.status, validUntil: s.access?.valid_until ?? null };
  }

  async listTransactions(uid: string, dateFrom: string, dateTo: string): Promise<BankTransaction[]> {
    const all: BankTransaction[] = [];
    const seen = new Set<string>();
    let continuation: string | null | undefined;
    for (let pages = 1; ; pages++) {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, transaction_status: 'BOOK' });
      if (continuation) params.set('continuation_key', continuation);
      const page = await this.request('GET', `/accounts/${encodeURIComponent(uid)}/transactions?${params}`, transactionsSchema);
      for (const tx of page.transactions) if (!tx.status || tx.status === 'BOOK') all.push(tx);
      continuation = page.continuation_key;
      if (!continuation) return all;
      if (seen.has(continuation)) throw new BankProviderError('Enable Banking renvoie deux fois la même page (pagination en boucle)', 0);
      if (pages >= MAX_TRANSACTION_PAGES) throw new BankProviderError(`Enable Banking renvoie plus de ${MAX_TRANSACTION_PAGES} pages d'opérations (pagination interrompue)`, 0);
      seen.add(continuation);
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request('DELETE', `/sessions/${encodeURIComponent(sessionId)}`, z.unknown());
  }
}
