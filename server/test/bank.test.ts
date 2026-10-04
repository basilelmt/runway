import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EnableBankingClient } from '../src/bank/enable-banking';
import { signJwt } from '../src/bank/jwt';
import { parseAmountToCents, toSourceRow } from '../src/bank/mapping';
import { BankProviderError } from '../src/bank/provider';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

describe('signJwt', () => {
  it('produit un RS256 avec kid, iss, aud et une heure de validité', () => {
    const jwt = signJwt('app-123', pem, 1_700_000_000);
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app-123' });
    expect(JSON.parse(Buffer.from(p!, 'base64url').toString())).toEqual({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: 1_700_000_000, exp: 1_700_003_600 });
    expect(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s!, 'base64url'))).toBe(true);
  });

  it('rejette une clé privée illisible avec un message en français', () => {
    const fake = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANfake\n-----END PRIVATE KEY-----';
    expect(() => signJwt('app-123', fake)).toThrow(BankProviderError);
    expect(() => signJwt('app-123', fake)).toThrow(/Clé privée Enable Banking illisible/);
  });
});

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Record<string, Array<{ status?: number; body: unknown }>>) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const path = url.replace('https://api.enablebanking.com', '');
    const queue = responses[path] ?? responses[path.split('?')[0]!];
    const next = queue?.shift();
    if (!next) return new Response(JSON.stringify({ message: `Pas de réponse prévue pour ${path}` }), { status: 500 });
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchFn, calls };
}

function client(fetchFn: typeof fetch) {
  return new EnableBankingClient({ appId: 'app-123', privateKey: pem, psu: { ip: '127.0.0.1', userAgent: 'Runway test' }, fetch: fetchFn });
}

describe('EnableBankingClient', () => {
  it('envoie le JWT et les en-têtes PSU', async () => {
    const { fetchFn, calls } = fakeFetch({ '/application': [{ body: { name: 'Runway', environment: 'PRODUCTION' } }] });
    const app = await client(fetchFn).getApplication();
    expect(app).toEqual({ name: 'Runway', environment: 'PRODUCTION' });
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get('authorization')).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(headers.get('psu-ip-address')).toBe('127.0.0.1');
    expect(headers.get('psu-user-agent')).toBe('Runway test');
  });

  it('lit la durée maximale de consentement de la banque', async () => {
    const { fetchFn } = fakeFetch({
      '/aspsps': [{ body: { aspsps: [{ name: 'Autre', country: 'FR', maximum_consent_validity: 1 }, { name: 'La Banque Postale', country: 'FR', maximum_consent_validity: 15552000 }] } }],
    });
    expect(await client(fetchFn).getMaxConsentSeconds({ name: 'La Banque Postale', country: 'FR' })).toBe(15552000);
  });

  it('démarre une autorisation et crée une session', async () => {
    const { fetchFn, calls } = fakeFetch({
      '/auth': [{ body: { url: 'https://auth.enablebanking.com/x', authorization_id: 'a1' } }],
      '/sessions': [
        {
          body: {
            session_id: 's1',
            access: { valid_until: '2027-04-01T00:00:00Z' },
            accounts: [
              { uid: 'u1', account_id: { iban: 'FR7620041010121234567K03022' }, name: 'CCP', product: 'Compte Courant Postal', currency: 'EUR' },
              { uid: 'u2', account_id: {}, product: 'Livret A' },
            ],
          },
        },
      ],
    });
    const c = client(fetchFn);
    const auth = await c.startAuth({ aspsp: { name: 'La Banque Postale', country: 'FR' }, validUntil: '2027-04-01T00:00:00Z', redirectUrl: 'https://localhost:3000/cb', state: 'st' });
    expect(auth.url).toBe('https://auth.enablebanking.com/x');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      access: { valid_until: '2027-04-01T00:00:00Z' },
      aspsp: { name: 'La Banque Postale', country: 'FR' },
      state: 'st',
      redirect_url: 'https://localhost:3000/cb',
      psu_type: 'personal',
    });
    const session = await c.createSession('code-1');
    expect(session).toEqual({
      sessionId: 's1',
      validUntil: '2027-04-01T00:00:00Z',
      accounts: [
        { uid: 'u1', iban: 'FR7620041010121234567K03022', name: 'CCP' },
        { uid: 'u2', iban: null, name: 'Livret A' },
      ],
    });
  });

  it('pagine les opérations et ne garde que les comptabilisées', async () => {
    const tx = (ref: string, status = 'BOOK') => ({
      entry_reference: ref,
      booking_date: '2026-10-01',
      transaction_amount: { amount: '10.00', currency: 'EUR' },
      credit_debit_indicator: 'DBIT',
      status,
      remittance_information: ['CARTE X1234 CARREFOUR'],
    });
    const { fetchFn, calls } = fakeFetch({
      '/accounts/u1/transactions': [
        { body: { transactions: [tx('1'), tx('2', 'PDNG')], continuation_key: 'next' } },
        { body: { transactions: [tx('3')] } },
      ],
    });
    const rows = await client(fetchFn).listTransactions('u1', '2026-09-01', '2026-10-04');
    expect(rows.map((r) => r.entry_reference)).toEqual(['1', '3']);
    expect(calls[0]!.url).toContain('date_from=2026-09-01');
    expect(calls[0]!.url).toContain('date_to=2026-10-04');
    expect(calls[0]!.url).toContain('transaction_status=BOOK');
    expect(calls[1]!.url).toContain('continuation_key=next');
  });

  it('convertit les erreurs HTTP en BankProviderError', async () => {
    const { fetchFn } = fakeFetch({ '/sessions/s1': [{ status: 401, body: { message: 'Invalid JWT', code: 'unauthorized' } }] });
    await expect(client(fetchFn).getSession('s1')).rejects.toMatchObject({ name: 'BankProviderError', status: 401, code: 'unauthorized', message: 'Invalid JWT' });
    expect(new BankProviderError('x', 500)).toBeInstanceOf(Error);
  });
});

