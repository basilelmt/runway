/**
 * Remplit une base Runway de recette avec un profil inventé, en passant par l'API d'un serveur déjà lancé.
 *
 * L'historique arrive par de vrais imports de relevés La Banque Postale (inventés), comme en usage réel.
 * Le relevé de démonstration de la scène Import est écrit dans `tmp/video/releve-demo.csv` sans être importé :
 * il chevauche l'historique d'une ligne (doublon) et contient une occurrence prévue (rapprochée).
 *
 * Usage : `node video/scripts/seed.ts` (serveur de recette sur RUNWAY_URL, par défaut http://localhost:3100).
 * Le serveur doit tourner sur une base vide, jamais sur `data/runway.db`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.RUNWAY_URL ?? 'http://localhost:3100';
const OUT_DIR = fileURLToPath(new URL('../../tmp/video/', import.meta.url));
const TODAY = new Date();

// --- Outils ---------------------------------------------------------------

/** Générateur pseudo-aléatoire déterministe : la même base à chaque passage. */
let seed = 20261021;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100);

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgo(n: number): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d;
}
/** Le jour `day` du mois en cours, `offset` mois plus loin. */
function dayOfMonth(day: number, offset = 0): string {
  return iso(new Date(TODAY.getFullYear(), TODAY.getMonth() + offset, day));
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: body instanceof FormData || body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} : ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

type Row = { date: Date; label: string; cents: number };

function lbpCsv(rows: Row[], balance: number): string {
  const fr = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const amount = (c: number) => `${c < 0 ? '-' : '+'}${(Math.abs(c) / 100).toFixed(2).replace('.', ',')}`;
  const sorted = [...rows].sort((a, b) => b.date.getTime() - a.date.getTime());
  return [
    'Numéro Compte ;7654321K020',
    'Type ;Compte Courant Postal',
    'Compte tenu en ;euros',
    `Date ;${fr(TODAY)}`,
    `Solde (EUROS) ;${amount(balance)}`,
    '',
    'Date;Libellé;Montant(EUROS)',
    ...sorted.map((r) => `${fr(r.date)};"${r.label}";${amount(r.cents)}`),
    '',
  ].join('\r\n');
}

const card = (d: Date, merchant: string) =>
  `CARTE X4821 ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${merchant}`;

// --- Profil ---------------------------------------------------------------

const ENVELOPES = [
  { key: 'logement', name: 'Logement', color: '#5b7c99' },
  { key: 'courses', name: 'Courses', color: '#4f8a5b', monthlyExtra: 38000 },
  { key: 'transports', name: 'Transports', color: '#b8731a', monthlyExtra: 6000 },
  { key: 'factures', name: 'Factures', color: '#7a6aa8' },
  { key: 'abonnements', name: 'Abonnements', color: '#a8556f' },
  { key: 'sorties', name: 'Sorties', color: '#c8412b', monthlyExtra: 18000 },
  { key: 'sante', name: 'Santé', color: '#2f7d7a', monthlyExtra: 4000 },
  { key: 'shopping', name: 'Shopping', color: '#8a6d3b', monthlyExtra: 10000 },
  { key: 'vacances', name: 'Vacances', color: '#3f8fb0', monthlyExtra: 15000, isSavings: true },
] as const;
type EnvelopeKey = (typeof ENVELOPES)[number]['key'];

