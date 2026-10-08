# Noms lisibles des marchands - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** afficher « Carrefour Express » au lieu de « ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO 089 » : Runway tire une clé de marchand de chaque libellé, Claude nomme chaque clé une fois en tâche de fond, et l'utilisateur peut renommer.

**Architecture:** une fonction pure `merchantKey` (`core/merchants.ts`) tire la clé du libellé ; le dépôt des opérations la recalcule à chaque écriture (`withMerchantKey` dans `toRow`) et crée la ligne `merchants` correspondante, sans nom.
Les lectures d'opérations font une jointure gauche sur `merchants` et exposent `merchantName` (nom donné, sinon la clé en casse de titre).
Un nommeur en mémoire (`createMerchantNamer`, une seule exécution à la fois) appelle `claude -p` par lots de 150 clés au démarrage, après un import, après une synchro et à la demande ; il ne touche jamais un nom choisi par l'utilisateur.
Côté client, `displayLabel(t)` remplace le libellé dans les listes, le dialogue d'une opération permet de renommer le marchand, et les Réglages montrent l'état du nommage.

**Tech Stack:** TypeScript, Hono, Drizzle ORM + better-sqlite3, drizzle-kit, zod 4, React 19, TanStack Query, Vitest, Testing Library.

Spec : `docs/superpowers/specs/2026-10-08-marchands-design.md`.

## Global Constraints

- Prérequis : ce plan s'exécute après les chantiers « budget par charges » (migration `0009_envelope_monthly_extra`) et « accueil allégé ». La migration de ce plan est `0010_merchants.sql`.
- Seules les dépenses (`expense`) et les revenus (`income`) ont une clé ; virements et répartitions ont `merchant_key = NULL` et `merchantName = null`.
- Un nom de source `user` n'est jamais écrasé par Claude ; Claude n'écrit que si `source` est encore NULL.
- Pas de clé étrangère de `transactions.merchant_key` vers `merchants` : une clé sans ligne reste valide.
- Nommage : 150 clés au plus par lot, 3 libellés d'exemple par clé, noms de 60 caractères au plus, arguments `-p --tools "" --output-format json --json-schema <schema>` plus `--model` si le réglage est rempli.
- Une erreur de nommage (Claude absent, non connecté, délai, sortie invalide) est journalisée et gardée en mémoire ; elle ne bloque jamais une écriture.
- Textes d'interface en français avec accents et apostrophe typographique `’` ; jamais de tiret cadratin, seulement `-`.
- Fixtures de test synthétiques uniquement : aucun vrai nom de personne, numéro de compte ou référence bancaire.
- Ne rien écrire dans `/tmp` ; fichiers temporaires dans `tmp/` du projet.
- Commandes lancées depuis la racine du worktree ; `npm test`, `npm run typecheck` et `npm run lint` au vert à la fin de chaque tâche (une erreur de typecheck préexistante dans `client/src/components/invest/HoldingList.test.tsx` sur `series` n'est pas liée et s'ignore).

## Écarts et compléments par rapport à la spec

Les règles de clé ont été validées en lecture seule sur la vraie base (1 459 opérations, 739 libellés) : avec les seules règles de la spec on obtient 680 clés, avec les ajouts ci-dessous 596, et aucune opération sans clé.