describe('parseAmountToCents', () => {
  it('lit les montants décimaux sans flottant', () => {
    expect(parseAmountToCents('1.23')).toBe(123);
    expect(parseAmountToCents('0.1')).toBe(10);
    expect(parseAmountToCents('2000')).toBe(2000_00);
    expect(parseAmountToCents('-12,50')).toBe(-12_50);
    expect(() => parseAmountToCents('abc')).toThrow();
  });
});

describe('toSourceRow', () => {
  const base = {
    booking_date: '2026-10-02',
    value_date: '2026-10-03',
    transaction_amount: { amount: '42.10', currency: 'EUR' },
    credit_debit_indicator: 'DBIT' as const,
    status: 'BOOK',
  };

  it('débit : montant négatif, libellé depuis la référence, note avec les détails', () => {
    const r = toSourceRow({ ...base, remittance_information: ['CARTE X1234 02/10', 'CARREFOUR PARIS'], creditor: { name: 'CARREFOUR' }, entry_reference: 'ABC1' });
    expect(r).toEqual({
      ok: true,
      row: { date: '2026-10-02', label: 'CARTE X1234 02/10 CARREFOUR PARIS', signedAmount: -42_10, note: 'CARTE X1234 02/10 CARREFOUR PARIS · CARREFOUR · Réf. ABC1 · Valeur 2026-10-03' },
    });
  });

  it('crédit sans référence : libellé depuis le débiteur, note nulle', () => {
    const r = toSourceRow({ ...base, credit_debit_indicator: 'CRDT', value_date: '2026-10-02', debtor: { name: 'EMPLOYEUR SA' } });
    expect(r).toEqual({ ok: true, row: { date: '2026-10-02', label: 'EMPLOYEUR SA', signedAmount: 42_10, note: null } });
  });

  it('replis : description du code, puis « Opération » ; date de valeur si pas de date comptable', () => {
    expect(toSourceRow({ ...base, booking_date: null, bank_transaction_code: { description: 'Frais bancaires' } })).toMatchObject({ ok: true, row: { date: '2026-10-03', label: 'Frais bancaires' } });
    expect(toSourceRow({ ...base, remittance_information: [] })).toMatchObject({ ok: true, row: { label: 'Opération' } });
  });

  it('rejette une opération sans date ou à montant nul', () => {
    expect(toSourceRow({ ...base, booking_date: null, value_date: null })).toEqual({ ok: false, reason: 'date absente' });
    expect(toSourceRow({ ...base, transaction_amount: { amount: '0.00' } })).toEqual({ ok: false, reason: 'montant nul' });
    expect(toSourceRow({ ...base, transaction_amount: { amount: 'n/a' } })).toEqual({ ok: false, reason: 'montant illisible' });
  });
});