/** Marchands rangés par une règle de tri : motif, enveloppe, fourchette en euros, fréquence par mois. */
const SORTED_MERCHANTS: { pattern: string; label: string; envelope: EnvelopeKey; min: number; max: number; perMonth: number }[] = [
  { pattern: 'MONOPRIX', label: 'MONOPRIX PARIS 11', envelope: 'courses', min: 18, max: 64, perMonth: 4 },
  { pattern: 'LIDL', label: 'LIDL MONTREUIL', envelope: 'courses', min: 32, max: 88, perMonth: 2 },
  { pattern: 'BIOCOOP', label: 'BIOCOOP CHARONNE', envelope: 'courses', min: 14, max: 41, perMonth: 2 },
  { pattern: 'BOULANGERIE', label: 'BOULANGERIE DU MARCHE', envelope: 'courses', min: 3, max: 9, perMonth: 5 },
  { pattern: 'UBER', label: 'UBER TRIP HELP.UBER.COM', envelope: 'transports', min: 9, max: 24, perMonth: 1 },
  { pattern: 'SNCF', label: 'SNCF CONNECT', envelope: 'transports', min: 29, max: 74, perMonth: 0.5 },
  { pattern: 'DELIVEROO', label: 'DELIVEROO PARIS', envelope: 'sorties', min: 16, max: 31, perMonth: 2 },
  { pattern: 'UGC', label: 'UGC CINE CITE BERCY', envelope: 'sorties', min: 11, max: 23, perMonth: 1 },
  { pattern: 'BISTROT', label: 'LE BISTROT DES HALLES', envelope: 'sorties', min: 24, max: 58, perMonth: 2 },
  { pattern: 'PHARMACIE', label: 'PHARMACIE DE LA BASTILLE', envelope: 'sante', min: 6, max: 28, perMonth: 1 },
  { pattern: 'DECATHLON', label: 'DECATHLON PARIS', envelope: 'shopping', min: 19, max: 69, perMonth: 0.5 },
  { pattern: 'FNAC', label: 'FNAC BASTILLE', envelope: 'shopping', min: 14, max: 49, perMonth: 0.5 },
];

/** Charges fixes : libellé du relevé, montant, jour du mois. */
const FIXED: { name: string; label: string; envelope: EnvelopeKey; cents: number; day: number }[] = [
  { name: 'Loyer', label: 'VIREMENT POUR SCI LES TILLEULS LOYER', envelope: 'logement', cents: 89000, day: 5 },
  { name: 'Navigo', label: 'PRELEVEMENT DE COMUTITRES NAVIGO', envelope: 'transports', cents: 8820, day: 2 },
  { name: 'Électricité', label: 'PRELEVEMENT DE EDF CLIENTS PARTICULIERS', envelope: 'factures', cents: 6400, day: 24 },
  { name: 'Box internet', label: 'PRELEVEMENT DE BOUYGUES TELECOM', envelope: 'factures', cents: 2999, day: 9 },
  { name: 'Forfait mobile', label: 'PRELEVEMENT DE FREE MOBILE', envelope: 'abonnements', cents: 1599, day: 12 },
  { name: 'Spotify', label: 'PRELEVEMENT DE SPOTIFY AB', envelope: 'abonnements', cents: 1199, day: 22 },
  { name: 'Netflix', label: 'PRELEVEMENT DE NETFLIX.COM', envelope: 'abonnements', cents: 1349, day: 18 },
  { name: 'Mutuelle', label: 'PRELEVEMENT DE ALAN SA', envelope: 'sante', cents: 3150, day: 15 },
];
const SALARY = { label: 'VIREMENT DE ATELIER NORD SAS SALAIRE', cents: 268000, day: 28 };
const CAR_INSURANCE = { name: 'Assurance auto', label: 'PRELEVEMENT DE MAIF ASSURANCE AUTO', cents: 41200, day: 26 };

/** Marchands sans règle de tri : ils attendent dans « À ranger ». */
const UNSORTED: { label: string; min: number; max: number }[] = [
  { label: 'LA CAVE DE LOUIS', min: 18, max: 46 },
  { label: 'LEROY MERLIN IVRY', min: 23, max: 87 },
  { label: 'VINTED', min: 8, max: 34 },
  { label: 'RELAY GARE DE LYON', min: 4, max: 12 },
  { label: 'PAYPAL EUROPE STEAM', min: 9, max: 29 },
];

// --- Graines --------------------------------------------------------------

