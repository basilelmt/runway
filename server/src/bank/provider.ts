import { z } from 'zod';

/** Sous-ensemble utile d'une opération Enable Banking (format ISO 20022 simplifié). */
export const bankTransactionSchema = z.object({
  entry_reference: z.string().nullish(),
  booking_date: z.string().nullish(),
  value_date: z.string().nullish(),
  transaction_date: z.string().nullish(),
  transaction_amount: z.object({ amount: z.string(), currency: z.string().nullish() }),
  credit_debit_indicator: z.enum(['CRDT', 'DBIT']),
  status: z.string().nullish(),
  remittance_information: z.array(z.string()).nullish(),
  creditor: z.object({ name: z.string().nullish() }).nullish(),
  debtor: z.object({ name: z.string().nullish() }).nullish(),
  bank_transaction_code: z.object({ description: z.string().nullish(), code: z.string().nullish() }).nullish(),
});
export type BankTransaction = z.infer<typeof bankTransactionSchema>;

export type Aspsp = { name: string; country: string };
export type BankAccountInfo = { uid: string; iban: string | null; name: string };
export type SessionInfo = { sessionId: string; validUntil: string | null; accounts: BankAccountInfo[] };

export class BankProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'BankProviderError';
  }
}

/** Ce que Runway attend d'un agrégateur bancaire. Une implémentation réelle, une fausse en test. */
export interface BankProvider {
  /** Vérifie les identifiants et renvoie le nom de l'application. */
  getApplication(): Promise<{ name: string; environment: string }>;
  /** Durée maximale de consentement acceptée par la banque, en secondes, null si inconnue. */
  getMaxConsentSeconds(aspsp: Aspsp): Promise<number | null>;
  startAuth(input: { aspsp: Aspsp; validUntil: string; redirectUrl: string; state: string }): Promise<{ url: string }>;
  createSession(code: string): Promise<SessionInfo>;
  getSession(sessionId: string): Promise<{ status: string; validUntil: string | null }>;
  /** Opérations comptabilisées entre deux dates incluses, toutes pages confondues. */
  listTransactions(uid: string, dateFrom: string, dateTo: string): Promise<BankTransaction[]>;
  deleteSession(sessionId: string): Promise<void>;
}
