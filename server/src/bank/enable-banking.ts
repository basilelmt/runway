import { z } from 'zod';
import { signJwt } from './jwt';
import { bankTransactionSchema, BankProviderError, type Aspsp, type BankProvider, type BankTransaction, type SessionInfo } from './provider';

export type PsuInfo = { ip: string; userAgent: string };

export type EnableBankingOptions = {
  appId: string;
  privateKey: string;
  /** Utilisateur présent : ces en-têtes évitent de consommer le quota DSP2 des accès sans présence. */
  psu: PsuInfo;
  fetch?: typeof fetch;
  baseUrl?: string;
};

const DEFAULT_BASE_URL = 'https://api.enablebanking.com';

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

  constructor(private readonly opts: EnableBankingOptions) {
    this.fetchFn = opts.fetch ?? globalThis.fetch;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  }

  private async request<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${signJwt(this.opts.appId, this.opts.privateKey)}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'psu-ip-address': this.opts.psu.ip,
        'psu-user-agent': this.opts.psu.userAgent,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new BankProviderError(`Réponse illisible d'Enable Banking (${res.status})`, res.status);
    }
    if (!res.ok) {
      const err = (data ?? {}) as { message?: unknown; error?: unknown; code?: unknown };
      const message = typeof err.message === 'string' ? err.message : typeof err.error === 'string' ? err.error : `Enable Banking a répondu ${res.status}`;
      throw new BankProviderError(message, res.status, typeof err.code === 'string' ? err.code : null);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new BankProviderError(`Réponse inattendue d'Enable Banking sur ${path}`, res.status);
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
    let continuation: string | null | undefined;
    do {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, transaction_status: 'BOOK' });
      if (continuation) params.set('continuation_key', continuation);
      const page = await this.request('GET', `/accounts/${encodeURIComponent(uid)}/transactions?${params}`, transactionsSchema);
      for (const tx of page.transactions) if (!tx.status || tx.status === 'BOOK') all.push(tx);
      continuation = page.continuation_key;
    } while (continuation);
    return all;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request('DELETE', `/sessions/${encodeURIComponent(sessionId)}`, z.unknown());
  }
}
