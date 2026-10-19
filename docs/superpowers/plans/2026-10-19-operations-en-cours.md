# Opérations en cours - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** afficher en haut d'Opérations › Toutes les opérations que La Banque Postale n'a pas encore comptabilisées, sans qu'elles entrent dans aucun calcul.

**Architecture:** la synchro fait un seul appel Enable Banking par compte, sans filtre de statut, et trie `BOOK` / `PDNG`.
Les `PDNG` remplacent entièrement, par compte, le contenu d'une table `pending_transactions` isolée du reste.
Une route `GET /api/transactions/pending` les expose, un bloc « En cours » les affiche.

**Tech Stack:** Hono, Drizzle (SQLite, better-sqlite3), Zod, React 19, TanStack Query, Vitest, Testing Library, CSS modules.

Spec : `docs/superpowers/specs/2026-10-19-operations-en-cours-design.md`.

## Global Constraints

- Les opérations en cours n'entrent dans aucun calcul : soldes, budget, enveloppes, prévisions, Demander, export. Elles ne vont jamais dans `transactions`.
- Un seul appel Enable Banking par compte et par synchro (quota DSP2 : 4 accès par jour sans l'utilisateur présent). Vérifié le 2026-10-19 : un appel sans filtre renvoie `BOOK` et `PDNG` chez La Banque Postale.
- Une opération sans `status` compte comme comptabilisée.
- Une opération en cours illisible est ignorée sans compter dans `skipped`.
- Textes visibles en français, avec les accents. Jamais de tiret cadratin, seulement « - ».
- Commentaires de code en français, dans le style du fichier modifié.
- Avant chaque commit : `npm run lint`, `npm run typecheck`, `npm test` au vert.
- Ne jamais toucher à `data/runway.db` (vraie base) : la recette se fait sur une copie.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `server/src/bank/provider.ts` | `listTransactions` renvoie `{ booked, pending }` |
| `server/src/bank/enable-banking.ts` | appel sans filtre, tri par statut |
| `server/src/db/schema.ts` | table `pending_transactions` |
| `server/src/db/migrations/0016_pending_transactions.sql` | générée par drizzle-kit |
| `server/src/repos/pending-transactions.ts` (nouveau) | remplacement par compte, lecture filtrée |
| `server/src/services/bank-sync.ts` | écrit les opérations en cours d'un compte lu avec succès |
| `shared/api-types.ts` | `PendingTransaction`, `PendingTransactions` |
| `server/src/routes/transactions.ts` | `GET /pending` |
| `client/src/api/hooks.ts` | `usePendingTransactions` |
| `client/src/components/transactions/PendingList.tsx` (+ `.module.css`, `.test.tsx`) | bloc « En cours », règle de visibilité |
| `client/src/pages/Operations.tsx` | branche le bloc |

---

### Task 1: le fournisseur bancaire renvoie aussi les opérations en cours

**Files:**
- Modify: `server/src/bank/provider.ts`
- Modify: `server/src/bank/enable-banking.ts:147-163`
- Modify: `server/src/services/bank-sync.ts` (boucle de lecture dans `syncConnection`)
- Test: `server/test/bank.test.ts:111-132`, `server/test/bank-sync.test.ts` (faux fournisseur), `server/test/bank-scheduler.test.ts:40-43` (faux fournisseur)

**Interfaces:**
- Produces: `export type BankTransactions = { booked: BankTransaction[]; pending: BankTransaction[] }` dans `provider.ts` ; `BankProvider.listTransactions(uid, dateFrom, dateTo): Promise<BankTransactions>`.

- [ ] **Step 1: Réécrire le test Enable Banking**

Dans `server/test/bank.test.ts`, remplacer le test « pagine les opérations et ne garde que les comptabilisées » par :

```ts
  it('pagine les opérations en un seul appel par page et les trie par statut', async () => {
    const tx = (ref: string, status: string | null = 'BOOK') => ({
      entry_reference: ref,
      booking_date: '2026-10-01',
      transaction_amount: { amount: '10.00', currency: 'EUR' },
      credit_debit_indicator: 'DBIT',
      status,
      remittance_information: ['CARTE X1234 CARREFOUR'],
    });
    const { fetchFn, calls } = fakeFetch({
      '/accounts/u1/transactions': [
        { body: { transactions: [tx('1'), tx('2', 'PDNG'), tx('4', null)], continuation_key: 'next' } },
        { body: { transactions: [tx('3'), tx('5', 'INFO')] } },
      ],
    });
    const { booked, pending } = await client(fetchFn).listTransactions('u1', '2026-09-01', '2026-10-04');
    expect(booked.map((r) => r.entry_reference)).toEqual(['1', '4', '3']);
    expect(pending.map((r) => r.entry_reference)).toEqual(['2']);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toContain('date_from=2026-09-01');
    expect(calls[0]!.url).toContain('date_to=2026-10-04');
    expect(calls[0]!.url).not.toContain('transaction_status');
    expect(calls[1]!.url).toContain('continuation_key=next');
  });
```

- [ ] **Step 2: Lancer le test, il échoue**

Run: `npx vitest run server/test/bank.test.ts -t "trie par statut"`
Expected: FAIL (`booked` indéfini, l'URL contient `transaction_status=BOOK`).

- [ ] **Step 3: Changer l'interface et le client**

Dans `server/src/bank/provider.ts`, après `export type BankTransaction = ...` :

```ts
/** Opérations d'un compte triées par statut : comptabilisées (`BOOK`, ou sans statut) et en cours (`PDNG`). */
export type BankTransactions = { booked: BankTransaction[]; pending: BankTransaction[] };
```

et remplacer la signature dans `BankProvider` :

```ts
  /**
   * Opérations entre deux dates incluses, toutes pages confondues, en un seul appel par page : demander
   * les comptabilisées et les en cours séparément doublerait les accès DSP2.
   */
  listTransactions(uid: string, dateFrom: string, dateTo: string): Promise<BankTransactions>;
```

Dans `server/src/bank/enable-banking.ts`, importer `type BankTransactions` depuis `./provider` et remplacer `listTransactions` :

```ts
  async listTransactions(uid: string, dateFrom: string, dateTo: string): Promise<BankTransactions> {
    const booked: BankTransaction[] = [];
    const pending: BankTransaction[] = [];
    const seen = new Set<string>();
    let continuation: string | null | undefined;
    for (let pages = 1; ; pages++) {
      // Sans filtre de statut : comptabilisées et en cours arrivent dans le même appel.
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (continuation) params.set('continuation_key', continuation);
      const page = await this.request('GET', `/accounts/${encodeURIComponent(uid)}/transactions?${params}`, transactionsSchema);
      for (const tx of page.transactions) {
        if (!tx.status || tx.status === 'BOOK') booked.push(tx);
        else if (tx.status === 'PDNG') pending.push(tx);
      }
      continuation = page.continuation_key;
      if (!continuation) return { booked, pending };
      if (seen.has(continuation)) throw new BankProviderError('Enable Banking renvoie deux fois la même page (pagination en boucle)', 0);
      if (pages >= MAX_TRANSACTION_PAGES) throw new BankProviderError(`Enable Banking renvoie plus de ${MAX_TRANSACTION_PAGES} pages d'opérations (pagination interrompue)`, 0);
      seen.add(continuation);
    }
  }