- Préfixes ajoutés : `VIREMENT INSTANTANE WERO A` et `VIREMENT INSTANTANE WERO DE` (une soixantaine de libellés : `WERO A` seul ne s'applique pas après `VIREMENT INSTANTANE`).
- Bruit élargi :
  - montant en devise pour tout code ISO (`CAD 17,23`, `CHF 4,50`, `MAD 95,00`, `USD 6,00`), pas seulement `EUR` ;
  - montant suivi de `¤` ou `€` (`14,55 ¤` dans les cotisations) ;
  - `REFERENCE :` comme `REF :` ;
  - `CARTE X1234` et la date courte `jj/mm` des exports CSV (`CARTE X1234 11/03 CARREFOUR MARKET`) ;
  - date espacée `jj mm aaaa`, mois en toutes lettres suivi de l'année (`ECHEANCE SEPTEMBRE2026`) et mois numérique `mm/aaaa`.
- Règle ajoutée : après le premier mot, un mot d'au moins 6 caractères qui contient un chiffre est une référence, retirée avec tout ce qui suit (`IDFM IDFM/000518277-...`, identifiants hexadécimaux, `40087937V16`).
  Les nombres seuls plus courts restent (`MAIF 79038 NIORT`, exemple de la spec).
- Exemple de la spec `VIREMENT PERMANENT POUR MAX LE COLOK CHARGES APPARTEMENT BASILE` remplacé dans les tests par un équivalent synthétique ; la consigne du prompt « Max (coloc) » devient « Léo (coloc) » pour ne pas écrire un vrai prénom dans le code.
- `GET /api/merchants/:key` ajouté (`{ key, name, source, transactionCount }`) : le dialogue en a besoin pour le titre à jour et le nombre d'opérations.
- Une synchro relance le nommage aussi quand elle a seulement rapproché des opérations prévues : le rapprochement remplace le libellé, donc la clé.
- Un nom vide envoyé par `PUT` relance aussi le nommage, pour que Claude renomme le marchand sans attendre.

## Fichiers

| Fichier | Rôle |
|---|---|
| `core/merchants.ts` | `merchantKey`, `merchantKeyFor`, listes de préfixes et de bruit, `merchantFallbackName`, `merchantDisplayName` |
| `shared/schemas.ts` | `merchantSources`, `merchantKey` et `merchantName` dans `transactionSchema`, `merchantRenameSchema`, `merchantNamesResultSchema` |
| `shared/api-types.ts` | `MerchantStatus`, `MerchantDetail` |
| `server/src/db/schema.ts`, `server/src/db/migrations/0010_merchants.sql` | table `merchants`, colonne `transactions.merchant_key` indexée |
| `server/src/repos/merchants.ts` | lignes `merchants` : création, lots à nommer, noms, renommage, statistiques, export |
| `server/src/repos/transactions.ts` | `withMerchantKey`, jointure et `merchantName`, recherche `q` sur le nom |
| `server/src/services/merchants.ts` | `backfillMerchantKeys`, `buildMerchantPrompt`, `nameMerchants`, `createMerchantNamer` |
| `server/src/routes/merchants.ts` | `GET /status`, `POST /name`, `GET /:key`, `PUT /:key` |
| `server/src/app.ts`, `server/src/index.ts` | montage, déclencheurs, remplissage et nommage au démarrage |
| `server/src/routes/imports.ts`, `server/src/routes/bank-sync.ts` | déclencheurs après import et synchro |
| `server/src/services/export.ts` | export JSON des marchands |
| `server/src/services/claude.ts`, `server/src/routes/sorting.ts` | nom du marchand dans le tri avec Claude |
| `server/src/ask/prompt.ts` | schéma `merchants` dans Demander |
| `client/src/lib/merchants.ts` | `displayLabel` |
| `client/src/components/transactions/MerchantHeading.tsx` | libellé brut et renommage dans le dialogue |
| `client/src/pages/settings/MerchantSettings.tsx` | section « Marchands » des Réglages |


## Amendements après relecture (prioritaires sur le reste du plan)

- Nom de repli d'une opération saisie à la main : la casse de titre de la clé perd les accents (« Café de Léa » deviendrait « Cafe de Lea »).
  Le nom de repli devient : si le libellé contient au moins une minuscule et qu'aucun préfixe bancaire connu ne s'y applique, le libellé tel quel (espaces compactés) ; sinon la casse de titre de la clé.
  « Café de Léa » reste « Café de Léa », « ACHAT CB Uniqlo » donne « Uniqlo ».
  Le repli se calcule donc à partir du libellé et de la clé, pas de la clé seule ; ajouter les tests de ces deux exemples.

---

### Task 1 : clé de marchand et nom de repli (`core`)

**Files:**
- Create: `core/merchants.ts`
- Test: `core/merchants.test.ts`

**Interfaces:**
- Consumes : `TransactionKind` de `@shared/schemas`.
- Produces :
  - `MERCHANT_KINDS: readonly TransactionKind[]` (`['expense', 'income']`) ;
  - `MERCHANT_PREFIXES`, `PAYMENT_INTERMEDIARIES` (tuples de chaînes), `MERCHANT_NOISE: readonly { name: string; pattern: RegExp }[]`, `REFERENCE_MIN_LENGTH = 6` ;
  - `merchantKey(label: string): string | null` ;
  - `merchantKeyFor(kind: TransactionKind, label: string): string | null` ;
  - `merchantFallbackName(key: string): string` ;
  - `merchantDisplayName(key: string | null, name: string | null): string | null`.

- [ ] **Step 1 : tests qui échouent** (`core/merchants.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import {
  MERCHANT_NOISE,
  MERCHANT_PREFIXES,
  PAYMENT_INTERMEDIARIES,
  merchantDisplayName,
  merchantFallbackName,
  merchantKey,
  merchantKeyFor,
} from './merchants';

describe('merchantKey', () => {
  it.each([
    ['ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO 089', 'CARREFOUR EXPR'],
    ['ACHAT CB SUMUP *OCCHIO APPLE PAY', 'OCCHIO'],
    ['ACHAT CB PAYPAL *BOLT.E', 'BOLT.E'],
    ['ACHAT CB MONOP4801', 'MONOP'],
    ['ACHAT CB UBER 03.10.26 EUR 26,30 CARTE NO 089', 'UBER'],
    ['PRELEVEMENT DE MAIF 79038 NIORT EX REF : 0001112223334A ECHEANCE OCTOBRE 2026', 'MAIF 79038 NIORT'],
    ['VIREMENT PERMANENT POUR LEO LE COLOC CHARGES APPARTEMENT', 'LEO LE COLOC CHARGES APPARTEMENT'],
  ])('exemple de la spec : %s', (label, key) => {
    expect(merchantKey(label)).toBe(key);
  });

  it('normalise : majuscules, sans accents, espaces compactés', () => {
    expect(merchantKey('achat cb  Boulangerie   Élise')).toBe('BOULANGERIE ELISE');
  });

  it.each(MERCHANT_PREFIXES)('retire le préfixe « %s »', (prefix) => {
    expect(merchantKey(`${prefix} BOUTIQUE DU COIN`)).toBe('BOUTIQUE DU COIN');
  });

  it('préfère le préfixe le plus long', () => {
    expect(merchantKey('VIREMENT INSTANTANE WERO A LEO R')).toBe('LEO R');
  });

  it.each(PAYMENT_INTERMEDIARIES)('retire l’intermédiaire de paiement « %s »', (name) => {
    expect(merchantKey(`ACHAT CB ${name} *CAFE DU PORT`)).toBe('CAFE DU PORT');
    expect(merchantKey(`ACHAT CB ${name}*CAFE DU PORT`)).toBe('CAFE DU PORT');
  });

  const noiseCases: Record<string, [string, string]> = {
    'référence': ['PRELEVEMENT DE ASSURANCE HABITAT REF : AB-123 ECHEANCE', 'ASSURANCE HABITAT'],
    'Apple Pay': ['ACHAT CB CAFE DU PORT APPLE PAY', 'CAFE DU PORT'],
    'numéro de carte': ['ACHAT CB CAFE DU PORT CARTE NUMERO 123', 'CAFE DU PORT'],
    'carte masquée': ['CARTE X1234 CAFE DU PORT', 'CAFE DU PORT'],
    'montant en devise': ['ACHAT CB CAFE DU PORT CHF 4,50', 'CAFE DU PORT'],
    'montant': ['COTISATION FORMULE DE COMPTE 14,55 €', 'COTISATION FORMULE DE COMPTE'],
    'date': ['ACHAT CB CAFE DU PORT 03/10/2026', 'CAFE DU PORT'],
    'date espacée': ['REJET DE VIREMENT DU 06 10 2025 POUR LEO R', 'REJET DE VIREMENT DU POUR LEO R'],
    'mois': ['PRELEVEMENT DE ASSURANCE HABITAT ECHEANCE SEPTEMBRE2026', 'ASSURANCE HABITAT ECHEANCE'],
    'mois numérique': ['FRAIS DU MOIS DE 08/2026', 'FRAIS DU MOIS DE'],
    'date courte': ['ACHAT CB CAFE DU PORT 11/03', 'CAFE DU PORT'],
    'chiffres collés': ['ACHAT CB MAGASIN4801', 'MAGASIN'],
  };

  it.each(MERCHANT_NOISE.map((n) => n.name))('retire le bruit « %s »', (name) => {
    const testCase = noiseCases[name];
    expect(testCase, `cas de test manquant pour « ${name} »`).toBeDefined();
    expect(merchantKey(testCase![0])).toBe(testCase![1]);
  });

  it('coupe à la première référence longue après le premier mot', () => {
    expect(merchantKey('VIREMENT DE CLUB DE SPORT AB12CD34EF 03/2026 LEOR')).toBe('CLUB DE SPORT');
    expect(merchantKey('ACHAT CB BOUTIQUE_123456')).toBe('BOUTIQUE_123456');
    expect(merchantKey('PRELEVEMENT DE MUTUELLE 79038 PARIS')).toBe('MUTUELLE 79038 PARIS');
  });

  it('retire la ponctuation de bord', () => {
    expect(merchantKey('ACHAT CB - CAFE DU PORT -')).toBe('CAFE DU PORT');
  });

  it('libellé de saisie manuelle', () => {
    expect(merchantKey('Boulangerie')).toBe('BOULANGERIE');
    expect(merchantKey('Café de Léa')).toBe('CAFE DE LEA');
  });

  it.each(['', '   ', 'ACHAT CB', 'ACHAT CB 03.10.26 APPLE PAY'])('un libellé vide après nettoyage donne null : « %s »', (label) => {
    expect(merchantKey(label)).toBeNull();
  });
});

describe('merchantKeyFor', () => {
  it('dépenses et revenus seulement', () => {
    expect(merchantKeyFor('expense', 'ACHAT CB MONOP4801')).toBe('MONOP');
    expect(merchantKeyFor('income', 'VIREMENT DE CLUB DE SPORT')).toBe('CLUB DE SPORT');
    expect(merchantKeyFor('transfer', 'ACHAT CB MONOP4801')).toBeNull();
    expect(merchantKeyFor('allocation', 'Budget')).toBeNull();
  });
});

describe('merchantFallbackName', () => {
  it.each([
    ['CARREFOUR EXPR', 'Carrefour Expr'],
    ['LE PAIN DE LA', 'Le Pain de la'],
    ["L'EMBARCADERE", 'L’Embarcadere'],
    ["MC DONALD'S", 'Mc Donald’s'],
    ['SNCF-VOYAGEURS', 'Sncf-Voyageurs'],
    ['BOLT.E', 'Bolt.e'],
    ['LEO LE COLOC', 'Leo le Coloc'],
    ['APPLE.COM/BILL', 'Apple.com/Bill'],
  ])('%s devient %s', (key, name) => {
    expect(merchantFallbackName(key)).toBe(name);
  });
});

describe('merchantDisplayName', () => {
  it('nom donné, sinon casse de titre, null sans clé', () => {
    expect(merchantDisplayName(null, 'Monoprix')).toBeNull();
    expect(merchantDisplayName('CARREFOUR EXPR', null)).toBe('Carrefour Expr');
    expect(merchantDisplayName('CARREFOUR EXPR', 'Carrefour Express')).toBe('Carrefour Express');
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run core/merchants.test.ts`
Expected: FAIL, `Failed to resolve import "./merchants"`.

- [ ] **Step 3 : implémentation** (`core/merchants.ts`)

```ts
import type { TransactionKind } from '@shared/schemas';

/** Seules les dépenses et les revenus ont un marchand ; virements et répartitions gardent leur libellé. */
export const MERCHANT_KINDS: readonly TransactionKind[] = ['expense', 'income'];

/** Préfixes bancaires retirés en tête du libellé normalisé ; le plus long qui correspond l'emporte. */
export const MERCHANT_PREFIXES = [
  'ACHAT CB',
  'CREDIT CARTE BANCAIRE',
  'PRELEVEMENT DE',
  'VIREMENT PERMANENT POUR',
  'VIREMENT INSTANTANE WERO A',
  'VIREMENT INSTANTANE WERO DE',
  'VIREMENT INSTANTANE A',
  'VIREMENT INSTANTANE DE',
  'VIREMENT DE',
  'VIREMENT POUR',
  'WERO A',
] as const;

/** Intermédiaires de paiement retirés en tête, après le préfixe : « SUMUP *OCCHIO » devient « OCCHIO ». */
export const PAYMENT_INTERMEDIARIES = ['SUMUP', 'PAYPAL', 'SNP', 'SQ', 'ZTL'] as const;

const MONTHS = 'JANVIER|FEVRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AOUT|SEPTEMBRE|OCTOBRE|NOVEMBRE|DECEMBRE';

/** Bruit retiré du libellé, dans cet ordre : la référence d'abord (elle emporte tout ce qui la suit), les chiffres collés en dernier. */
export const MERCHANT_NOISE: readonly { name: string; pattern: RegExp }[] = [
  { name: 'référence', pattern: /\b(?:EX )?REF(?:ERENCE)? ?:.*$/ },
  { name: 'Apple Pay', pattern: /\bAPPLE PAY\b/g },
  { name: 'numéro de carte', pattern: /\bCARTE (?:NUMERO|NO) \d+\b/g },
  { name: 'carte masquée', pattern: /\bCARTE X\d{4}\b/g },
  { name: 'montant en devise', pattern: /\b[A-Z]{3} \d+,\d{2}\b/g },
  { name: 'montant', pattern: /\b\d+,\d{2} ?[¤€]/g },
  { name: 'date', pattern: /\b\d{2}[./]\d{2}[./](?:\d{4}|\d{2})\b/g },
  { name: 'date espacée', pattern: /\b\d{2} \d{2} \d{4}\b/g },
  { name: 'mois', pattern: new RegExp(`\\b(?:${MONTHS}) ?\\d{4}\\b`, 'g') },
  { name: 'mois numérique', pattern: /\b\d{2}\/\d{4}\b/g },
  { name: 'date courte', pattern: /\b\d{2}\/\d{2}\b/g },
  { name: 'chiffres collés', pattern: /(?<=[A-Z])\d+(?=\s|$)/g },
];

/** Après le premier mot, un mot d'au moins cette longueur qui contient un chiffre est une référence : il part avec tout ce qui suit. */
export const REFERENCE_MIN_LENGTH = 6;

const prefixes = [...MERCHANT_PREFIXES].sort((a, b) => b.length - a.length);
const intermediary = new RegExp(`^(?:${PAYMENT_INTERMEDIARIES.join('|')}) ?\\* ?`);
const EDGES = /^[\s\-*.:,;/+]+|[\s\-*.:,;/+]+$/g;

function normalize(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clé du marchand tirée d'un libellé bancaire, sans Claude : normalisation, préfixe, intermédiaire de paiement,
 * bruit (dates, carte, montants, références) et ponctuation de bord retirés. Null si rien ne reste.
 */
export function merchantKey(label: string): string | null {
  let s = normalize(label);
  const prefix = prefixes.find((p) => s === p || s.startsWith(`${p} `));
  if (prefix) s = s.slice(prefix.length).trim();
  s = s.replace(intermediary, '');
  for (const { pattern } of MERCHANT_NOISE) s = s.replace(pattern, ' ');
  const words = s.split(' ').filter(Boolean);
  const reference = words.findIndex((w, i) => i > 0 && w.length >= REFERENCE_MIN_LENGTH && /\d/.test(w));
  s = (reference > 0 ? words.slice(0, reference) : words).join(' ').replace(EDGES, '');
  return s === '' ? null : s;
}

/** Clé d'une opération : celle du libellé pour une dépense ou un revenu, null sinon. */
export function merchantKeyFor(kind: TransactionKind, label: string): string | null {
  return MERCHANT_KINDS.includes(kind) ? merchantKey(label) : null;
}

/** Mots de liaison laissés en minuscules après le premier mot : « Le Pain de la ». */
const MINOR_WORDS = new Set(['A', 'AU', 'AUX', 'D', 'DE', 'DES', 'DU', 'EN', 'ET', 'L', 'LA', 'LE', 'LES', 'SUR']);

function titleWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/(^|[-/*])(\p{L})/gu, (_m, before: string, letter: string) => before + letter.toUpperCase())
    .replace(/^([LD]')(\p{L})/u, (_m, elision: string, letter: string) => elision + letter.toUpperCase());
}

/** Nom d'une clé que personne n'a encore nommée : la clé en casse de titre, apostrophes typographiques. */
export function merchantFallbackName(key: string): string {
  return key
    .split(' ')
    .map((word, i) => (i > 0 && MINOR_WORDS.has(word) ? word.toLowerCase() : titleWord(word)))
    .join(' ')
    .replace(/'/g, '’');
}

/** Nom affiché du marchand d'une opération : le nom donné, sinon la clé en casse de titre, null sans clé. */
export function merchantDisplayName(key: string | null, name: string | null): string | null {
  if (key === null) return null;
  return name ?? merchantFallbackName(key);
}
```

- [ ] **Step 4 : vérifier le succès**

Run: `npx vitest run core/merchants.test.ts`
Expected: PASS.

- [ ] **Step 5 : vérifications et commit**

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur (hors celle, préexistante, de `HoldingList.test.tsx`).

```bash
git add core/merchants.ts core/merchants.test.ts
git commit -m "feat(core): clé de marchand tirée du libellé"
```

---

### Task 2 : table `merchants` et colonne `merchant_key` (migration 0010)

**Files:**
- Modify: `shared/schemas.ts`, `server/src/db/schema.ts`
- Create (généré) : `server/src/db/migrations/0010_merchants.sql`, `server/src/db/migrations/meta/0010_snapshot.json` ; modifié : `server/src/db/migrations/meta/_journal.json`
- Test: `server/test/migrations.test.ts`

**Interfaces:**
- Produces : `merchantSources = ['claude', 'user'] as const`, `type MerchantSource` (`shared/schemas.ts`).
- Produces : table Drizzle `merchants` (`key`, `name`, `source`, `updatedAt`), colonne `transactions.merchantKey` (`merchant_key`, indexée `transactions_merchant_idx`).

- [ ] **Step 1 : vérifier le prérequis**

Run: `ls server/src/db/migrations/0009_*.sql`
Expected: un fichier `0009_envelope_monthly_extra.sql`.
S'il manque, s'arrêter : le chantier « budget par charges » doit être fusionné avant ce plan.

- [ ] **Step 2 : test qui échoue** (ajouter à la fin de `server/test/migrations.test.ts`)

```ts
describe('migration 0010 (marchands)', () => {
  it('ajoute la table merchants et la colonne merchant_key, vides, sans toucher aux opérations', () => {
    const db = new Database(':memory:');
    for (const tag of journalTags(9)) applyMigration(db, tag);
    db.prepare(`INSERT INTO transactions (kind, date, amount, label) VALUES ('expense', '2026-10-01', 1250, 'ACHAT CB BOULANGERIE DU COIN')`).run();

    applyMigration(db, '0010_merchants');

    expect(db.prepare('SELECT label, merchant_key FROM transactions').get()).toEqual({ label: 'ACHAT CB BOULANGERIE DU COIN', merchant_key: null });
    const columns = (db.prepare("PRAGMA table_info('merchants')").all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(['key', 'name', 'source', 'updated_at']);
    const indexes = (db.prepare("PRAGMA index_list('transactions')").all() as { name: string }[]).map((i) => i.name);
    expect(indexes).toContain('transactions_merchant_idx');

    db.prepare(`INSERT INTO merchants (key) VALUES ('BOULANGERIE DU COIN')`).run();
    expect(db.prepare('SELECT name, source, updated_at FROM merchants').get()).toMatchObject({ name: null, source: null, updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    db.close();
  });
});
```

- [ ] **Step 3 : vérifier l'échec**

Run: `npx vitest run server/test/migrations.test.ts`
Expected: FAIL, `ENOENT ... 0010_merchants.sql`.

- [ ] **Step 4 : schéma partagé** (`shared/schemas.ts`, juste après `export type TransactionStatus = ...;`)

```ts
/** Qui a donné le nom d'un marchand : Claude, ou l'utilisateur (jamais écrasé). */
export const merchantSources = ['claude', 'user'] as const;
export type MerchantSource = (typeof merchantSources)[number];
```

- [ ] **Step 5 : schéma Drizzle** (`server/src/db/schema.ts`)

Remplacer l'import des schémas partagés :

```ts
import { bankConnectionStatuses, fundingStatuses, merchantSources } from '@shared/schemas';
```

Dans la table `transactions`, ajouter après `fundingId` :

```ts
    /** Clé du marchand tirée du libellé (`merchantKey`), pour les dépenses et revenus ; null sinon. Pas de clé étrangère. */
    merchantKey: text('merchant_key'),
```

et dans la liste des index de `transactions`, après `uniqueIndex('transactions_fingerprint_idx').on(t.fingerprint),` :

```ts
    index('transactions_merchant_idx').on(t.merchantKey),
```

Après la table `fundings`, ajouter :

```ts
/** Nom lisible d'une clé de marchand ; une clé sans ligne reste valide et s'affiche en casse de titre. */
export const merchants = sqliteTable('merchants', {
  key: text('key').primaryKey(),
  /** Null tant que personne ne l'a nommé. */
  name: text('name'),
  source: text('source', { enum: merchantSources }),
  updatedAt: text('updated_at').notNull().default(now),
});
```

- [ ] **Step 6 : générer la migration**

Run: `npm run db:generate -- --name merchants`
Expected: `[✓] Your SQL migration file ➜ server/src/db/migrations/0010_merchants.sql`.
Le fichier doit contenir, à l'ordre près des instructions :

```sql
CREATE TABLE `merchants` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text,
	`source` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `merchant_key` text;--> statement-breakpoint
CREATE INDEX `transactions_merchant_idx` ON `transactions` (`merchant_key`);
```

Si drizzle-kit propose autre chose (recréation de table, renommage), annuler et corriger le schéma : la migration doit seulement ajouter.

- [ ] **Step 7 : vérifier le succès**

Run: `npx vitest run server/test/migrations.test.ts && npm test`
Expected: PASS partout (la colonne nouvelle est simplement présente dans les lignes lues).

- [ ] **Step 8 : vérifications et commit**

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur nouvelle.

```bash
git add shared/schemas.ts server/src/db/schema.ts server/src/db/migrations/0010_merchants.sql server/src/db/migrations/meta/0010_snapshot.json server/src/db/migrations/meta/_journal.json server/test/migrations.test.ts
git commit -m "feat(server): table des marchands et clé marchand des opérations"
```

---

### Task 3 : clé maintenue à chaque écriture, nom du marchand dans les lectures

**Files:**
- Modify: `shared/schemas.ts`, `server/src/repos/transactions.ts`, `core/test-fixtures.ts`, `client/src/components/transactions/TransactionRow.test.tsx`, `client/src/components/transactions/QuickEntry.test.tsx`
- Create: `server/src/repos/merchants.ts`
- Test: `server/test/merchant-keys.test.ts`

**Interfaces:**
- Consumes : `merchantKeyFor`, `merchantDisplayName` (Task 1) ; table `merchants`, colonne `transactions.merchantKey` (Task 2).
- Produces :
  - `Transaction` gagne `merchantKey: string | null` et `merchantName: string | null` ;
  - `withMerchantKey<T extends { kind: TransactionKind; label: string }>(values: T): T & { merchantKey: string | null }` (`server/src/repos/transactions.ts`) ;
  - `ensureMerchants(db: Db, keys: Iterable<string | null>): void` (`server/src/repos/merchants.ts`) ;
  - toutes les fonctions du dépôt qui renvoient `Transaction` (`listTransactions`, `allTransactions`, `getTransaction`, `createTransaction`, `bulkCreateTransactions`, `updateTransaction`, `listPlanned`, `findTransfersTo`) remplissent `merchantName` ;
  - le filtre `q` cherche dans le libellé et dans `merchants.name`.

- [ ] **Step 1 : tests qui échouent** (`server/test/merchant-keys.test.ts`)

```ts
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { merchantKeyFor } from '@core/merchants';
import type { Db } from '../src/db/client';
import { merchants, transactions } from '../src/db/schema';
import { createRule } from '../src/repos/recurring-rules';
import { listPlanned, listTransactions } from '../src/repos/transactions';
import { commitImport } from '../src/services/import';
import { materializeDue } from '../src/services/materialize';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeEach(() => {
  t = createTestApp('2026-03-10');
});

/** Chaque opération porte la clé tirée de son type et de son libellé, et chaque clé a sa ligne `merchants`. */
function expectInvariant(db: Db) {
  const rows = db.select({ kind: transactions.kind, label: transactions.label, merchantKey: transactions.merchantKey }).from(transactions).all();
  expect(rows.length).toBeGreaterThan(0);
  const stored = new Set(db.select({ key: merchants.key }).from(merchants).all().map((m) => m.key));
  for (const row of rows) {
    expect(row.merchantKey, row.label).toBe(merchantKeyFor(row.kind, row.label));
    if (row.merchantKey !== null) expect(stored.has(row.merchantKey), row.merchantKey).toBe(true);
  }
}

const expense = (label: string, date = '2026-03-02') =>
  t.call('POST', '/api/transactions', { kind: 'expense', date, amount: 12_50, label, accountId: t.courant.id });

describe('clé marchand à l’écriture', () => {
  it('saisie, modification et tri', async () => {
    const created = await expense('ACHAT CB BOULANGERIE DU COIN 03.10.26 CARTE NUMERO 123');
    expect(created.body).toMatchObject({ merchantKey: 'BOULANGERIE DU COIN', merchantName: 'Boulangerie du Coin' });

    const relabeled = await t.call('PUT', `/api/transactions/${created.body.id}`, { kind: 'expense', date: '2026-03-02', amount: 12_50, label: 'Café de la gare', accountId: t.courant.id });
    expect(relabeled.body).toMatchObject({ merchantKey: 'CAFE DE LA GARE', merchantName: 'Cafe de la Gare' });

    const income = await t.call('POST', '/api/transactions', { kind: 'income', date: '2026-03-03', amount: 2000_00, label: 'VIREMENT DE EMPLOYEUR SA', accountId: t.courant.id });
    expect(income.body.merchantKey).toBe('EMPLOYEUR SA');

    const other = await expense('ACHAT CB CAFE DU PORT');
    await t.call('POST', '/api/sorting/apply', { assignments: [{ transactionId: other.body.id, envelopeId: t.courses.id }], rules: [] });
    expect((await t.call('GET', `/api/transactions/${other.body.id}`)).body).toMatchObject({ envelopeId: t.courses.id, merchantKey: 'CAFE DU PORT' });

    const transfer = await t.call('PUT', `/api/transactions/${created.body.id}`, { kind: 'transfer', date: '2026-03-02', amount: 12_50, label: 'Café de la gare', accountId: t.courant.id, toAccountId: t.livret.id });
    expect(transfer.body).toMatchObject({ merchantKey: null, merchantName: null });

    expectInvariant(t.db);
  });

  it('matérialisation des règles récurrentes', () => {
    createRule(t.db, {
      name: 'Assurance', kind: 'expense', amount: 30_00, label: 'PRELEVEMENT DE ASSURANCE HABITAT', accountId: t.courant.id,
      frequency: 'monthly', interval: 1, dayOfMonth: 5, startDate: '2026-01-01', active: true, triggersFunding: false, fundsNextMonth: false,
    });
    createRule(t.db, {
      name: 'Épargne', kind: 'transfer', amount: 100_00, label: 'Épargne du mois', accountId: t.courant.id, toAccountId: t.livret.id,
      frequency: 'monthly', interval: 1, dayOfMonth: 6, startDate: '2026-01-01', active: true, triggersFunding: false, fundsNextMonth: false,
    });
    materializeDue(t.db, '2026-03-10');
    const planned = listPlanned(t.db);
    expect(planned.filter((p) => p.kind === 'expense').map((p) => p.merchantKey)).toEqual(['ASSURANCE HABITAT', 'ASSURANCE HABITAT', 'ASSURANCE HABITAT']);
    expect(planned.filter((p) => p.kind === 'transfer').every((p) => p.merchantKey === null)).toBe(true);
    expectInvariant(t.db);
  });

  it('import et rapprochement d’une opération prévue', () => {
    createRule(t.db, {
      name: 'Assurance', kind: 'expense', amount: 30_00, label: 'Assurance', accountId: t.courant.id,
      frequency: 'monthly', interval: 1, dayOfMonth: 5, startDate: '2026-03-01', active: true, triggersFunding: false, fundsNextMonth: false,
    });
    materializeDue(t.db, '2026-03-10');
    const [planned] = listPlanned(t.db);
    expect(planned!.merchantKey).toBe('ASSURANCE');

    commitImport(t.db, {
      fileName: 'releve.csv',
      accountId: t.courant.id,
      duplicateCount: 0,
      rows: [
        { index: 0, date: '2026-03-05', label: 'PRELEVEMENT DE MUTUELLE DU COIN REF : AB-123', signedAmount: -30_00, fingerprint: 'a'.repeat(40), plannedId: planned!.id, envelopeId: null },
        { index: 1, date: '2026-03-06', label: 'ACHAT CB CAFE DU PORT 06.03.26 CARTE NUMERO 123', signedAmount: -2_50, fingerprint: 'b'.repeat(40), plannedId: null, envelopeId: null },
        { index: 2, date: '2026-03-07', label: 'VIREMENT DE EMPLOYEUR SA', signedAmount: 2000_00, fingerprint: 'c'.repeat(40), plannedId: null, envelopeId: null },
        { index: 3, date: '2026-03-08', label: 'VIREMENT POUR LIVRET', signedAmount: -100_00, fingerprint: 'd'.repeat(40), plannedId: null, envelopeId: null, transferToAccountId: t.livret.id },
      ],
    });

    const byLabel = new Map(listTransactions(t.db).map((x) => [x.label, x]));
    expect(byLabel.get('PRELEVEMENT DE MUTUELLE DU COIN REF : AB-123')).toMatchObject({ id: planned!.id, status: 'confirmed', merchantKey: 'MUTUELLE DU COIN' });
    expect(byLabel.get('ACHAT CB CAFE DU PORT 06.03.26 CARTE NUMERO 123')?.merchantKey).toBe('CAFE DU PORT');
    expect(byLabel.get('VIREMENT DE EMPLOYEUR SA')?.merchantKey).toBe('EMPLOYEUR SA');
    expect(byLabel.get('Virement Courant → Livret')?.merchantKey).toBeNull();
    expectInvariant(t.db);
  });

  it('les lectures donnent le nom du marchand, et la recherche le trouve', async () => {
    await expense('ACHAT CB CAFE DU PORT');
    await t.call('POST', '/api/transactions', { kind: 'transfer', date: '2026-03-04', amount: 50_00, label: 'Épargne', accountId: t.courant.id, toAccountId: t.livret.id });
    expect(listTransactions(t.db).map((x) => x.merchantName)).toEqual([null, 'Cafe du Port']);

    t.db.update(merchants).set({ name: 'Café du Port', source: 'user' }).where(eq(merchants.key, 'CAFE DU PORT')).run();
    expect(listTransactions(t.db).map((x) => x.merchantName)).toEqual([null, 'Café du Port']);

    // « café » n'apparaît que dans le nom du marchand, pas dans le libellé sans accent.
    const byName = await t.call('GET', `/api/transactions?q=${encodeURIComponent('café')}`);
    expect(byName.body.map((x: any) => x.label)).toEqual(['ACHAT CB CAFE DU PORT']);
    expect((await t.call('GET', '/api/transactions?q=port')).body).toHaveLength(1);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run server/test/merchant-keys.test.ts`
Expected: FAIL (`merchantKey` reste `null` et `merchantName` est absent des réponses).

- [ ] **Step 3 : type `Transaction`** (`shared/schemas.ts`, dans `transactionSchema`, après `fundingId: idSchema.nullable(),`)

```ts
  /** Clé du marchand tirée du libellé (dépenses et revenus), null sinon. */
  merchantKey: z.string().nullable(),
  /** Nom du marchand, ou sa clé en casse de titre tant qu'il n'est pas nommé ; null sans clé. */
  merchantName: z.string().nullable(),
```

- [ ] **Step 4 : fixtures de test**

Dans `core/test-fixtures.ts`, fonction `tx`, remplacer `    fundingId: null,` par :

```ts
    fundingId: null,
    merchantKey: null,
    merchantName: null,
```

Dans `client/src/components/transactions/TransactionRow.test.tsx`, remplacer `status: 'confirmed', recurringRuleId: null, importId: null, fingerprint: null, fundingId: null, createdAt: '',` par :

```ts
    status: 'confirmed', recurringRuleId: null, importId: null, fingerprint: null, fundingId: null, merchantKey: null, merchantName: null, createdAt: '',
```

Dans `client/src/components/transactions/QuickEntry.test.tsx`, objet `planned`, remplacer `  fundingId: null,` par :

```ts
  fundingId: null,
  merchantKey: 'MAIF',
  merchantName: 'Maif',
```

- [ ] **Step 5 : lignes `merchants`** (`server/src/repos/merchants.ts`)

```ts
import type { Db } from '../db/client';
import { merchants } from '../db/schema';

/** Au plus autant de lignes par insertion, loin de la limite de variables de SQLite. */
const INSERT_CHUNK = 500;

/** Crée la ligne des clés nouvelles, sans nom (`INSERT OR IGNORE`) : Claude les nommera. */
export function ensureMerchants(db: Db, keys: Iterable<string | null>): void {
  const fresh = [...new Set([...keys].filter((k): k is string => k !== null))];
  const updatedAt = new Date().toISOString();
  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    db.insert(merchants)
      .values(fresh.slice(i, i + INSERT_CHUNK).map((key) => ({ key, updatedAt })))
      .onConflictDoNothing()
      .run();
  }
}
```

- [ ] **Step 6 : dépôt des opérations** (`server/src/repos/transactions.ts`)

Remplacer le haut du fichier, des imports jusqu'à la fin de `deleteTransaction` inclus, par :

```ts
import { and, asc, desc, eq, getTableColumns, gte, inArray, isNotNull, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm';
import { merchantDisplayName, merchantKeyFor } from '@core/merchants';
import type { Transaction, TransactionFilter, TransactionInput } from '@shared/schemas';
import type { Db } from '../db/client';
import { merchants, transactions } from '../db/schema';
import { NotFoundError } from '../errors';
import { ensureMerchants } from './merchants';

export type TransactionInsert = TransactionInput & {
  status?: Transaction['status'];
  recurringRuleId?: number | null;
  importId?: number | null;
  fingerprint?: string | null;
  fundingId?: number | null;
};

/**
 * Ajoute la clé marchand tirée du type et du libellé. Seul point de calcul de `merchant_key` à l'écriture :
 * saisie, modification, matérialisation, import et rapprochement passent tous par `toRow`.
 */
export function withMerchantKey<T extends { kind: Transaction['kind']; label: string }>(values: T): T & { merchantKey: string | null } {
  return { ...values, merchantKey: merchantKeyFor(values.kind, values.label) };
}

function toRow(input: TransactionInsert) {
  return withMerchantKey({
    kind: input.kind,
    date: input.date,
    amount: input.amount,
    label: input.label,
    note: input.note ?? null,
    accountId: input.accountId ?? null,
    toAccountId: input.toAccountId ?? null,
    envelopeId: input.envelopeId ?? null,
    fromEnvelopeId: input.fromEnvelopeId ?? null,
    status: input.status ?? 'confirmed',
    recurringRuleId: input.recurringRuleId ?? null,
    importId: input.importId ?? null,
    fingerprint: input.fingerprint ?? null,
    fundingId: input.fundingId ?? null,
  } satisfies typeof transactions.$inferInsert);
}

const selection = { ...getTableColumns(transactions), storedMerchantName: merchants.name };

/** Opérations jointes à leur marchand ; une clé sans ligne `merchants` reste valide (jointure gauche). */
function selectTransactions(db: Db) {
  return db.select(selection).from(transactions).leftJoin(merchants, eq(merchants.key, transactions.merchantKey));
}

function withMerchantName({ storedMerchantName, ...row }: typeof transactions.$inferSelect & { storedMerchantName: string | null }): Transaction {
  return { ...row, merchantName: merchantDisplayName(row.merchantKey, storedMerchantName) };
}

export function listTransactions(db: Db, filter: Partial<TransactionFilter> = {}): Transaction[] {
  const where: SQL[] = [];
  if (filter.account) where.push(or(eq(transactions.accountId, filter.account), eq(transactions.toAccountId, filter.account))!);
  if (filter.envelope) where.push(or(eq(transactions.envelopeId, filter.envelope), eq(transactions.fromEnvelopeId, filter.envelope))!);
  if (filter.from) where.push(gte(transactions.date, filter.from));
  if (filter.to) where.push(lte(transactions.date, filter.to));
  if (filter.q) {
    const q = `%${filter.q.toLowerCase()}%`;
    where.push(or(like(sql`lower(${transactions.label})`, q), like(sql`lower(${merchants.name})`, q))!);
  }
  if (filter.status) where.push(eq(transactions.status, filter.status));
  if (filter.kind) where.push(eq(transactions.kind, filter.kind));
  if (filter.unsorted) where.push(and(eq(transactions.kind, 'expense'), isNull(transactions.envelopeId))!);
  return selectTransactions(db)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(filter.limit ?? 500)
    .all()
    .map(withMerchantName);
}

/** Toutes les opérations, dans l'ordre chronologique, pour les calculs. */
export function allTransactions(db: Db): Transaction[] {
  return selectTransactions(db).orderBy(asc(transactions.date), asc(transactions.id)).all().map(withMerchantName);
}

export function getTransaction(db: Db, id: number): Transaction {
  const row = selectTransactions(db).where(eq(transactions.id, id)).get();
  if (!row) throw new NotFoundError('Opération introuvable');
  return withMerchantName(row);
}

export function createTransaction(db: Db, input: TransactionInsert): Transaction {
  const row = toRow(input);
  const { id } = db.insert(transactions).values(row).returning({ id: transactions.id }).get();
  ensureMerchants(db, [row.merchantKey]);
  return getTransaction(db, id);
}

export function bulkCreateTransactions(db: Db, inputs: TransactionInsert[]): Transaction[] {
  return db.transaction((tx) => inputs.map((input) => createTransaction(tx as unknown as Db, input)));
}

export function updateTransaction(db: Db, id: number, input: Partial<TransactionInsert>): Transaction {
  const current = getTransaction(db, id);
  const merged: TransactionInsert = {
    ...current,
    ...input,
  };
  const row = toRow(merged);
  db.update(transactions).set(row).where(eq(transactions.id, id)).run();
  ensureMerchants(db, [row.merchantKey]);
  return getTransaction(db, id);
}

export function deleteTransaction(db: Db, id: number): void {
  const result = db.delete(transactions).where(eq(transactions.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Opération introuvable');
}
```

Puis, dans le même fichier, remplacer le corps de `listPlanned` et de `findTransfersTo` pour passer par la jointure :

```ts
export function listPlanned(db: Db, accountId?: number): Transaction[] {
  const where = accountId
    ? and(eq(transactions.status, 'planned'), or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId)))
    : eq(transactions.status, 'planned');
  return selectTransactions(db).where(where).orderBy(asc(transactions.date)).all().map(withMerchantName);
}
```

```ts
/** Transferts reçus par un compte, d'un montant donné, dans une fenêtre de dates. */
export function findTransfersTo(db: Db, accountId: number, amount: number, from: string, to: string): Transaction[] {
  return selectTransactions(db)
    .where(and(eq(transactions.kind, 'transfer'), eq(transactions.toAccountId, accountId), eq(transactions.amount, amount), gte(transactions.date, from), lte(transactions.date, to)))
    .orderBy(asc(transactions.date))
    .all()
    .map(withMerchantName);
}
```

Les autres fonctions du fichier (`findByFingerprints`, `countUnsorted`, `existsForRuleAndDate`, `lastConfirmedDate`, `lastImportedDate`, `countConfirmedOn`) ne renvoient pas d'opération et ne changent pas.

- [ ] **Step 7 : vérifier le succès**

Run: `npx vitest run server/test/merchant-keys.test.ts && npm test`
Expected: PASS partout.

- [ ] **Step 8 : vérifications et commit**

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur nouvelle.

```bash
git add shared/schemas.ts server/src/repos/transactions.ts server/src/repos/merchants.ts core/test-fixtures.ts client/src/components/transactions/TransactionRow.test.tsx client/src/components/transactions/QuickEntry.test.tsx server/test/merchant-keys.test.ts
git commit -m "feat(server): clé marchand recalculée à chaque écriture, nom du marchand dans les opérations"
```

---

### Task 4 : remplissage des clés au démarrage

**Files:**
- Create: `server/src/services/merchants.ts`
- Modify: `server/src/index.ts`
- Test: `server/test/merchant-keys.test.ts`

**Interfaces:**
- Consumes : `MERCHANT_KINDS`, `merchantKeyFor` (Task 1) ; `ensureMerchants` (Task 3).
- Produces : `backfillMerchantKeys(db: Db): number` (nombre d'opérations dont la clé a été écrite).

- [ ] **Step 1 : test qui échoue** (`server/test/merchant-keys.test.ts`)

Ajouter l'import :

```ts
import { backfillMerchantKeys } from '../src/services/merchants';
```

et, à la fin du fichier :

```ts
describe('backfillMerchantKeys', () => {
  it('calcule la clé des opérations qui n’en ont pas, une seule fois', async () => {
    await expense('ACHAT CB CAFE DU PORT');
    await expense('ACHAT CB 03.10.26 APPLE PAY');
    await t.call('POST', '/api/transactions', { kind: 'income', date: '2026-03-03', amount: 2000_00, label: 'VIREMENT DE EMPLOYEUR SA', accountId: t.courant.id });
    await t.call('POST', '/api/transactions', { kind: 'transfer', date: '2026-03-04', amount: 50_00, label: 'Épargne', accountId: t.courant.id, toAccountId: t.livret.id });
    // État d'une base tout juste migrée : aucune clé, aucun marchand.
    t.db.update(transactions).set({ merchantKey: null }).run();
    t.db.delete(merchants).run();

    expect(backfillMerchantKeys(t.db)).toBe(2);
    expectInvariant(t.db);
    expect(t.db.select({ key: merchants.key }).from(merchants).all().map((m) => m.key).sort()).toEqual(['CAFE DU PORT', 'EMPLOYEUR SA']);
    expect(backfillMerchantKeys(t.db)).toBe(0);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run server/test/merchant-keys.test.ts`
Expected: FAIL, `Failed to resolve import "../src/services/merchants"`.

- [ ] **Step 3 : implémentation** (`server/src/services/merchants.ts`)

```ts
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { MERCHANT_KINDS, merchantKeyFor } from '@core/merchants';
import type { Db } from '../db/client';
import { transactions } from '../db/schema';
import { ensureMerchants } from '../repos/merchants';

/**
 * Calcule la clé des dépenses et revenus qui n'en ont pas (opérations d'avant la migration 0010) et crée leurs marchands.
 * Idempotent : une fois fait, seules les opérations dont la clé calculée est nulle sont relues, sans rien écrire.
 */
export function backfillMerchantKeys(db: Db): number {
  const rows = db
    .select({ id: transactions.id, kind: transactions.kind, label: transactions.label })
    .from(transactions)
    .where(and(inArray(transactions.kind, [...MERCHANT_KINDS]), isNull(transactions.merchantKey)))
    .all();
  return db.transaction((tx) => {
    const keys = new Set<string>();
    let updated = 0;
    for (const row of rows) {
      const key = merchantKeyFor(row.kind, row.label);
      if (key === null) continue;
      tx.update(transactions).set({ merchantKey: key }).where(eq(transactions.id, row.id)).run();
      keys.add(key);
      updated++;
    }
    ensureMerchants(tx as unknown as Db, keys);
    return updated;
  });
}
```

- [ ] **Step 4 : démarrage** (`server/src/index.ts`)

Ajouter l'import :

```ts
import { backfillMerchantKeys } from './services/merchants';
```

et, juste après `if (created > 0) console.log(...);` :

```ts
// Opérations d'avant les marchands : leur clé est calculée une fois, puis plus rien n'est à faire.
const backfilled = backfillMerchantKeys(db);
if (backfilled > 0) console.log(`${backfilled} opération(s) rattachée(s) à un marchand`);
```

- [ ] **Step 5 : vérifier le succès**

Run: `npx vitest run server/test/merchant-keys.test.ts`
Expected: PASS.

- [ ] **Step 6 : vérifications et commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: aucune erreur nouvelle.

```bash
git add server/src/services/merchants.ts server/src/index.ts server/test/merchant-keys.test.ts
git commit -m "feat(server): clé marchand des opérations existantes calculée au démarrage"
```

---

### Task 5 : nommage des marchands par Claude

**Files:**
- Modify: `shared/schemas.ts`, `shared/api-types.ts`, `server/src/repos/merchants.ts`, `server/src/services/merchants.ts`
- Test: `server/test/merchant-naming.test.ts`

**Interfaces:**
- Consumes : `runClaude`, `execClaude`, `ClaudeError`, `type Exec` (`server/src/services/claude.ts`) ; `getSettings` (`server/src/repos/settings.ts`) ; `merchantFallbackName` (Task 1) ; `ensureMerchants`, `backfillMerchantKeys` (Tasks 3, 4).
- Produces (`shared`) : `merchantNamesResultSchema`, `merchantRenameSchema` (`{ name: string }`, rogné, 60 caractères au plus, vide permis) ; `type MerchantStatus = { total: number; named: number; running: boolean; lastError: string | null }` ; `type MerchantDetail = { key: string; name: string; source: MerchantSource | null; transactionCount: number }`.
- Produces (`server/src/repos/merchants.ts`) : `listUnnamedKeys(db, limit): string[]`, `sampleLabels(db, key, limit): string[]`, `listMerchantNames(db): string[]`, `setClaudeNames(db, names: { key: string; name: string }[]): number`, `merchantStats(db): { total: number; named: number }`, `getMerchant(db, key): MerchantDetail` (404 `Marchand introuvable`), `renameMerchant(db, key, name: string): MerchantDetail`.
- Produces (`server/src/services/merchants.ts`) : `MERCHANT_BATCH_SIZE = 150`, `MERCHANT_EXAMPLES = 3`, `MERCHANT_NAME_MAX = 60`, `MERCHANT_TIMEOUT_MS = 300_000`, `buildMerchantPrompt(input: { merchants: { key: string; examples: string[] }[]; knownNames: string[] }): string`, `nameMerchants(db, deps?: { exec?: Exec }): Promise<number>`, `type MerchantNamer = { request(): void; status(): MerchantStatus; idle(): Promise<void> }`, `createMerchantNamer(db, deps?: { exec?: Exec; log?: (message: string) => void }): MerchantNamer`.

- [ ] **Step 1 : tests qui échouent** (`server/test/merchant-naming.test.ts`)

```ts
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { merchants } from '../src/db/schema';
import { renameMerchant } from '../src/repos/merchants';
import { getSettings, saveSettings } from '../src/repos/settings';
import { createTransaction } from '../src/repos/transactions';
import type { Exec, ExecResult } from '../src/services/claude';
import { MERCHANT_BATCH_SIZE, createMerchantNamer, nameMerchants } from '../src/services/merchants';
import { createTestDb, type TestContext } from './helpers';

let ctx: TestContext;
beforeEach(() => {
  ctx = createTestDb();
});

function expense(label: string) {
  return createTransaction(ctx.db, { kind: 'expense', date: '2026-03-02', amount: 10_00, label, accountId: ctx.courant.id });
}

function ok(structured: unknown): ExecResult {
  return { stdout: JSON.stringify({ is_error: false, result: 'ok', structured_output: structured }), stderr: '', exitCode: 0 };
}

const notInstalled: ExecResult = { stdout: '', stderr: 'ENOENT', exitCode: 127 };

/** Clés demandées dans le prompt, dans l'ordre (le prompt est le dernier argument). */
function askedKeys(args: string[]): string[] {
  return [...args.at(-1)!.matchAll(/clé "([^"]+)"/g)].map((m) => m[1]!);
}

/** Faux Claude qui nomme chaque clé demandée par une fonction du test. */
function namingExec(nameOf: (key: string) => string) {
  return vi.fn<Exec>(async (args) => ok({ names: askedKeys(args).map((key) => ({ key, name: nameOf(key) })) }));
}

function merchant(key: string) {
  return ctx.db.select().from(merchants).where(eq(merchants.key, key)).get();
}

describe('nameMerchants', () => {
  it('nomme les clés sans nom, les plus fréquentes d’abord, avec exemples et noms existants', async () => {
    expense('ACHAT CB CAFE DU PORT');
    expense('ACHAT CB CAFE DU PORT');
    expense('ACHAT CB CAFE DU PORT');
    expense('ACHAT CB BOULANGERIE DU COIN 03.10.26 CARTE NUMERO 123');
    expense('ACHAT CB BOULANGERIE DU COIN');
    expense('ACHAT CB LIBRAIRIE');
    renameMerchant(ctx.db, 'LIBRAIRIE', 'Librairie du Centre');
    const exec = namingExec((key) => (key === 'CAFE DU PORT' ? 'Café du Port' : 'Boulangerie du Coin'));

    expect(await nameMerchants(ctx.db, { exec })).toBe(2);

    expect(exec).toHaveBeenCalledTimes(1);
    const args = exec.mock.calls[0]![0];
    expect(args.slice(0, 5)).toEqual(['-p', '--tools', '', '--output-format', 'json']);
    expect(args).toContain('--json-schema');
    expect(args).not.toContain('--model');
    expect(askedKeys(args)).toEqual(['CAFE DU PORT', 'BOULANGERIE DU COIN']);
    const prompt = args.at(-1)!;
    expect(prompt).toContain('"ACHAT CB BOULANGERIE DU COIN 03.10.26 CARTE NUMERO 123"');
    expect(prompt).toContain('- Librairie du Centre');
    expect(merchant('CAFE DU PORT')).toMatchObject({ name: 'Café du Port', source: 'claude' });
    expect(merchant('BOULANGERIE DU COIN')).toMatchObject({ name: 'Boulangerie du Coin', source: 'claude' });
    expect(merchant('LIBRAIRIE')).toMatchObject({ name: 'Librairie du Centre', source: 'user' });
  });

  it('passe le modèle des réglages', async () => {
    saveSettings(ctx.db, { ...getSettings(ctx.db), claudeModel: 'haiku' });
    expense('ACHAT CB CAFE DU PORT');
    const exec = namingExec(() => 'Café du Port');
    await nameMerchants(ctx.db, { exec });
    const args = exec.mock.calls[0]![0];
    expect(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2)).toEqual(['--model', 'haiku']);
  });

  it('ne remplace jamais un nom donné par l’utilisateur pendant l’exécution', async () => {
    expense('ACHAT CB CAFE DU PORT');
    const exec = vi.fn<Exec>(async () => {
      renameMerchant(ctx.db, 'CAFE DU PORT', 'Mon café');
      return ok({ names: [{ key: 'CAFE DU PORT', name: 'Café du Port' }] });
    });
    expect(await nameMerchants(ctx.db, { exec })).toBe(0);
    expect(merchant('CAFE DU PORT')).toMatchObject({ name: 'Mon café', source: 'user' });
  });

  it('ignore les clés inconnues, les noms vides et les noms trop longs, puis s’arrête', async () => {
    expense('ACHAT CB CAFE DU PORT');
    expense('ACHAT CB BOULANGERIE DU COIN');
    const exec = vi.fn<Exec>(async () =>
      ok({
        names: [
          { key: 'INCONNU', name: 'Inconnu' },
          { key: 'CAFE DU PORT', name: '   ' },
          { key: 'BOULANGERIE DU COIN', name: 'x'.repeat(61) },
        ],
      }),
    );
    expect(await nameMerchants(ctx.db, { exec })).toBe(0);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(merchant('INCONNU')).toBeUndefined();
    expect(merchant('CAFE DU PORT')?.name).toBeNull();
    expect(merchant('BOULANGERIE DU COIN')?.name).toBeNull();
  });

  it('découpe en lots de 150 clés et recommence tant qu’un lot nomme quelque chose', async () => {
    for (let i = 0; i <= MERCHANT_BATCH_SIZE; i++) expense(`ACHAT CB MAGASIN ${i}`);
    const exec = namingExec((key) => key.toLowerCase());
    expect(await nameMerchants(ctx.db, { exec })).toBe(MERCHANT_BATCH_SIZE + 1);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(askedKeys(exec.mock.calls[0]![0])).toHaveLength(MERCHANT_BATCH_SIZE);
    expect(askedKeys(exec.mock.calls[1]![0])).toHaveLength(1);
  });

  it('ne lance rien sans clé à nommer', async () => {
    const exec = vi.fn<Exec>();
    expect(await nameMerchants(ctx.db, { exec })).toBe(0);
    expect(exec).not.toHaveBeenCalled();
  });

  it.each<[string, ExecResult, string]>([
    ['binaire absent', notInstalled, 'claude_not_installed'],
    ['non connecté', { stdout: JSON.stringify({ is_error: true, result: 'Not logged in · Please run /login' }), stderr: '', exitCode: 0 }, 'claude_not_logged_in'],
    ['schéma non respecté', ok({ names: [{ key: 1 }] }), 'claude_invalid_output'],
  ])('erreur typée : %s', async (_name, result, code) => {
    expense('ACHAT CB CAFE DU PORT');
    await expect(nameMerchants(ctx.db, { exec: async () => result })).rejects.toMatchObject({ code });
  });
});

describe('createMerchantNamer', () => {
  it('garde la dernière erreur dans le statut, la journalise, et l’efface au succès suivant', async () => {
    expense('ACHAT CB CAFE DU PORT');
    const log = vi.fn();
    const exec = vi.fn<Exec>(async () => notInstalled);
    const namer = createMerchantNamer(ctx.db, { exec, log });

    namer.request();
    expect(namer.status().running).toBe(true);
    await namer.idle();
    expect(namer.status()).toEqual({ total: 1, named: 0, running: false, lastError: 'Claude Code n’est pas installé (commande « claude » introuvable)' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('introuvable'));

    exec.mockImplementation(async () => ok({ names: [{ key: 'CAFE DU PORT', name: 'Café du Port' }] }));
    namer.request();
    await namer.idle();
    expect(namer.status()).toEqual({ total: 1, named: 1, running: false, lastError: null });
  });

  it('une seule exécution à la fois ; une demande pendant une exécution relance un seul tour à la fin', async () => {
    expense('ACHAT CB CAFE DU PORT');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const exec = vi.fn<Exec>(async () => {
      await gate;
      return ok({ names: [] });
    });
    const namer = createMerchantNamer(ctx.db, { exec, log: () => {} });

    namer.request();
    namer.request();
    namer.request();
    expect(exec).toHaveBeenCalledTimes(1);
    release();
    await namer.idle();
    expect(exec).toHaveBeenCalledTimes(2);
    expect(namer.status().running).toBe(false);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run server/test/merchant-naming.test.ts`
Expected: FAIL, `renameMerchant` et `nameMerchants` introuvables.

- [ ] **Step 3 : schémas partagés**

Dans `shared/schemas.ts`, après `sortingApplySchema` et son type :

```ts
/** Renommage d'un marchand par l'utilisateur ; un nom vide le rend à Claude. */
export const merchantRenameSchema = z.object({ name: z.string().trim().max(60, '60 caractères au plus') });
export type MerchantRename = z.infer<typeof merchantRenameSchema>;

/** Sortie brute du nommage des marchands par Claude, filtrée clé par clé ensuite. */
export const merchantNamesResultSchema = z.object({ names: z.array(z.object({ key: z.string(), name: z.string() })) });
```

Dans `shared/api-types.ts`, ajouter `MerchantSource` à l'import de `./schemas` :

```ts
import type { Account, BankConnectionStatus, Envelope, ImportRecord, MerchantSource, RecurringRuleInput, SortingRule, Transaction } from './schemas';
```

et, à la fin du fichier :

```ts
/** État du nommage des marchands par Claude (`GET /api/merchants/status`). */
export type MerchantStatus = { total: number; named: number; running: boolean; lastError: string | null };

/** Un marchand et le nombre de ses opérations (`GET /api/merchants/:key`). */
export type MerchantDetail = { key: string; name: string; source: MerchantSource | null; transactionCount: number };
```

- [ ] **Step 4 : dépôt des marchands** (remplacer tout `server/src/repos/merchants.ts`)

```ts
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { merchantFallbackName } from '@core/merchants';
import type { MerchantDetail } from '@shared/api-types';
import type { Db } from '../db/client';
import { merchants, transactions } from '../db/schema';
import { NotFoundError } from '../errors';

/** Au plus autant de lignes par insertion, loin de la limite de variables de SQLite. */
const INSERT_CHUNK = 500;

/** Crée la ligne des clés nouvelles, sans nom (`INSERT OR IGNORE`) : Claude les nommera. */
export function ensureMerchants(db: Db, keys: Iterable<string | null>): void {
  const fresh = [...new Set([...keys].filter((k): k is string => k !== null))];
  const updatedAt = new Date().toISOString();
  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    db.insert(merchants)
      .values(fresh.slice(i, i + INSERT_CHUNK).map((key) => ({ key, updatedAt })))
      .onConflictDoNothing()
      .run();
  }
}

/** Clés portées par au moins une opération et sans nom, les plus fréquentes d'abord. */
export function listUnnamedKeys(db: Db, limit: number): string[] {
  return db
    .select({ key: merchants.key })
    .from(merchants)
    .innerJoin(transactions, eq(transactions.merchantKey, merchants.key))
    .where(isNull(merchants.name))
    .groupBy(merchants.key)
    .orderBy(desc(sql`count(*)`), asc(merchants.key))
    .limit(limit)
    .all()
    .map((r) => r.key);
}

/** Jusqu'à `limit` libellés bruts différents portant cette clé. */
export function sampleLabels(db: Db, key: string, limit: number): string[] {
  return db
    .selectDistinct({ label: transactions.label })
    .from(transactions)
    .where(eq(transactions.merchantKey, key))
    .orderBy(asc(transactions.label))
    .limit(limit)
    .all()
    .map((r) => r.label);
}

/** Noms déjà donnés, sans doublon : Claude les réutilise plutôt que d'en inventer un proche. */
export function listMerchantNames(db: Db): string[] {
  return db
    .selectDistinct({ name: merchants.name })
    .from(merchants)
    .where(isNotNull(merchants.name))
    .orderBy(asc(merchants.name))
    .all()
    .map((r) => r.name!);
}

/** Écrit les noms de Claude là où personne n'a encore nommé le marchand ; renvoie le nombre de marchands nommés. */
export function setClaudeNames(db: Db, names: { key: string; name: string }[]): number {
  const updatedAt = new Date().toISOString();
  return db.transaction((tx) => {
    let named = 0;
    for (const { key, name } of names) {
      named += tx
        .update(merchants)
        .set({ name, source: 'claude', updatedAt })
        .where(and(eq(merchants.key, key), isNull(merchants.source)))
        .run().changes;
    }
    return named;
  });
}

/** Marchands portés par au moins une opération, et combien ont un nom. */
export function merchantStats(db: Db): { total: number; named: number } {
  const row = db
    .select({
      total: sql<number>`count(distinct ${transactions.merchantKey})`,
      named: sql<number>`count(distinct case when ${merchants.name} is not null then ${transactions.merchantKey} end)`,
    })
    .from(transactions)
    .leftJoin(merchants, eq(merchants.key, transactions.merchantKey))
    .get();
  return { total: row?.total ?? 0, named: row?.named ?? 0 };
}

export function getMerchant(db: Db, key: string): MerchantDetail {
  const count = db.select({ n: sql<number>`count(*)` }).from(transactions).where(eq(transactions.merchantKey, key)).get()?.n ?? 0;
  const row = db.select().from(merchants).where(eq(merchants.key, key)).get();
  if (!row && count === 0) throw new NotFoundError('Marchand introuvable');
  return { key, name: row?.name ?? merchantFallbackName(key), source: row?.source ?? null, transactionCount: count };
}

/** Nom choisi par l'utilisateur (source `user`, jamais écrasé par Claude) ; un nom vide remet le marchand à nommer par Claude. */
export function renameMerchant(db: Db, key: string, name: string): MerchantDetail {
  getMerchant(db, key);
  const updatedAt = new Date().toISOString();
  const values = name === '' ? { name: null, source: null, updatedAt } : { name, source: 'user' as const, updatedAt };
  db.insert(merchants)
    .values({ key, ...values })
    .onConflictDoUpdate({ target: merchants.key, set: values })
    .run();
  return getMerchant(db, key);
}
```

- [ ] **Step 5 : service de nommage** (remplacer tout `server/src/services/merchants.ts`)

```ts
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { MERCHANT_KINDS, merchantKeyFor } from '@core/merchants';
import type { MerchantStatus } from '@shared/api-types';
import { merchantNamesResultSchema } from '@shared/schemas';
import type { Db } from '../db/client';
import { transactions } from '../db/schema';
import { ensureMerchants, listMerchantNames, listUnnamedKeys, merchantStats, sampleLabels, setClaudeNames } from '../repos/merchants';
import { getSettings } from '../repos/settings';
import { ClaudeError, execClaude, runClaude, type Exec } from './claude';

/**
 * Calcule la clé des dépenses et revenus qui n'en ont pas (opérations d'avant la migration 0010) et crée leurs marchands.
 * Idempotent : une fois fait, seules les opérations dont la clé calculée est nulle sont relues, sans rien écrire.
 */
export function backfillMerchantKeys(db: Db): number {
  const rows = db
    .select({ id: transactions.id, kind: transactions.kind, label: transactions.label })
    .from(transactions)
    .where(and(inArray(transactions.kind, [...MERCHANT_KINDS]), isNull(transactions.merchantKey)))
    .all();
  return db.transaction((tx) => {
    const keys = new Set<string>();
    let updated = 0;
    for (const row of rows) {
      const key = merchantKeyFor(row.kind, row.label);
      if (key === null) continue;
      tx.update(transactions).set({ merchantKey: key }).where(eq(transactions.id, row.id)).run();
      keys.add(key);
      updated++;
    }
    ensureMerchants(tx as unknown as Db, keys);
    return updated;
  });
}

export const MERCHANT_BATCH_SIZE = 150;
export const MERCHANT_EXAMPLES = 3;
export const MERCHANT_NAME_MAX = 60;
export const MERCHANT_TIMEOUT_MS = 300_000;

/** Schéma de sortie imposé à Claude, écrit à la main comme celui du tri ; revalidé avec `merchantNamesResultSchema`. */
const merchantNamesJsonSchema = {
  type: 'object',
  properties: {
    names: {
      type: 'array',
      items: {
        type: 'object',
        properties: { key: { type: 'string' }, name: { type: 'string' } },
        required: ['key', 'name'],
      },
    },
  },
  required: ['names'],
};

export type MerchantPromptInput = { merchants: { key: string; examples: string[] }[]; knownNames: string[] };

export function buildMerchantPrompt(input: MerchantPromptInput): string {
  const known = input.knownNames.length ? input.knownNames.map((n) => `- ${n}`).join('\n') : '(aucun)';
  const list = input.merchants.map((m) => `- clé ${JSON.stringify(m.key)} ; exemples : ${m.examples.map((e) => JSON.stringify(e)).join(', ')}`).join('\n');
  return `Tu donnes un nom lisible aux marchands d'un relevé bancaire français.

Chaque marchand est identifié par une clé tirée du libellé bancaire, avec quelques libellés bruts en exemple.

Noms déjà donnés (réutilise exactement l'un d'eux quand c'est le même marchand) :
${known}

Marchands à nommer :
${list}

Consignes :
- Donne le nom court que l'utilisateur dirait : « Carrefour Express », « Bolt », « SNCF », « Monoprix ».
- Casse normale, pas tout en majuscules.
- Sans ville ni numéro de magasin, sauf si c'est le seul nom disponible.
- Pour un virement à une personne, le prénom et le rôle s'il est clair : « Léo (coloc) ».
- Si le libellé est tronqué et que le marchand n'est pas reconnaissable, garde les mots lisibles en casse normale : « LE PAIN DE LA » devient « Le Pain de la ».
- Réponds pour chaque clé, en recopiant la clé à l'identique dans "key".
- Réponds uniquement avec le JSON demandé.`;
}

/**
 * Nomme les marchands sans nom par lots de 150, les plus fréquents d'abord, tant qu'un lot en nomme au moins un.
 * N'écrit que là où personne n'a nommé le marchand. Lève une `ClaudeError` si Claude échoue.
 */
export async function nameMerchants(db: Db, deps: { exec?: Exec } = {}): Promise<number> {
  const exec = deps.exec ?? execClaude;
  const model = getSettings(db).claudeModel || undefined;
  let total = 0;
  for (;;) {
    const keys = listUnnamedKeys(db, MERCHANT_BATCH_SIZE);
    if (keys.length === 0) return total;
    const prompt = buildMerchantPrompt({
      merchants: keys.map((key) => ({ key, examples: sampleLabels(db, key, MERCHANT_EXAMPLES) })),
      knownNames: listMerchantNames(db),
    });
    const args = ['-p', '--tools', '', '--output-format', 'json', '--json-schema', JSON.stringify(merchantNamesJsonSchema)];
    if (model) args.push('--model', model);
    args.push(prompt);

    const parsed = merchantNamesResultSchema.safeParse(await runClaude(args, MERCHANT_TIMEOUT_MS, exec));
    if (!parsed.success) throw new ClaudeError('Réponse de Claude invalide (format inattendu)', 'claude_invalid_output');
    const asked = new Set(keys);
    const valid = parsed.data.names
      .map(({ key, name }) => ({ key, name: name.trim() }))
      .filter(({ key, name }) => asked.has(key) && name.length > 0 && name.length <= MERCHANT_NAME_MAX);
    const named = setClaudeNames(db, valid);
    total += named;
    // Un lot qui ne nomme rien reposerait les mêmes clés indéfiniment.
    if (named === 0) return total;
  }
}

export type MerchantNamer = {
  /** Lance un nommage en tâche de fond ; pendant une exécution, en programme un seul de plus à la fin. */
  request: () => void;
  status: () => MerchantStatus;
  /** Résolue quand plus rien ne tourne ni n'est programmé. */
  idle: () => Promise<void>;
};

/**
 * Nommeur en mémoire : une seule exécution à la fois, sans jamais bloquer l'appelant.
 * Une erreur est journalisée et gardée pour l'écran des Réglages, jusqu'au prochain succès.
 */
export function createMerchantNamer(db: Db, deps: { exec?: Exec; log?: (message: string) => void } = {}): MerchantNamer {
  const log = deps.log ?? ((message: string) => console.warn(message));
  let current: Promise<void> | null = null;
  let pending = false;
  let lastError: string | null = null;

  const start = () => {
    pending = false;
    current = nameMerchants(db, { exec: deps.exec })
      .then(() => {
        lastError = null;
      })
      .catch((err: unknown) => {
        lastError = err instanceof Error ? err.message : String(err);
        log(`[marchands] Nommage par Claude impossible : ${lastError}`);
      })
      .finally(() => {
        current = null;
        if (pending) start();
      });
  };

  return {
    request: () => {
      if (current) pending = true;
      else start();
    },
    status: () => ({ ...merchantStats(db), running: current !== null, lastError }),
    idle: async () => {
      while (current) await current;
    },
  };
}
```

- [ ] **Step 6 : vérifier le succès**

Run: `npx vitest run server/test/merchant-naming.test.ts server/test/merchant-keys.test.ts`
Expected: PASS.

- [ ] **Step 7 : vérifications et commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: aucune erreur nouvelle.

```bash
git add shared/schemas.ts shared/api-types.ts server/src/repos/merchants.ts server/src/services/merchants.ts server/test/merchant-naming.test.ts
git commit -m "feat(server): nommage des marchands par Claude, par lots, sans écraser un nom choisi"
```

---

### Task 6 : API `/api/merchants`, déclencheurs et export

**Files:**
- Create: `server/src/routes/merchants.ts`
- Modify: `server/src/app.ts`, `server/src/index.ts`, `server/src/routes/imports.ts`, `server/src/routes/bank-sync.ts`, `server/src/repos/merchants.ts`, `server/src/services/export.ts`, `server/test/helpers.ts`, `server/test/import-pdf.test.ts`, `server/test/bank-sync.test.ts`
- Test: `server/test/merchant-routes.test.ts`

**Interfaces:**
- Consumes : `createMerchantNamer`, `type MerchantNamer`, `getMerchant`, `renameMerchant`, `merchantRenameSchema` (Task 5).
- Produces :
  - `merchantRoutes(namer: MerchantNamer)` : `GET /status` → `MerchantStatus`, `POST /name` → `MerchantStatus`, `GET /:key` → `MerchantDetail`, `PUT /:key` (`{ name }`) → `MerchantDetail` ;
  - `AppOptions.merchantNamer?: MerchantNamer` (par défaut `createMerchantNamer(db, { exec })`) ;
  - `importRoutes(deps?: ImportDeps, hooks?: { onCommitted?: () => void })` ; `BankDeps.onNewTransactions?: () => void` ;
  - `listMerchants(db)` ; export JSON avec `merchants` ;
  - helpers de test : `offlineExec: Exec`, `quietMerchantNamer(db: Db, exec?: Exec): MerchantNamer`, `createTestApp(..., { merchantNamer? })`, `TestApp.merchantNamer`.

- [ ] **Step 1 : helpers de test hors ligne** (`server/test/helpers.ts`)

Ajouter aux imports :

```ts
import { createMerchantNamer, type MerchantNamer } from '../src/services/merchants';
```

Après `createTestDb`, ajouter :

```ts
/** Claude absent : aucun test ne lance le vrai binaire, même en tâche de fond. */
export const offlineExec: Exec = async () => ({ stdout: '', stderr: 'ENOENT', exitCode: 127 });

/** Nommeur de marchands silencieux, hors ligne par défaut, pour les applications de test. */
export function quietMerchantNamer(db: Db, exec: Exec = offlineExec): MerchantNamer {
  return createMerchantNamer(db, { exec, log: () => {} });
}
```

Dans le type `TestApp`, ajouter après `app: ReturnType<typeof createApp>;` :

```ts
  merchantNamer: MerchantNamer;
```

Dans la signature de `createTestApp`, ajouter `merchantNamer?: MerchantNamer` au type de `opts` (après `askSessionId?: () => string`), puis remplacer le début du corps par :

```ts
  const ctx = createTestDb();
  let today = initialToday;
  const merchantNamer = opts.merchantNamer ?? quietMerchantNamer(ctx.db, opts.exec ?? offlineExec);
  const app = createApp({
    db: ctx.db,
    now: () => today,
    exec: opts.exec,
    askStream: opts.askStream,
    askSessionId: opts.askSessionId,
    merchantNamer,
```

(le reste de l'appel à `createApp` ne change pas) et, dans l'objet renvoyé, après `app,` :

```ts
    merchantNamer,
```

Dans `server/test/import-pdf.test.ts`, remplacer l'import des helpers pour y ajouter `quietMerchantNamer`, et l'appel :

```ts
  app = createApp({ db: ctx.db, now: () => '2025-01-10', importDeps: { extractPdfText: async () => statementText }, merchantNamer: quietMerchantNamer(ctx.db) });
```

- [ ] **Step 2 : tests qui échouent** (`server/test/merchant-routes.test.ts`)

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exec, ExecResult } from '../src/services/claude';
import { createTestApp, type TestApp } from './helpers';

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/lbp.csv', import.meta.url)));

let t: TestApp;
beforeEach(() => {
  t = createTestApp('2026-03-12');
});

const expense = (label: string) => t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-02', amount: 10_00, label, accountId: t.courant.id });
const path = (key: string) => `/api/merchants/${encodeURIComponent(key)}`;

function ok(structured: unknown): ExecResult {
  return { stdout: JSON.stringify({ is_error: false, result: 'ok', structured_output: structured }), stderr: '', exitCode: 0 };
}

describe('routes /api/merchants', () => {
  it('statut, détail et renommage par l’utilisateur', async () => {
    await expense('ACHAT CB CAFE DU PORT 03.10.26');
    await expense('ACHAT CB CAFE DU PORT');
    expect((await t.call('GET', '/api/merchants/status')).body).toEqual({ total: 1, named: 0, running: false, lastError: null });
    expect((await t.call('GET', path('CAFE DU PORT'))).body).toEqual({ key: 'CAFE DU PORT', name: 'Cafe du Port', source: null, transactionCount: 2 });

    const renamed = await t.call('PUT', path('CAFE DU PORT'), { name: '  Café du Port  ' });
    expect(renamed.body).toEqual({ key: 'CAFE DU PORT', name: 'Café du Port', source: 'user', transactionCount: 2 });
    expect((await t.call('GET', '/api/transactions')).body.map((x: any) => x.merchantName)).toEqual(['Café du Port', 'Café du Port']);
    expect((await t.call('GET', '/api/merchants/status')).body).toMatchObject({ total: 1, named: 1 });
  });

  it('un nom vide remet le marchand à nommer par Claude et relance le nommage', async () => {
    await expense('ACHAT CB CAFE DU PORT');
    await t.call('PUT', path('CAFE DU PORT'), { name: 'Café du Port' });
    const request = vi.spyOn(t.merchantNamer, 'request');
    const reset = await t.call('PUT', path('CAFE DU PORT'), { name: '' });
    expect(reset.body).toEqual({ key: 'CAFE DU PORT', name: 'Cafe du Port', source: null, transactionCount: 1 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('refuse une clé inconnue et un nom trop long', async () => {
    const unknown = await t.call('PUT', path('INCONNU'), { name: 'Inconnu' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('Marchand introuvable');
    await expense('ACHAT CB CAFE DU PORT');
    expect((await t.call('PUT', path('CAFE DU PORT'), { name: 'x'.repeat(61) })).status).toBe(400);
  });

  it('accepte une clé qui contient une barre oblique', async () => {
    await expense('ACHAT CB APPLE.COM/BILL APPLE PAY');
    expect((await t.call('GET', path('APPLE.COM/BILL'))).body).toMatchObject({ key: 'APPLE.COM/BILL', name: 'Apple.com/Bill', transactionCount: 1 });
  });

  it('POST /name lance le nommage en tâche de fond et répond tout de suite', async () => {
    const exec = vi.fn<Exec>(async () => ok({ names: [{ key: 'CAFE DU PORT', name: 'Café du Port' }] }));
    t = createTestApp('2026-03-12', { exec });
    await expense('ACHAT CB CAFE DU PORT');

    const started = await t.call('POST', '/api/merchants/name');
    expect(started.body).toEqual({ total: 1, named: 0, running: true, lastError: null });
    await t.merchantNamer.idle();
    expect((await t.call('GET', '/api/merchants/status')).body).toEqual({ total: 1, named: 1, running: false, lastError: null });
    expect((await t.call('GET', '/api/transactions')).body[0].merchantName).toBe('Café du Port');
  });

  it('confirmer un import relance le nommage', async () => {
    const request = vi.spyOn(t.merchantNamer, 'request');
    const form = new FormData();
    form.append('file', new File([fixture], 'export.csv', { type: 'text/csv' }));
    form.append('accountId', String(t.courant.id));
    const preview = (await (await t.app.request('/api/imports/preview', { method: 'POST', body: form })).json()) as any;
    const commit = await t.call('POST', '/api/imports/commit', {
      fileName: preview.fileName,
      accountId: preview.accountId,
      duplicateCount: 0,
      rows: preview.rows.map(({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId }: any) => ({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId })),
    });
    expect(commit.status).toBe(201);
    expect(request).toHaveBeenCalledTimes(1);
    expect((await t.call('GET', '/api/transactions')).body.map((x: any) => x.merchantKey)).toContain('CARREFOUR MARKET');
  });

  it('l’export JSON contient les marchands', async () => {
    await expense('ACHAT CB CAFE DU PORT');
    const body = (await (await t.app.request('/api/export.json')).json()) as any;
    expect(body.merchants).toEqual([{ key: 'CAFE DU PORT', name: null, source: null, updatedAt: expect.any(String) }]);
    expect(body.transactions[0]).toMatchObject({ merchantKey: 'CAFE DU PORT', merchantName: 'Cafe du Port' });
  });
});
```

Dans `server/test/bank-sync.test.ts`, test « parcours complet : test, connexion, retour, liaison, synchro, déconnexion », ajouter juste après `expect(linked.body.status).toBe('active');` :

```ts
    const request = vi.spyOn(t.merchantNamer, 'request');
```

juste après `expect(run.body.connections[0]).toMatchObject({ created: 1 });` :

```ts
    expect(request).toHaveBeenCalledTimes(1);
```

et juste après `expect(stale.body.reason).toBe('fresh');` :

```ts
    expect(request).toHaveBeenCalledTimes(1);
```

- [ ] **Step 3 : vérifier l'échec**

Run: `npx vitest run server/test/merchant-routes.test.ts server/test/bank-sync.test.ts`
Expected: FAIL (`/api/merchants/...` en 404 `Route inconnue`, `request` jamais appelé, `merchants` absent de l'export).

- [ ] **Step 4 : routes** (`server/src/routes/merchants.ts`)

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { merchantRenameSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { getMerchant, renameMerchant } from '../repos/merchants';
import type { MerchantNamer } from '../services/merchants';
import { validate } from '../validate';

const keyParam = z.object({ key: z.string().min(1).max(200) });

export const merchantRoutes = (namer: MerchantNamer) =>
  new Hono<AppEnv>()
    .get('/status', (c) => c.json(namer.status()))
    .post('/name', (c) => {
      namer.request();
      return c.json(namer.status());
    })
    .get('/:key', validate('param', keyParam), (c) => c.json(getMerchant(c.get('db'), c.req.valid('param').key)))
    .put('/:key', validate('param', keyParam), validate('json', merchantRenameSchema), (c) => {
      const { name } = c.req.valid('json');
      const merchant = renameMerchant(c.get('db'), c.req.valid('param').key, name);
      // Rendu à Claude : il le renomme sans attendre le prochain import.
      if (name === '') namer.request();
      return c.json(merchant);
    });
```

- [ ] **Step 5 : déclencheurs**

`server/src/routes/imports.ts` : remplacer la signature et la route `/commit` :

```ts
export const importRoutes = (deps: ImportDeps = {}, hooks: { onCommitted?: () => void } = {}) =>
```

```ts
  .post('/commit', validate('json', commitSchema), (c) => {
    const record = commitImport(c.get('db'), c.req.valid('json'));
    hooks.onCommitted?.();
    return c.json(record, 201);
  });
```

`server/src/routes/bank-sync.ts` : dans `BankDeps`, après `now?: () => Date;` :

```ts
  /** Appelé après une synchro qui a écrit des opérations (créées, ou rapprochées : leur libellé change). */
  onNewTransactions?: () => void;
```

et remplacer la route `/run` :

```ts
    .post('/run', validate('json', bankRunSchema), async (c) => {
      const settings = getSettings(c.get('db'));
      if (!isConfigured(settings)) return c.json({ reason: 'not_configured', connections: [] });
      const p = makeProvider(settings, psuInfo(c));
      const result = await runSync(c.get('db'), p, { today: c.get('today'), now: now(), onlyIfStaleMinutes: c.req.valid('json').onlyIfStaleMinutes });
      if (result.connections.some((r) => r.created > 0 || r.matched > 0)) deps.onNewTransactions?.();
      return c.json(result);
    })
```

- [ ] **Step 6 : montage** (`server/src/app.ts`)

Ajouter aux imports :

```ts
import { merchantRoutes } from './routes/merchants';
import { createMerchantNamer, type MerchantNamer } from './services/merchants';
```

Dans `AppOptions`, après `investDeps?: ...;` :

```ts
  /** Nommage des marchands par Claude en tâche de fond ; par défaut, un nommeur qui utilise `exec`. */
  merchantNamer?: MerchantNamer;
```

Remplacer la signature de `createApp` et la création des prix :

```ts
export function createApp({ db, now = today, exec, askStream, askSessionId, importDeps, bankDeps, investDeps = {}, merchantNamer }: AppOptions) {
  const app = new Hono<AppEnv>();
  const prices = createPrices(db, investDeps);
  const namer = merchantNamer ?? createMerchantNamer(db, { exec });
```

Remplacer les montages des imports et de la synchro, et ajouter celui des marchands :

```ts
  app.route('/api/merchants', merchantRoutes(namer));
  app.route('/api/imports', importRoutes(importDeps, { onCommitted: () => namer.request() }));
  app.route('/api/bank-sync', bankSyncRoutes({ ...bankDeps, onNewTransactions: () => namer.request() }));
```

- [ ] **Step 7 : démarrage** (`server/src/index.ts`)

Remplacer l'import du service et la création de l'application :

```ts
import { backfillMerchantKeys, createMerchantNamer } from './services/merchants';
```

```ts
const merchantNamer = createMerchantNamer(db);
// Nomme en tâche de fond les marchands apparus depuis le dernier démarrage, sans retarder l'écoute.
merchantNamer.request();

const app = createApp({ db, merchantNamer });
```

- [ ] **Step 8 : export JSON**

À la fin de `server/src/repos/merchants.ts` :

```ts
/** Tous les marchands, pour l'export JSON. */
export function listMerchants(db: Db) {
  return db.select().from(merchants).orderBy(asc(merchants.key)).all();
}
```

Dans `server/src/services/export.ts`, ajouter l'import `import { listMerchants } from '../repos/merchants';` et, dans l'objet de `exportJson`, après `fundings: listFundings(db),` :

```ts
    merchants: listMerchants(db),
```

- [ ] **Step 9 : vérifier le succès**

Run: `npx vitest run server/test/merchant-routes.test.ts server/test/bank-sync.test.ts server/test/import-pdf.test.ts`
Expected: PASS.

- [ ] **Step 10 : vérifications et commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: aucune erreur nouvelle.

```bash
git add server/src/routes/merchants.ts server/src/app.ts server/src/index.ts server/src/routes/imports.ts server/src/routes/bank-sync.ts server/src/repos/merchants.ts server/src/services/export.ts server/test/helpers.ts server/test/import-pdf.test.ts server/test/bank-sync.test.ts server/test/merchant-routes.test.ts
git commit -m "feat(server): API des marchands, nommage après import, synchro et au démarrage"
```

---

### Task 7 : le nom du marchand dans le tri et dans Demander

**Files:**
- Modify: `server/src/services/claude.ts`, `server/src/routes/sorting.ts`, `server/src/ask/prompt.ts`, `server/test/claude.test.ts`
- Test: `server/test/claude.test.ts`, `server/test/ask-prompt.test.ts`

**Interfaces:**
- Consumes : `Transaction.merchantName` (Task 3).
- Produces : `ClaudeSortInput.transactions: Pick<Transaction, 'id' | 'date' | 'label' | 'amount' | 'merchantName'>[]`, `ClaudeSortInput.examples: { label: string; merchantName: string | null; envelopeId: number }[]`.

- [ ] **Step 1 : tests qui échouent**

Dans `server/test/claude.test.ts`, remplacer l'objet `input` du haut du fichier :

```ts
const input = {
  transactions: [
    { id: 1, date: '2026-03-12', label: 'CARTE X1234 CARREFOUR MARKET', amount: 62_30, merchantName: 'Carrefour Market' },
    { id: 2, date: '2026-03-11', label: 'PRLV EDF', amount: 45_00, merchantName: null },
  ],
  envelopes: [
    { id: 10, name: 'Courses' },
    { id: 11, name: 'Logement' },
  ],
  rules: [{ pattern: 'carrefour', envelopeId: 10 }],
  examples: [{ label: 'CB LECLERC', merchantName: 'Leclerc', envelopeId: 10 }],
};
```

remplacer le test de `buildPrompt` :

```ts
describe('buildPrompt', () => {
  it('contient enveloppes, règles, exemples et opérations, avec le nom du marchand', () => {
    const p = buildPrompt(input);
    expect(p).toContain('- 10 : Courses');
    expect(p).toContain('"carrefour" -> enveloppe 10');
    expect(p).toContain('"CB LECLERC" (marchand : Leclerc) -> enveloppe 10');
    expect(p).toContain('id 1 | 2026-03-12 | 62.30 € | CARTE X1234 CARREFOUR MARKET (marchand : Carrefour Market)');
    expect(p).toContain('id 2 | 2026-03-11 | 45.00 € | PRLV EDF\n');
  });
});
```

remplacer les deux occurrences de :

```ts
({ id: i + 1, date: '2026-03-01', label: `op ${i}`, amount: 100 })
```

par :

```ts
({ id: i + 1, date: '2026-03-01', label: `op ${i}`, amount: 100, merchantName: null })
```

et, dans le test « suggest lit les à trier et apply écrit tout en une fois », après `expect(prompt).toContain('Inconnu');` :

```ts
      expect(prompt).toContain('Inconnu (marchand : Inconnu)');
```

Créer `server/test/ask-prompt.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { buildAskSystemPrompt } from '../src/ask/prompt';

describe('buildAskSystemPrompt', () => {
  it('décrit les marchands et invite à regrouper par nom de marchand', () => {
    const p = buildAskSystemPrompt({ today: '2026-10-08', envelopes: [], accounts: [] });
    expect(p).toContain('recurring_rule_id, merchant_key)');
    expect(p).toContain('merchants(key, name, source)');
    expect(p).toContain('COALESCE(merchants.name, transactions.label)');
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run server/test/claude.test.ts server/test/ask-prompt.test.ts`
Expected: FAIL (le prompt ne contient pas le marchand ; `merchants(key, name, source)` absent).

- [ ] **Step 3 : prompt du tri** (`server/src/services/claude.ts`)

Remplacer le type `ClaudeSortInput` :

```ts
export type ClaudeSortInput = {
  transactions: Pick<Transaction, 'id' | 'date' | 'label' | 'amount' | 'merchantName'>[];
  envelopes: Pick<Envelope, 'id' | 'name'>[];
  rules: Pick<SortingRule, 'pattern' | 'envelopeId'>[];
  examples: { label: string; merchantName: string | null; envelopeId: number }[];
  model?: string;
};
```

Dans `buildPrompt`, ajouter en tête de fonction :

```ts
  const merchantOf = (name: string | null) => (name ? ` (marchand : ${name})` : '');
```

remplacer la construction de `examples` et de `transactions` :

```ts
  const examples = input.examples.length
    ? input.examples.map((e) => `- "${e.label}"${merchantOf(e.merchantName)} -> enveloppe ${e.envelopeId}`).join('\n')
    : '(aucun)';
  const transactions = input.transactions
    .map((t) => `- id ${t.id} | ${t.date} | ${(t.amount / 100).toFixed(2)} € | ${t.label}${merchantOf(t.merchantName)}`)
    .join('\n');
```

et ajouter cette consigne juste avant `- Réponds uniquement avec le JSON demandé.` :

```
- Le marchand entre parenthèses est le nom lisible de l'enseigne tiré du libellé : appuie-toi dessus pour la reconnaître, mais tire le motif d'une règle du libellé lui-même, car les règles de tri s'appliquent au libellé.
```

- [ ] **Step 4 : route du tri** (`server/src/routes/sorting.ts`)

Remplacer la construction des exemples et des opérations :

```ts
      const examples = listTransactions(db, { kind: 'expense', limit: 300 })
        .filter((t) => t.envelopeId != null)
        .slice(0, 40)
        .map((t) => ({ label: t.label, merchantName: t.merchantName, envelopeId: t.envelopeId! }));
```

```ts
          transactions: unsorted.map(({ id, date, label, amount, merchantName }) => ({ id, date, label, amount, merchantName })),
```

- [ ] **Step 5 : prompt de Demander** (`server/src/ask/prompt.ts`)

Remplacer la ligne du schéma des opérations par :

```
- transactions(id, kind, date 'YYYY-MM-DD', amount, label, note, account_id, to_account_id, envelope_id, from_envelope_id, status, recurring_rule_id, merchant_key)
```

et ajouter, juste après la ligne `- sorting_rules(id, pattern, envelope_id) : ...` :

```
- merchants(key, name, source) : marchand d'une dépense ou d'un revenu, joint par transactions.merchant_key = merchants.key (merchant_key est NULL pour les virements et les répartitions). name est le nom lisible (« Monoprix »), NULL tant qu'il n'est pas nommé ; plusieurs clés peuvent porter le même nom. Quand l'utilisateur parle d'un commerçant ou demande où part son argent par enseigne, fais une jointure gauche sur merchants et regroupe par COALESCE(merchants.name, transactions.label) ; cherche un commerçant par merchants.name LIKE plutôt que dans label.
```

- [ ] **Step 6 : vérifier le succès**

Run: `npx vitest run server/test/claude.test.ts server/test/ask-prompt.test.ts server/test/ask.test.ts`
Expected: PASS.

- [ ] **Step 7 : vérifications et commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: aucune erreur nouvelle.

```bash
git add server/src/services/claude.ts server/src/routes/sorting.ts server/src/ask/prompt.ts server/test/claude.test.ts server/test/ask-prompt.test.ts
git commit -m "feat(server): le nom du marchand guide le tri avec Claude et Demander"
```

---

### Task 8 : nom du marchand dans les listes

**Files:**
- Create: `client/src/lib/merchants.ts`
- Modify: `client/src/components/transactions/TransactionRow.tsx`, `client/src/components/transactions/UnsortedList.tsx`, `client/src/components/budget/EnvelopeDetailDialog.tsx`, `client/src/pages/Analyse.tsx`
- Test: `client/src/lib/merchants.test.ts`, `client/src/components/transactions/TransactionRow.test.tsx`

**Interfaces:**
- Consumes : `Transaction.merchantName` (Task 3).
- Produces : `displayLabel(t: Pick<Transaction, 'label' | 'merchantName'>): string`.

- [ ] **Step 1 : tests qui échouent**

`client/src/lib/merchants.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { displayLabel } from './merchants';

describe('displayLabel', () => {
  it('nom du marchand, sinon libellé', () => {
    expect(displayLabel({ label: 'ACHAT CB MONOP4801', merchantName: 'Monoprix' })).toBe('Monoprix');
    expect(displayLabel({ label: 'Virement Courant → Livret', merchantName: null })).toBe('Virement Courant → Livret');
  });
});
```

Dans `client/src/components/transactions/TransactionRow.test.tsx`, ajouter à la fin du `describe('TransactionRow', ...)` :

```tsx
  it('affiche le nom du marchand, avec le libellé brut au survol', () => {
    render(
      <ul>
        <TransactionRow
          transaction={tx({ kind: 'expense', amount: 1250, label: 'ACHAT CB CARREFOUR EXPR 03.10.26', merchantKey: 'CARREFOUR EXPR', merchantName: 'Carrefour Express' })}
          accounts={accounts}
          envelopes={envelopes}
        />
      </ul>,
    );
    expect(screen.getByText('Carrefour Express')).toHaveAttribute('title', 'ACHAT CB CARREFOUR EXPR 03.10.26');
    expect(screen.queryByText('ACHAT CB CARREFOUR EXPR 03.10.26')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run client/src/lib/merchants.test.ts client/src/components/transactions/TransactionRow.test.tsx`
Expected: FAIL (`./merchants` introuvable ; la ligne affiche le libellé brut).

- [ ] **Step 3 : utilitaire** (`client/src/lib/merchants.ts`)

```ts
import type { Transaction } from '@shared/schemas';

/** Nom affiché d'une opération : le marchand pour une dépense ou un revenu, sinon le libellé. */
export function displayLabel(t: Pick<Transaction, 'label' | 'merchantName'>): string {
  return t.merchantName ?? t.label;
}
```

- [ ] **Step 4 : listes**

`client/src/components/transactions/TransactionRow.tsx` : ajouter `import { displayLabel } from '@/lib/merchants';` et remplacer `<span className={styles.label}>{t.label}</span>` par :

```tsx
        <span className={styles.label} title={t.label}>
          {displayLabel(t)}
        </span>
```

(`repeatsLabel(t.note, t.label)` garde le libellé brut : la note répète le libellé, pas le nom.)

`client/src/components/transactions/UnsortedList.tsx` : ajouter `import { displayLabel } from '@/lib/merchants';`, puis :

- remplacer `type Banner = { transactionId: number; label: string; envelopeId: number };` par `type Banner = { transactionId: number; label: string; name: string; envelopeId: number };` ;
- remplacer `setBanner({ transactionId: t.id, label: t.label, envelopeId });` par `setBanner({ transactionId: t.id, label: t.label, name: displayLabel(t), envelopeId });` ;
- remplacer `<span className={styles.bannerLabel}>{banner.label}</span> rangé dans` par `<span className={styles.bannerLabel}>{banner.name}</span> rangé dans` (le `RuleBanner` garde `label={banner.label}` : le motif d'une règle se tire du libellé) ;
- remplacer `<span className={styles.label}>{t.label}</span>` par `<span className={styles.label} title={t.label}>{displayLabel(t)}</span>` ;
- remplacer l'attribut `aria-label` de l'`InlinePill` par :

```tsx
                      aria-label={`Enveloppe pour ${displayLabel(t)}`}
```

`client/src/components/budget/EnvelopeDetailDialog.tsx` : ajouter `import { displayLabel } from '@/lib/merchants';` et remplacer :

```tsx
                <span className={styles.label}>
                  {t.label}
```

par :

```tsx
                <span className={styles.label} title={t.label}>
                  {displayLabel(t)}
```

`client/src/pages/Analyse.tsx` (`TopExpenses`) : ajouter `import { displayLabel } from '@/lib/merchants';` et remplacer `<span className={styles.topLabel}>{t.label}</span>` par :

```tsx
                <span className={styles.topLabel} title={t.label}>
                  {displayLabel(t)}
                </span>
```

- [ ] **Step 5 : vérifier le succès**

Run: `npx vitest run client/src/lib/merchants.test.ts client/src/components/transactions/TransactionRow.test.tsx`
Expected: PASS.

- [ ] **Step 6 : vérifications et commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: aucune erreur nouvelle.

```bash
git add client/src/lib/merchants.ts client/src/lib/merchants.test.ts client/src/components/transactions/TransactionRow.tsx client/src/components/transactions/TransactionRow.test.tsx client/src/components/transactions/UnsortedList.tsx client/src/components/budget/EnvelopeDetailDialog.tsx client/src/pages/Analyse.tsx
git commit -m "feat(client): nom du marchand dans les opérations, « À ranger », le détail d’enveloppe et l’Analyse"
```

---

### Task 9 : renommer un marchand depuis le dialogue d'une opération

**Files:**
- Modify: `client/src/api/hooks.ts`, `client/src/components/transactions/TransactionEditDialog.tsx`
- Create: `client/src/components/transactions/MerchantHeading.tsx`, `client/src/components/transactions/MerchantHeading.module.css`
- Test: `client/src/components/transactions/TransactionEditDialog.test.tsx`

**Interfaces:**
- Consumes : `GET /api/merchants/:key`, `PUT /api/merchants/:key` (Task 6) ; `MerchantDetail` (Task 5) ; `displayLabel` (Task 8).
- Produces : `keys.merchant(key: string)` (`['merchants', 'detail', key]`), `useMerchant(key: string | null)`, `useRenameMerchant(opts?)` (variables `{ key: string; name: string }`, renvoie `MerchantDetail`) ; composant `MerchantHeading({ merchantKey, label })`.

- [ ] **Step 1 : test qui échoue** (`client/src/components/transactions/TransactionEditDialog.test.tsx`)

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@shared/schemas';
import { ToastProvider } from '@/components/ui';
import { TransactionEditDialog } from './TransactionEditDialog';

const accounts = [
  { id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '' },
  { id: 2, name: 'Livret', initialBalance: 0, onBudget: false, bankAccountNumber: null, archived: false, createdAt: '' },
];
const envelopes = [{ id: 10, name: 'Courses', color: '#4f8a5b', monthlyTarget: null, sortOrder: 0, archived: false, isSavings: false }];

const expense: Transaction = {
  id: 7,
  kind: 'expense',
  date: '2026-10-03',
  amount: 1250,
  label: 'ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO 123',
  note: null,
  accountId: 1,
  toAccountId: null,
  envelopeId: null,
  fromEnvelopeId: null,
  status: 'confirmed',
  recurringRuleId: null,
  importId: 3,
  fingerprint: null,
  fundingId: null,
  merchantKey: 'CARREFOUR EXPR',
  merchantName: 'Carrefour Express',
  createdAt: '',
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  let name = 'Carrefour Express';
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url === '/api/merchants/CARREFOUR%20EXPR') {
      if (init?.method === 'PUT') name = (JSON.parse(String(init.body)) as { name: string }).name;
      return json({ key: 'CARREFOUR EXPR', name, source: 'user', transactionCount: 52 });
    }
    if (url.startsWith('/api/accounts')) return json(accounts);
    if (url.startsWith('/api/envelopes')) return json(envelopes);
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
});

function renderDialog(transaction: Transaction) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TransactionEditDialog transaction={transaction} onClose={vi.fn()} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('TransactionEditDialog', () => {
  it('montre le marchand en titre et le libellé brut dessous, et renomme le marchand pour toutes ses opérations', async () => {
    const user = userEvent.setup();
    renderDialog(expense);
    expect(screen.getByRole('heading', { name: 'Carrefour Express', hidden: true })).toBeInTheDocument();
    expect(screen.getByText(expense.label)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Renommer', hidden: true }));
    expect(await screen.findByText(/52 opérations/)).toBeInTheDocument();
    const input = screen.getByLabelText('Nom du marchand');
    await user.clear(input);
    await user.type(input, 'Carrefour');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le nom', hidden: true }));

    expect(fetchMock).toHaveBeenCalledWith('/api/merchants/CARREFOUR%20EXPR', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Carrefour' }) }));
    expect(await screen.findByRole('heading', { name: 'Carrefour', hidden: true })).toBeInTheDocument();
  });

  it('un virement garde son titre et n’a pas de marchand à renommer', () => {
    renderDialog({ ...expense, kind: 'transfer', toAccountId: 2, label: 'Épargne', merchantKey: null, merchantName: null });
    expect(screen.getByRole('heading', { name: 'Modifier : virement', hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renommer', hidden: true })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run client/src/components/transactions/TransactionEditDialog.test.tsx`
Expected: FAIL (titre « Modifier : dépense », pas de bouton « Renommer »).

- [ ] **Step 3 : hooks** (`client/src/api/hooks.ts`)

Ajouter `MerchantDetail` à l'import de `@shared/api-types` (ordre alphabétique, après `ImportPreview`).
Dans l'objet `keys`, après `binanceSync: ...,` :

```ts
  merchant: (key: string) => ['merchants', 'detail', key] as const,
```

Juste avant la section `// Settings`, ajouter :

```ts
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
```

- [ ] **Step 4 : composant** (`client/src/components/transactions/MerchantHeading.tsx`)

```tsx
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { useMerchant, useRenameMerchant } from '@/api/hooks';
import { Button, Field, Input, useToast } from '@/components/ui';
import { plural } from '@/lib/format';
import styles from './MerchantHeading.module.css';

type MerchantHeadingProps = { merchantKey: string; label: string };

/** Libellé brut sous le nom du marchand, et renommage du marchand pour toutes ses opérations. */
export function MerchantHeading({ merchantKey, label }: MerchantHeadingProps) {
  const toast = useToast();
  const merchant = useMerchant(merchantKey);
  const [draft, setDraft] = useState<string | null>(null);
  const rename = useRenameMerchant({
    onSuccess: (m) => {
      toast.success(m.source === 'user' ? 'Marchand renommé' : 'Claude renommera ce marchand');
      setDraft(null);
    },
  });

  if (draft === null) {
    return (
      <div className={styles.heading}>
        <p className={styles.label} title={label}>
          {label}
        </p>
        <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setDraft(merchant.data?.name ?? '')}>
          Renommer
        </Button>
      </div>
    );
  }

  const count = merchant.data?.transactionCount;
  const scope = count === undefined ? 'toutes les opérations de ce marchand' : `toutes les opérations de ce marchand (${plural(count, 'opération')})`;
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        rename.mutate({ key: merchantKey, name: draft.trim() });
      }}
    >
      <Field label="Nom du marchand" hint={`Le nouveau nom vaudra pour ${scope}. Vide pour laisser Claude le nommer.`} error={rename.error ? errorMessage(rename.error) : null}>
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} autoFocus />}
      </Field>
      <div className={styles.actions}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            rename.reset();
            setDraft(null);
          }}
        >
          Annuler
        </Button>
        <Button size="sm" variant="primary" type="submit" loading={rename.isPending}>
          Enregistrer le nom
        </Button>
      </div>
    </form>
  );
}
```

`client/src/components/transactions/MerchantHeading.module.css` :

```css
/* Libellé brut sous le nom du marchand, et son renommage en place */
.heading {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}

.label {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--ink-mute);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-2);
}
```

- [ ] **Step 5 : dialogue** (`client/src/components/transactions/TransactionEditDialog.tsx`)

Remplacer les imports :

```tsx
import { Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Transaction } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useConfirmTransaction, useDeleteTransaction, useMerchant, useUpdateTransaction } from '@/api/hooks';
import { AllocationForm } from '@/components/envelopes/AllocationForm';
import { Button, ConfirmDialog, Dialog, useToast } from '@/components/ui';
import { KIND_LABELS } from '@/lib/format';
import { displayLabel } from '@/lib/merchants';
import { MerchantHeading } from './MerchantHeading';
import { QuickEntry } from './QuickEntry';
```

Remplacer `const t = transaction;` par :

```tsx
  const t = transaction;
  // Le nom suit le marchand en cache : il change dès qu'on le renomme, sans rouvrir le dialogue.
  const merchant = useMerchant(t?.merchantKey ?? null);
  const title = !t ? '' : t.merchantKey ? (merchant.data?.name ?? displayLabel(t)) : `Modifier : ${KIND_LABELS[t.kind].toLowerCase()}`;
```

Dans le `<Dialog>`, remplacer :

```tsx
        title={t ? `Modifier : ${KIND_LABELS[t.kind].toLowerCase()}` : ''}
```

par :

```tsx
        title={title}
```

Remplacer la branche `QuickEntry` (de `) : (` jusqu'à la fermeture de `<QuickEntry ... />`) par :

```tsx
          ) : (
            <>
              {t.merchantKey ? <MerchantHeading key={t.id} merchantKey={t.merchantKey} label={t.label} /> : null}
              <QuickEntry
                key={t.id}
                mode="edit"
                initial={t}
                submitting={update.isPending}
                serverError={serverError}
                onSubmit={(input) => update.mutate({ id: t.id, ...input })}
                footerStart={deleteButton}
                footerExtra={
                  t.status === 'planned' ? (
                    <Button variant="ghost" icon={<Check />} loading={confirm.isPending} onClick={() => confirm.mutate(t.id)}>
                      Confirmer sans modifier
                    </Button>
                  ) : null
                }
              />
            </>
          )
```

Dans le `<ConfirmDialog>`, remplacer `{t?.label}` par `{t ? displayLabel(t) : null}`.

- [ ] **Step 6 : vérifier le succès**

Run: `npx vitest run client/src/components/transactions/TransactionEditDialog.test.tsx client/src/components/transactions/QuickEntry.test.tsx`
Expected: PASS.

- [ ] **Step 7 : vérifications et commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: aucune erreur nouvelle.

```bash
git add client/src/api/hooks.ts client/src/components/transactions/MerchantHeading.tsx client/src/components/transactions/MerchantHeading.module.css client/src/components/transactions/TransactionEditDialog.tsx client/src/components/transactions/TransactionEditDialog.test.tsx
git commit -m "feat(client): renommer un marchand depuis le dialogue d’une opération"
```

---

### Task 10 : section « Marchands » des Réglages

**Files:**
- Modify: `client/src/api/hooks.ts`, `client/src/pages/settings/General.tsx`
- Create: `client/src/pages/settings/MerchantSettings.tsx`
- Test: `client/src/pages/settings/MerchantSettings.test.tsx`

**Interfaces:**
- Consumes : `GET /api/merchants/status`, `POST /api/merchants/name` (Task 6) ; `MerchantStatus` (Task 5).
- Produces : `keys.merchantStatus` (`['merchants', 'status']`), `useMerchantStatus()` (rafraîchi toutes les 3 s pendant une exécution, invalide les opérations à la fin), `useNameMerchants(opts?)` ; composant `MerchantSettings`.

- [ ] **Step 1 : test qui échoue** (`client/src/pages/settings/MerchantSettings.test.tsx`)

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MerchantStatus } from '@shared/api-types';
import { ToastProvider } from '@/components/ui';
import { MerchantSettings } from './MerchantSettings';

let status: MerchantStatus;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  status = { total: 412, named: 398, running: false, lastError: 'Claude Code n’est pas connecté : lance « claude » dans un terminal puis /login' };
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/merchants/name' && init?.method === 'POST') status = { ...status, running: true, lastError: null };
    return new Response(JSON.stringify(status), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('MerchantSettings', () => {
  it('résume les marchands, montre la dernière erreur et lance le nommage', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <MerchantSettings />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('412 marchands, 398 nommés')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Claude Code n’est pas connecté');

    await user.click(screen.getByRole('button', { name: 'Nommer avec Claude' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/merchants/name', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByText('Claude nomme les nouveaux marchands…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nommer avec Claude' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run client/src/pages/settings/MerchantSettings.test.tsx`
Expected: FAIL, `./MerchantSettings` introuvable.

- [ ] **Step 3 : hooks** (`client/src/api/hooks.ts`)

Ajouter en tête du fichier `import { useEffect, useRef } from 'react';`, et `MerchantStatus` à l'import de `@shared/api-types` (après `MerchantDetail`).
Dans `keys`, après `merchant: ...,` :

```ts
  merchantStatus: ['merchants', 'status'] as const,
```

Dans la section `// Marchands`, ajouter :

```ts
/** État du nommage ; suivi toutes les 3 secondes pendant une exécution, puis les noms affichés sont rafraîchis. */
export function useMerchantStatus() {
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
  return query;
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
```

- [ ] **Step 4 : section** (`client/src/pages/settings/MerchantSettings.tsx`)

```tsx
import { Sparkles } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { useMerchantStatus, useNameMerchants } from '@/api/hooks';
import { Button, SkeletonRows, useToast } from '@/components/ui';
import { plural } from '@/lib/format';
import styles from './Settings.module.css';

/** Section « Marchands » : combien sont nommés, nommage à la demande et dernière erreur de Claude. */
export function MerchantSettings() {
  const toast = useToast();
  const status = useMerchantStatus();
  const name = useNameMerchants({ onError: (e) => toast.error(errorMessage(e)) });
  const data = status.data;

  return (
    <section className={styles.section}>
      <div className={styles.aside}>
        <h2>Marchands</h2>
        <p>Runway tire un marchand de chaque libellé, et Claude lui donne un nom lisible une fois pour toutes.</p>
        <p>Un nom que tu choisis dans une opération n’est jamais remplacé.</p>
      </div>
      <div className={styles.content}>
        {!data ? (
          <SkeletonRows rows={2} />
        ) : (
          <>
            <p className={styles.text}>{`${plural(data.total, 'marchand')}, ${plural(data.named, 'nommé')}`}</p>
            {data.running ? (
              <p className={styles.status} aria-live="polite">
                Claude nomme les nouveaux marchands…
              </p>
            ) : null}
            {data.lastError && !data.running ? (
              <p className={styles.error} role="alert">
                {data.lastError}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button icon={<Sparkles />} loading={data.running || name.isPending} onClick={() => name.mutate()}>
                Nommer avec Claude
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5 : page Général** (`client/src/pages/settings/General.tsx`)

Ajouter `import { MerchantSettings } from './MerchantSettings';`, insérer `<MerchantSettings />` entre la section « Prévision et tri » et la section « Sauvegarde », et remplacer le texte d'aide de l'export JSON par :

```tsx
                  <span className={styles.downloadHint}>Tout : comptes, enveloppes, opérations, marchands, charges fixes, règles, réglages.</span>
```

- [ ] **Step 6 : vérifier le succès**

Run: `npx vitest run client/src/pages/settings/MerchantSettings.test.tsx`
Expected: PASS.

- [ ] **Step 7 : vérifications et commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: aucune erreur nouvelle.

```bash
git add client/src/api/hooks.ts client/src/pages/settings/MerchantSettings.tsx client/src/pages/settings/MerchantSettings.test.tsx client/src/pages/settings/General.tsx
git commit -m "feat(client): section Marchands des Réglages, nommage avec Claude à la demande"
```

---

### Task 11 : vérification complète

**Files:** aucun nouveau fichier ; corriger sur place ce que les commandes signalent.

**Interfaces:**
- Consumes : tout ce qui précède.

- [ ] **Step 1 : tests**

Run: `npm test`
Expected: tous les projets `node` et `client` au vert, aucun test ignoré nouveau, aucun avertissement de nommage dans la sortie (les applications de test utilisent le nommeur silencieux).

- [ ] **Step 2 : types**

Run: `npm run typecheck`
Expected: aucune erreur, sauf l'erreur préexistante de `client/src/components/invest/HoldingList.test.tsx` sur `series`, sans rapport avec ce plan.

- [ ] **Step 3 : lint**

Run: `npm run lint`
Expected: aucune erreur ni avertissement.

- [ ] **Step 4 : recette sur une copie de la vraie base**

La vraie base ne se touche pas : copier `~/projects/runway/data/runway.db` dans `tmp/recette/runway.db`, puis lancer `PATH="$HOME/.local/bin:$PATH" RUNWAY_DB=tmp/recette/runway.db PORT=3100 npm run dev:server` et le client sur ce port.
Vérifier :
- au démarrage, « N opération(s) rattachée(s) à un marchand » s'affiche une fois, puis plus au redémarrage suivant ;
- Opérations, « À ranger », détail d'une enveloppe et « Plus grosses dépenses » montrent des noms lisibles, le libellé brut au survol ;
- Réglages, Général : « N marchands, M nommés » progresse pendant le nommage, le bouton est désactivé pendant l'exécution ;
- le dialogue d'une dépense montre le marchand en titre, le libellé brut dessous, et « Renommer » change le nom de toutes ses opérations ; un nom vide le rend à Claude ;
- la recherche des Opérations trouve une opération par le nom de son marchand ;
- sans `claude` dans le `PATH`, rien ne casse : les noms de repli s'affichent et la section Marchands montre l'erreur.

- [ ] **Step 5 : commit éventuel**

S'il a fallu corriger quelque chose :

```bash
git add <fichiers corrigés>
git commit -m "fix: corrections de la vérification des noms de marchands"
```