async function main() {
  const existing = await api<unknown[]>('GET', '/accounts');
  if (existing.length > 0) throw new Error('La base de recette contient déjà des comptes : repars d\'une base vide.');
  mkdirSync(OUT_DIR, { recursive: true });

  const courant = await api<{ id: number }>('POST', '/accounts', { name: 'Compte courant', initialBalance: 184000, onBudget: true });
  const livret = await api<{ id: number }>('POST', '/accounts', { name: 'Livret A', initialBalance: 642000, onBudget: false });

  const env = {} as Record<EnvelopeKey, number>;
  for (const e of ENVELOPES) {
    const created = await api<{ id: number }>('POST', '/envelopes', {
      name: e.name,
      color: e.color,
      monthlyExtra: 'monthlyExtra' in e ? e.monthlyExtra : null,
      isSavings: 'isSavings' in e ? e.isSavings : false,
    });
    env[e.key] = created.id;
  }

  for (const m of SORTED_MERCHANTS) await api('POST', '/sorting-rules', { pattern: m.pattern, envelopeId: env[m.envelope] });
  for (const f of FIXED) await api('POST', '/sorting-rules', { pattern: f.label.replace('PRELEVEMENT DE ', '').replace('VIREMENT POUR ', ''), envelopeId: env[f.envelope] });
  await api('POST', '/sorting-rules', { pattern: 'MAIF', envelopeId: env.transports });

  // Trois mois d'historique, jusqu'à avant-hier. Le relevé de démonstration couvre les trois derniers jours.
  const history: Row[] = [];
  const start = new Date(TODAY.getFullYear(), TODAY.getMonth() - 3, 1);
  const historyEnd = daysAgo(3);
  for (let d = new Date(start); d <= historyEnd; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    const day = date.getDate();
    for (const f of FIXED) {
      // L'occurrence de Netflix du mois en cours est prévue par sa règle : c'est la ligne rapprochée du relevé de démonstration.
      if (f.name === 'Netflix' && date.getMonth() === TODAY.getMonth()) continue;
      if (f.day === day) history.push({ date, label: f.label, cents: -f.cents });
    }
    if (day === SALARY.day) history.push({ date, label: SALARY.label, cents: SALARY.cents });
    if (day === 29) history.push({ date, label: 'VIREMENT POUR LIVRET A EPARGNE', cents: -20000 });
    for (const m of SORTED_MERCHANTS) {
      if (rand() < m.perMonth / 30) history.push({ date, label: card(date, m.label), cents: -between(m.min, m.max) });
    }
  }
  // Achats encore à ranger : uniquement ce mois-ci, comme une boîte de réception tenue à jour.
  for (const [i, u] of UNSORTED.slice(0, 3).entries()) {
    const date = daysAgo(5 + i * 3);
    history.push({ date, label: card(date, u.label), cents: -between(u.min, u.max) });
  }
  history.sort((a, b) => a.date.getTime() - b.date.getTime());

  await importCsv(lbpCsv(history, 0), 'releve-historique.csv', courant.id);

  // Charges fixes et salaire en règles récurrentes, à partir de ce mois-ci.
  // Au redémarrage, le serveur rattache à leur règle les prélèvements déjà importés et crée l'occurrence prévue de Netflix.
  for (const f of FIXED) {
    await api('POST', '/recurring-rules', {
      name: f.name,
      kind: 'expense',
      amount: f.cents,
      label: f.label,
      accountId: courant.id,
      envelopeId: env[f.envelope],
      frequency: 'monthly',
      dayOfMonth: f.day,
      startDate: dayOfMonth(f.day),
    });
  }
  await api('POST', '/recurring-rules', {
    name: CAR_INSURANCE.name,
    kind: 'expense',
    amount: CAR_INSURANCE.cents,
    label: CAR_INSURANCE.label,
    accountId: courant.id,
    envelopeId: env.transports,
    frequency: 'yearly',
    dayOfMonth: CAR_INSURANCE.day,
    startDate: dayOfMonth(CAR_INSURANCE.day),
  });
  await api('POST', '/recurring-rules', {
    name: 'Salaire',
    kind: 'income',
    amount: SALARY.cents,
    label: SALARY.label,
    accountId: courant.id,
    frequency: 'monthly',
    dayOfMonth: SALARY.day,
    startDate: dayOfMonth(SALARY.day),
  });
  await api('POST', '/recurring-rules', {
    name: 'Épargne mensuelle',
    kind: 'transfer',
    amount: 20000,
    label: 'VIREMENT POUR LIVRET A EPARGNE',
    accountId: courant.id,
    toAccountId: livret.id,
    frequency: 'monthly',
    dayOfMonth: 29,
    startDate: dayOfMonth(29),
  });

  // Budget réparti au premier de chaque mois, depuis le début de l'historique.
  const overview = await api<{ envelopes: { id: number; monthlyBudget: number }[] }>('GET', '/overview');
  for (let offset = -3; offset <= 0; offset++) {
    const date = dayOfMonth(1, offset);
    const month = new Date(TODAY.getFullYear(), TODAY.getMonth() + offset, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    for (const e of overview.envelopes) {
      if (e.monthlyBudget > 0) await api('POST', '/transactions', { kind: 'allocation', date, amount: e.monthlyBudget, label: `Budget ${month}`, envelopeId: e.id });
    }
  }

  // Relevé de démonstration : une ligne déjà importée (doublon), Netflix prévu (rapprochée), et du neuf.
  const last = history.filter((r) => r.label.startsWith('CARTE')).at(-1)!;
  const demo: Row[] = [
    last,
    { date: new Date(TODAY.getFullYear(), TODAY.getMonth(), 18), label: 'PRELEVEMENT DE NETFLIX.COM', cents: -1349 },
    { date: daysAgo(2), label: card(daysAgo(2), 'MONOPRIX PARIS 11'), cents: -4218 },
    { date: daysAgo(2), label: card(daysAgo(2), UNSORTED[3]!.label), cents: -680 },
    { date: daysAgo(1), label: card(daysAgo(1), 'BOULANGERIE DU MARCHE'), cents: -540 },
    { date: daysAgo(1), label: card(daysAgo(1), UNSORTED[4]!.label), cents: -1999 },
    { date: daysAgo(0), label: card(daysAgo(0), 'LE BISTROT DES HALLES'), cents: -3850 },
  ];
  writeFileSync(`${OUT_DIR}releve-demo.csv`, lbpCsv(demo, 0));

  // Positions d'Investir : les cours viennent de Yahoo Finance au premier affichage.
  await holding('trade_republic', 'SXR8.DE', 'iShares Core S&P 500', [[160, '4', 238000], [100, '1', 61500], [40, '1', 63800]]);
  await holding('trade_republic', 'EUNL.DE', 'iShares Core MSCI World', [[150, '12', 118000], [60, '4', 41900]]);
  await holding('trade_republic', 'AIR.PA', 'Airbus', [[120, '3', 50400]]);
  await holding('binance', 'BTC-EUR', 'Bitcoin', [[200, '0.012', 64000], [80, '0.004', 38500]]);

  console.log(`Base de recette prête. Relevé de démonstration : ${OUT_DIR}releve-demo.csv`);
  console.log('Relance le serveur pour créer l\'occurrence prévue de Netflix, puis importe le relevé de démonstration depuis l\'app.');

  async function importCsv(csv: string, fileName: string, accountId: number) {
    const form = new FormData();
    form.set('file', new File([csv], fileName, { type: 'text/csv' }));
    form.set('accountId', String(accountId));
    const preview = await api<{ rows: { status: string; index: number; date: string; label: string; signedAmount: number; fingerprint: string; plannedId: number | null; envelopeId: number | null; note: string | null; transferToAccountId: number | null }[]; bankAccountNumber: string | null }>(
      'POST',
      '/imports/preview',
      form,
    );
    const rows = preview.rows.filter((r) => r.status !== 'duplicate' && r.status !== 'internal');
    await api('POST', '/imports/commit', {
      fileName,
      accountId,
      bankAccountNumber: preview.bankAccountNumber,
      duplicateCount: preview.rows.length - rows.length,
      rows: rows.map(({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId, note, transferToAccountId }) => ({
        index,
        date,
        label,
        signedAmount,
        fingerprint,
        plannedId,
        envelopeId,
        note,
        transferToAccountId: transferToAccountId ?? (label.includes('LIVRET A') ? livret.id : null),
      })),
    });
  }

  async function holding(platform: string, ticker: string, name: string, trades: [number, string, number][]) {
    const [first, ...rest] = trades.map(([ago, quantity, amount]) => ({ side: 'buy', date: iso(daysAgo(ago)), quantity, amount, fees: platform === 'binance' ? 0 : 100 }));
    const created = await api<{ id: number }>('POST', '/invest/holdings', { platform, ticker, name, firstTrade: first });
    for (const t of rest) await api('POST', `/invest/holdings/${created.id}/trades`, t);
  }
}

await main();