```

Dans `server/src/services/bank-sync.ts`, boucle de lecture de `syncConnection`, remplacer `for (const tx of await provider.listTransactions(bank.uid, from, today))` par :

```ts
        const { booked } = await provider.listTransactions(bank.uid, from, today);
        for (const tx of booked) {
```

(le reste du corps de boucle ne change pas ; `pending` est branché à la tâche 2).

- [ ] **Step 4: Adapter les faux fournisseurs**

`server/test/bank-sync.test.ts`, méthode `listTransactions` de `FakeProvider` :

```ts
  async listTransactions(uid: string, dateFrom: string, dateTo: string) {
    this.log('listTransactions', uid, dateFrom, dateTo);
    if (this.gate) await this.gate.promise;
    if (this.failListWith) throw this.failListWith;
    if (this.failListFor[uid]) throw this.failListFor[uid];
    const inRange = (this.transactions[uid] ?? []).filter((t) => t.booking_date! >= dateFrom && t.booking_date! <= dateTo);
    return { booked: inRange.filter((t) => t.status !== 'PDNG'), pending: inRange.filter((t) => t.status === 'PDNG') };
  }
```

`server/test/bank-scheduler.test.ts:40-43` :

```ts
  async listTransactions() {
    this.calls.push('listTransactions');
    return { booked: [], pending: [] };
  }
```

- [ ] **Step 5: Tout le serveur passe**

Run: `npx vitest run server/test && npm run typecheck`
Expected: PASS, aucune erreur de type.

- [ ] **Step 6: Commit**

```bash
git add server/src/bank/provider.ts server/src/bank/enable-banking.ts server/src/services/bank-sync.ts server/test/bank.test.ts server/test/bank-sync.test.ts server/test/bank-scheduler.test.ts
git commit -m "feat(server): la synchro lit comptabilisées et en cours en un seul appel par compte"
```

---

### Task 2: stocker les opérations en cours à chaque synchro

**Files:**
- Modify: `server/src/db/schema.ts` (après `bankAccounts`)
- Create: `server/src/db/migrations/0016_pending_transactions.sql` (généré)
- Create: `server/src/repos/pending-transactions.ts`
- Modify: `server/src/services/bank-sync.ts` (boucle de lecture dans `syncConnection`)
- Test: `server/test/bank-sync.test.ts` (nouveau `describe('opérations en cours')`)

**Interfaces:**
- Consumes: `BankTransactions` (tâche 1), `toSourceRow` (`server/src/bank/mapping.ts`).
- Produces, dans `server/src/repos/pending-transactions.ts` :
  - `export type PendingRow = { date: ISODate; label: string; signedAmount: number }`
  - `export function replacePendingTransactions(db: Db, accountId: number, rows: PendingRow[], fetchedAt: string): void`
  - `export function listVisiblePendingTransactions(db: Db): { accountId: number; date: ISODate; label: string; signedAmount: number; fetchedAt: string }[]` : comptes non archivés liés (`sync_from` non nul) à une connexion `active`, tri date décroissante puis id croissant.

- [ ] **Step 1: Écrire les tests**

Dans `server/test/bank-sync.test.ts`, ajouter l'import `import { listVisiblePendingTransactions } from '../src/repos/pending-transactions';`, une fabrique sous `tx` :

```ts
function pdng(date: string, amount: string, label: string): BankTransaction {
  return { booking_date: date, transaction_amount: { amount, currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'PDNG', remittance_information: [label] };
}
```

puis à la fin du fichier :

```ts
describe('opérations en cours', () => {
  const NOW_ISO = NOW.toISOString();

  it('les garde à part, jamais dans les opérations', async () => {
    await connect();
    provider.transactions['u-courant'] = [tx('2026-10-02', '12.00', 'DBIT', 'CARREFOUR'), pdng('2026-10-03', '4.50', 'CARTE X1234 BOULANGERIE')];
    const result = await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    expect(result.connections[0]).toMatchObject({ created: 1, skipped: 0 });
    expect(listVisiblePendingTransactions(ctx.db)).toEqual([
      { accountId: ctx.courant.id, date: '2026-10-03', label: 'CARTE X1234 BOULANGERIE', signedAmount: -450, fetchedAt: NOW_ISO },
    ]);
    const labels = ctx.db.all<{ label: string }>(sql`select label from transactions`).map((r) => r.label);
    expect(labels).not.toContain('CARTE X1234 BOULANGERIE');
  });

  it('remplace la liste du compte à chaque synchro : une opération comptabilisée en sort', async () => {
    await connect();
    provider.transactions['u-courant'] = [pdng('2026-10-03', '4.50', 'BOULANGERIE'), pdng('2026-10-03', '30.00', 'ESSENCE')];
    await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    provider.transactions['u-courant'] = [tx('2026-10-04', '4.50', 'DBIT', 'BOULANGERIE'), pdng('2026-10-03', '30.00', 'ESSENCE')];
    await runSync(ctx.db, provider, { today: TODAY, now: new Date('2026-10-04T16:00:00Z') });
    expect(listVisiblePendingTransactions(ctx.db).map((p) => p.label)).toEqual(['ESSENCE']);
  });

  it('garde la dernière liste connue quand la lecture du compte échoue', async () => {
    await connect();
    provider.transactions['u-courant'] = [pdng('2026-10-03', '4.50', 'BOULANGERIE')];
    await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    provider.failListFor['u-courant'] = new Error('Banque indisponible');
    await runSync(ctx.db, provider, { today: TODAY, now: new Date('2026-10-04T16:00:00Z') });
    expect(listVisiblePendingTransactions(ctx.db)).toEqual([expect.objectContaining({ label: 'BOULANGERIE', fetchedAt: NOW_ISO })]);
  });

  it('ignore une opération en cours illisible sans la compter', async () => {
    await connect();
    provider.transactions['u-courant'] = [{ ...pdng('2026-10-03', '0.00', 'NUL') }];
    const result = await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    expect(result.connections[0]!.skipped).toBe(0);
    expect(listVisiblePendingTransactions(ctx.db)).toEqual([]);
  });

  it('masque les comptes archivés, déliés ou dont la connexion n’est plus active', async () => {
    const view = await connect();
    provider.transactions['u-courant'] = [pdng('2026-10-03', '4.50', 'BOULANGERIE')];
    provider.transactions['u-livret'] = [pdng('2026-10-02', '1.00', 'FRAIS')];
    await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    expect(listVisiblePendingTransactions(ctx.db).map((p) => p.label)).toEqual(['BOULANGERIE', 'FRAIS']);

    ctx.db.run(sql`update accounts set archived = 1 where id = ${ctx.livret.id}`);
    expect(listVisiblePendingTransactions(ctx.db).map((p) => p.label)).toEqual(['BOULANGERIE']);

    const courant = view.accounts.find((a) => a.uid === 'u-courant')!;
    linkAccounts(ctx.db, { connectionId: view.id, today: TODAY, links: [{ bankAccountId: courant.id, accountId: null }] });
    expect(listVisiblePendingTransactions(ctx.db)).toEqual([]);

    ctx.db.run(sql`update accounts set archived = 0 where id = ${ctx.livret.id}`);
    updateConnection(ctx.db, view.id, { status: 'expired' });
    expect(listVisiblePendingTransactions(ctx.db)).toEqual([]);
  });
});
```

Ajouter `import { sql } from 'drizzle-orm';` en tête si absent.

- [ ] **Step 2: Lancer les tests, ils échouent**

Run: `npx vitest run server/test/bank-sync.test.ts -t "opérations en cours"`
Expected: FAIL (module `pending-transactions` introuvable).

- [ ] **Step 3: Ajouter la table**

Dans `server/src/db/schema.ts`, après la table `bankAccounts` :

```ts
/**
 * Opérations que la banque n'a pas encore comptabilisées, telles que lues à la dernière synchro réussie
 * de chaque compte. Affichage seul : rien ne les lit pour un solde, un budget ou une prévision. Sans
 * référence stable côté banque, la liste d'un compte est remplacée en entier à chaque lecture.
 */
export const pendingTransactions = sqliteTable(
  'pending_transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    label: text('label').notNull(),
    signedAmount: integer('signed_amount').notNull(),
    /** Horodatage de la synchro qui l'a lue. */
    fetchedAt: text('fetched_at').notNull(),
  },
  (t) => [index('pending_transactions_account_idx').on(t.accountId)],
);
```

- [ ] **Step 4: Générer la migration**

Run: `npm run db:generate -- --name pending_transactions`
Expected: `server/src/db/migrations/0016_pending_transactions.sql` avec `CREATE TABLE \`pending_transactions\`` et l'index, et une entrée `idx: 16` dans `meta/_journal.json`.
Vérifier que le `when` de la nouvelle entrée est plus grand que celui de `0015_sync_last_success` (sinon Drizzle saute la migration).

- [ ] **Step 5: Écrire le repo**

`server/src/repos/pending-transactions.ts` :

```ts
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { accounts, bankAccounts, bankConnections, pendingTransactions } from '../db/schema';

export type PendingRow = { date: ISODate; label: string; signedAmount: number };

/** Remplace en entier les opérations en cours d'un compte par celles qui viennent d'être lues. */
export function replacePendingTransactions(db: Db, accountId: number, rows: PendingRow[], fetchedAt: string): void {
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    t.delete(pendingTransactions).where(eq(pendingTransactions.accountId, accountId)).run();
    if (rows.length > 0) t.insert(pendingTransactions).values(rows.map((r) => ({ accountId, ...r, fetchedAt }))).run();
  });
}

/**
 * Opérations en cours à afficher : seulement pour les comptes non archivés encore liés à une connexion
 * active. Une connexion expirée ou un compte délié ne sont plus synchronisés, leur liste n'est plus fiable.
 */
export function listVisiblePendingTransactions(db: Db): { accountId: number; date: ISODate; label: string; signedAmount: number; fetchedAt: string }[] {
  const synced = db
    .select({ id: bankAccounts.accountId })
    .from(bankAccounts)
    .innerJoin(bankConnections, eq(bankConnections.id, bankAccounts.connectionId))
    .where(and(eq(bankConnections.status, 'active'), isNotNull(bankAccounts.syncFrom), isNotNull(bankAccounts.accountId)));
  return db
    .select({ accountId: pendingTransactions.accountId, date: pendingTransactions.date, label: pendingTransactions.label, signedAmount: pendingTransactions.signedAmount, fetchedAt: pendingTransactions.fetchedAt })
    .from(pendingTransactions)
    .innerJoin(accounts, eq(accounts.id, pendingTransactions.accountId))
    .where(and(eq(accounts.archived, false), inArray(pendingTransactions.accountId, synced)))
    .orderBy(desc(pendingTransactions.date), asc(pendingTransactions.id))
    .all();
}
```

Si TypeScript refuse `inArray` avec une sous-requête dont la colonne est nullable, garder `isNotNull(bankAccounts.accountId)` et caster la sous-requête plutôt que de changer la logique.

- [ ] **Step 6: Écrire depuis la synchro**

Dans `server/src/services/bank-sync.ts`, importer `replacePendingTransactions, type PendingRow` depuis `../repos/pending-transactions`, puis remplacer le `try` de la boucle de lecture par :

```ts
      try {
        const { booked, pending } = await provider.listTransactions(bank.uid, from, today);
        const rows: SourceRow[] = [];
        for (const tx of booked) {
          const mapped = toSourceRow(tx);
          if (mapped.ok) rows.push(mapped.row);
          else result.skipped++;
        }
        // Opérations en cours : à part, jamais dans les opérations. Une illisible est simplement ignorée.
        const pendingRows: PendingRow[] = [];
        for (const tx of pending) {
          const mapped = toSourceRow(tx);
          if (mapped.ok) pendingRows.push({ date: mapped.row.date, label: mapped.row.label, signedAmount: mapped.row.signedAmount });
        }
        replacePendingTransactions(db, bank.accountId!, pendingRows, now.toISOString());
        fetched.push({ bank, rows });
      } catch (err) {
        fail(bank, err);
      }
```

- [ ] **Step 7: Lancer les tests**

Run: `npx vitest run server/test && npm run typecheck`
Expected: PASS (dont `migrations.test.ts`).

- [ ] **Step 8: Commit**

```bash
git add server/src/db/schema.ts server/src/db/migrations server/src/repos/pending-transactions.ts server/src/services/bank-sync.ts server/test/bank-sync.test.ts
git commit -m "feat(server): la synchro garde à part les opérations pas encore comptabilisées"
```

---

### Task 3: route `GET /api/transactions/pending`

**Files:**
- Modify: `shared/api-types.ts` (près des types `BankSync*`)
- Modify: `server/src/routes/transactions.ts`
- Test: `server/test/routes.test.ts`

**Interfaces:**
- Consumes: `listVisiblePendingTransactions` (tâche 2).
- Produces, dans `shared/api-types.ts` :
  - `export type PendingTransaction = { accountId: number; date: ISODate; label: string; signedAmount: Cents }`
  - `export type PendingTransactions = { fetchedAt: string | null; transactions: PendingTransaction[] }`

- [ ] **Step 1: Écrire le test**

Dans `server/test/routes.test.ts`, ajouter (imports `replacePendingTransactions` depuis `../src/repos/pending-transactions`, `createConnection, upsertBankAccount, updateConnection, updateBankAccount` depuis `../src/repos/bank` si absents) :

```ts
describe('GET /api/transactions/pending', () => {
  it('renvoie les opérations en cours des comptes synchronisés, la plus ancienne lecture en fetchedAt', async () => {
    const conn = createConnection(t.db, { aspspName: 'La Banque Postale', aspspCountry: 'FR', state: 's' });
    updateConnection(t.db, conn.id, { status: 'active', sessionId: 'sess' });
    const bank = upsertBankAccount(t.db, { connectionId: conn.id, uid: 'u1', iban: null, bankName: 'CCP', accountId: t.courant.id });
    updateBankAccount(t.db, bank.id, { syncFrom: '2026-03-01', linkedAt: '2026-03-01' });
    replacePendingTransactions(t.db, t.courant.id, [{ date: '2026-03-08', label: 'BOULANGERIE', signedAmount: -450 }], '2026-03-10T08:00:00.000Z');
    replacePendingTransactions(t.db, t.livret.id, [{ date: '2026-03-09', label: 'NON LIÉ', signedAmount: -100 }], '2026-03-10T07:00:00.000Z');

    const res = await t.call('GET', '/api/transactions/pending');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      fetchedAt: '2026-03-10T08:00:00.000Z',
      transactions: [{ accountId: t.courant.id, date: '2026-03-08', label: 'BOULANGERIE', signedAmount: -450 }],
    });
  });

  it('liste vide : fetchedAt null', async () => {
    expect((await t.call('GET', '/api/transactions/pending')).body).toEqual({ fetchedAt: null, transactions: [] });
  });
});
```

Vérifier la signature réelle de `upsertBankAccount` dans `server/src/repos/bank.ts` (valeur de retour, champs requis) et adapter l'appel sans changer l'intention.

- [ ] **Step 2: Lancer le test, il échoue**

Run: `npx vitest run server/test/routes.test.ts -t "pending"`
Expected: FAIL (400 : `pending` n'est pas un identifiant).

- [ ] **Step 3: Types partagés et route**

Dans `shared/api-types.ts` :

```ts
/** Opération que la banque n'a pas encore comptabilisée : affichée seule, comptée nulle part. */
export type PendingTransaction = { accountId: number; date: ISODate; label: string; signedAmount: Cents };

export type PendingTransactions = {
  /** Lecture la plus ancienne parmi les opérations renvoyées ; null sans opération. */
  fetchedAt: string | null;
  transactions: PendingTransaction[];
};
```

Dans `server/src/routes/transactions.ts`, importer `listVisiblePendingTransactions` et `type PendingTransactions`, et ajouter **avant** `.get('/:id', ...)` (sinon `pending` est pris pour un identifiant) :

```ts
  .get('/pending', (c) => {
    const rows = listVisiblePendingTransactions(c.get('db'));
    const body: PendingTransactions = {
      fetchedAt: rows.reduce<string | null>((min, r) => (min === null || r.fetchedAt < min ? r.fetchedAt : min), null),
      transactions: rows.map(({ accountId, date, label, signedAmount }) => ({ accountId, date, label, signedAmount })),
    };
    return c.json(body);
  })
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run server/test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/api-types.ts server/src/routes/transactions.ts server/test/routes.test.ts
git commit -m "feat(server): route des opérations en cours"
```

---

### Task 4: bloc « En cours » dans Opérations

**Files:**
- Modify: `client/src/api/hooks.ts` (section « Transactions »)
- Create: `client/src/components/transactions/PendingList.tsx`, `PendingList.module.css`, `PendingList.test.tsx`
- Modify: `client/src/pages/Operations.tsx` (`AllTransactions`)

**Interfaces:**
- Consumes: `PendingTransaction`, `PendingTransactions` (tâche 3) ; `FiltersState`, `DEFAULT_FILTERS` (`client/src/components/transactions/TransactionFilters.tsx`).
- Produces :
  - `usePendingTransactions()` : `useQuery` sur `['transactions', 'pending']`. La clé commence par `transactions`, donc toute invalidation de `DERIVED` (dont la fin de synchro) la rafraîchit.
  - `pendingVisible(filters: FiltersState): boolean` : vrai si les filtres sont ceux par défaut, au compte près.
  - `<PendingList items={PendingTransaction[]} accounts={Map<number, Account>} />` : rien si `items` est vide.

- [ ] **Step 1: Écrire les tests**

`client/src/components/transactions/PendingList.test.tsx` :

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PendingTransaction } from '@shared/api-types';
import type { Account } from '@shared/schemas';
import { PendingList, pendingVisible } from './PendingList';
import { DEFAULT_FILTERS } from './TransactionFilters';

const courant: Account = { id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '' };
const accounts = new Map([[courant.id, courant]]);
const items: PendingTransaction[] = [
  { accountId: 1, date: '2026-10-18', label: 'CARTE X1234 BOULANGERIE', signedAmount: -450 },
  { accountId: 1, date: '2026-10-17', label: 'VIREMENT RECU', signedAmount: 2000 },
];

describe('pendingVisible', () => {
  it('vrai avec les filtres par défaut, au compte près', () => {
    expect(pendingVisible(DEFAULT_FILTERS)).toBe(true);
    expect(pendingVisible({ ...DEFAULT_FILTERS, account: 1 })).toBe(true);
  });

  it('faux dès qu’un autre filtre est actif', () => {
    expect(pendingVisible({ ...DEFAULT_FILTERS, envelope: 3 })).toBe(false);
    expect(pendingVisible({ ...DEFAULT_FILTERS, q: 'carrefour' })).toBe(false);
    expect(pendingVisible({ ...DEFAULT_FILTERS, status: 'planned' })).toBe(false);
    expect(pendingVisible({ ...DEFAULT_FILTERS, period: 'last-month' as never })).toBe(false);
  });
});

describe('PendingList', () => {
  it('affiche chaque opération en cours avec son compte et son montant', () => {
    render(<PendingList items={items} accounts={accounts} />);
    const section = screen.getByRole('region', { name: 'En cours' });
    expect(within(section).getByText('Pas encore comptabilisées par la banque, mises à jour à chaque synchronisation.')).toBeInTheDocument();
    const rows = within(section).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('CARTE X1234 BOULANGERIE')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Courant')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('En cours')).toBeInTheDocument();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('ne rend rien sans opération', () => {
    const { container } = render(<PendingList items={[]} accounts={accounts} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

Avant d'écrire le test du filtre période, lire le type `Period` dans `TransactionFilters.tsx` et remplacer `'last-month' as never` par une vraie valeur autre que `'month'`.

- [ ] **Step 2: Lancer les tests, ils échouent**

Run: `npx vitest run client/src/components/transactions/PendingList.test.tsx`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Hook**

Dans `client/src/api/hooks.ts`, ajouter `PendingTransactions` à l'import de `@shared/api-types`, la clé `pendingTransactions: ['transactions', 'pending'] as const,` dans `keys`, et sous `useTransactions` :

```ts
/** Opérations pas encore comptabilisées par la banque, rafraîchies avec les opérations (même préfixe de clé). */
export const usePendingTransactions = () => useQuery({ queryKey: keys.pendingTransactions, queryFn: () => api.get<PendingTransactions>('/api/transactions/pending') });
```

- [ ] **Step 4: Composant**

`client/src/components/transactions/PendingList.tsx` :

```tsx
import type { PendingTransaction } from '@shared/api-types';
import type { Account } from '@shared/schemas';
import { Amount, Badge, GroupLabel, ListRow, listRowDate } from '@/components/ui';
import { formatDateCompact } from '@/lib/format';
import { DEFAULT_FILTERS, type FiltersState } from './TransactionFilters';
import styles from './PendingList.module.css';

/**
 * Les opérations en cours n'ont ni enveloppe, ni statut, ni période choisie : le bloc ne s'affiche qu'avec
 * les filtres par défaut, le compte mis à part (il s'applique au bloc).
 */
export function pendingVisible(filters: FiltersState): boolean {
  return JSON.stringify({ ...filters, account: undefined }) === JSON.stringify(DEFAULT_FILTERS);
}

type PendingListProps = { items: PendingTransaction[]; accounts: Map<number, Account> };

/** Opérations que la banque n'a pas encore comptabilisées : affichées à part, comptées nulle part. */
export function PendingList({ items, accounts }: PendingListProps) {
  if (items.length === 0) return null;
  return (
    <section className={styles.pending} aria-labelledby="pending-title">
      <div>
        <GroupLabel as="h2" id="pending-title">
          En cours
        </GroupLabel>
        <p className={styles.hint}>Pas encore comptabilisées par la banque, mises à jour à chaque synchronisation.</p>
      </div>
      <ul className="ledger">
        {items.map((p, i) => (
          <ListRow
            key={`${p.accountId}-${p.date}-${p.label}-${p.signedAmount}-${i}`}
            muted
            lead={<span className={listRowDate}>{formatDateCompact(p.date)}</span>}
            title={<span title={p.label}>{p.label}</span>}
            meta={
              <>
                <Badge tone="info">En cours</Badge>
                <span>{accounts.get(p.accountId)?.name ?? ''}</span>
              </>
            }
            trail={<Amount cents={p.signedAmount} tone={p.signedAmount > 0 ? 'always' : 'neutral'} />}
          />
        ))}
      </ul>
    </section>
  );
}
```

Vérifier que `GroupLabel` transmet `id` (sinon l'ajouter à ses props, ou utiliser `aria-label="En cours"` sur la section) et reprendre la classe du compte (`styles.where`) depuis `TransactionRow.module.css` si son rendu diffère d'un simple `span`.

`client/src/components/transactions/PendingList.module.css` :

```css
.pending {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.hint {
  margin-top: var(--s-1);
  font-size: var(--text-sm);
  color: var(--ink-mute);
}
```

- [ ] **Step 5: Brancher dans Opérations**

Dans `client/src/pages/Operations.tsx`, `AllTransactions` : importer `usePendingTransactions` et `PendingList, pendingVisible`, puis :

```tsx
  const pending = usePendingTransactions();
  const pendingItems = useMemo(
    () => (pendingVisible(filters) ? (pending.data?.transactions ?? []).filter((p) => filters.account === undefined || p.accountId === filters.account) : []),
    [pending.data, filters],
  );
```

et placer `<PendingList items={pendingItems} accounts={accountMap} />` juste après le paragraphe `.summary` (avant le squelette / la liste). Le résumé Entrées/Sorties et le compteur restent calculés sur `visible` seul. Le bloc reste affiché même si la liste des opérations est vide ou en erreur.

- [ ] **Step 6: Lancer les tests et vérifications**

Run: `npx vitest run client && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/api/hooks.ts client/src/components/transactions/PendingList.tsx client/src/components/transactions/PendingList.module.css client/src/components/transactions/PendingList.test.tsx client/src/pages/Operations.tsx
git commit -m "feat(client): bloc des opérations en cours en haut d'Opérations"
```

---

### Task 5: recette dans le navigateur

**Files:** aucun, sauf correctifs visuels trouvés en route (commit à part).

- [ ] **Step 1: Copie de la base**

```bash
mkdir -p tmp/recette && sqlite3 data/runway.db ".backup tmp/recette/runway.db"
```

- [ ] **Step 2: Serveur de recette sur la copie, autre port, sans synchro de fond**

```bash
PATH="$HOME/.local/bin:$PATH" RUNWAY_DB=tmp/recette/runway.db RUNWAY_BACKGROUND_SYNC=0 PORT=<port libre> npm run dev
```

(vérifier dans `server/src/index.ts` et `client/vite.config.ts` le nom des variables de port et adapter).

- [ ] **Step 3: Synchro manuelle depuis l'interface**

Lancer une synchro depuis Réglages (utilisateur présent, en-têtes `Psu-*`), puis ouvrir Opérations › Toutes.
Vérifier : bloc « En cours » au-dessus des jours, lignes atténuées, date, libellé, compte, badge, montant ; résumé Entrées/Sorties inchangé ; bloc masqué avec un filtre enveloppe ou recherche, filtré avec un filtre compte ; aucun changement de solde sur l'Accueil.
Contrôler en clair et en sombre, et en largeur mobile ; corriger tout défaut visuel.

- [ ] **Step 4: Nettoyer**

Arrêter le serveur, supprimer `tmp/recette`.
