import { describe, expect, it } from 'vitest';
import {
  detectConsentExpiring,
  detectMissingCharges,
  detectNewRecurring,
  detectPriceChanges,
  detectSyncErrors,
  detectUnusualExpenses,
  type SyncErrorConnectionInfo,
} from './signals';
import { resetIds, rule, tx } from './test-fixtures';

const TODAY = '2026-10-10';

describe('detectUnusualExpenses', () => {
  it('signale une dépense d’au moins 100 € et 2,5 fois la médiane de 3 dépenses passées ou plus', () => {
    resetIds();
    const history = [
      tx({ kind: 'expense', amount: 40_00, date: '2026-09-01', merchantKey: 'FNAC', merchantName: 'Fnac' }),
      tx({ kind: 'expense', amount: 42_00, date: '2026-09-10', merchantKey: 'FNAC', merchantName: 'Fnac' }),
      tx({ kind: 'expense', amount: 38_00, date: '2026-09-20', merchantKey: 'FNAC', merchantName: 'Fnac' }),
    ];
    const unusual = tx({ kind: 'expense', amount: 100_00, date: '2026-10-05', merchantKey: 'FNAC', merchantName: 'Fnac' });
    const signals = detectUnusualExpenses([...history, unusual], TODAY);
    expect(signals).toEqual([{ kind: 'unusual_expense', key: `unusual:${unusual.id}`, payload: { transactionId: unusual.id, merchantName: 'Fnac', amount: 100_00, median: 40_00, date: '2026-10-05' } }]);
  });

  it('n’est pas sûr avec seulement 2 dépenses passées, même si le montant est très au-dessus', () => {
    resetIds();
    const history = [
      tx({ kind: 'expense', amount: 40_00, date: '2026-09-01', merchantKey: 'FNAC' }),
      tx({ kind: 'expense', amount: 42_00, date: '2026-09-10', merchantKey: 'FNAC' }),
    ];
    const candidate = tx({ kind: 'expense', amount: 200_00, date: '2026-10-05', merchantKey: 'FNAC' });
    expect(detectUnusualExpenses([...history, candidate], TODAY)).toEqual([]);
  });

  it('un montant pile au seuil (ratio 2,5 exact et 100 €) déclenche le signal', () => {
    resetIds();
    const history = [
      tx({ kind: 'expense', amount: 40_00, date: '2026-09-01', merchantKey: 'FNAC' }),
      tx({ kind: 'expense', amount: 40_00, date: '2026-09-10', merchantKey: 'FNAC' }),
      tx({ kind: 'expense', amount: 40_00, date: '2026-09-20', merchantKey: 'FNAC' }),
    ];
    const candidate = tx({ kind: 'expense', amount: 100_00, date: '2026-10-05', merchantKey: 'FNAC' });
    expect(detectUnusualExpenses([...history, candidate], TODAY)).toHaveLength(1);
  });

  it('150 € chez un marchand jamais vu déclenche le signal, sans médiane', () => {
    resetIds();
    const first = tx({ kind: 'expense', amount: 150_00, date: '2026-10-01', merchantKey: 'NOUVEAU', merchantName: 'Nouveau' });
    expect(detectUnusualExpenses([first], TODAY)).toEqual([
      { kind: 'unusual_expense', key: `unusual:${first.id}`, payload: { transactionId: first.id, merchantName: 'Nouveau', amount: 150_00, median: null, date: '2026-10-01' } },
    ]);
  });

  it('149,99 € chez un marchand jamais vu ne déclenche rien', () => {
    resetIds();
    const first = tx({ kind: 'expense', amount: 149_99, date: '2026-10-01', merchantKey: 'NOUVEAU' });
    expect(detectUnusualExpenses([first], TODAY)).toEqual([]);
  });

  it('ignore une dépense hors de la fenêtre de 45 jours, même si elle est inhabituelle', () => {
    resetIds();
    const history = [
      tx({ kind: 'expense', amount: 40_00, date: '2026-01-01', merchantKey: 'FNAC' }),
      tx({ kind: 'expense', amount: 40_00, date: '2026-01-05', merchantKey: 'FNAC' }),
      tx({ kind: 'expense', amount: 40_00, date: '2026-01-10', merchantKey: 'FNAC' }),
    ];
    const old = tx({ kind: 'expense', amount: 200_00, date: '2026-01-15', merchantKey: 'FNAC' });
    expect(detectUnusualExpenses([...history, old], TODAY)).toEqual([]);
  });

  it('ignore les opérations prévues et sans marchand', () => {
    resetIds();
    const planned = tx({ kind: 'expense', amount: 300_00, date: '2026-10-01', merchantKey: 'FNAC', status: 'planned' });
    const noKey = tx({ kind: 'expense', amount: 300_00, date: '2026-10-01', merchantKey: null });
    expect(detectUnusualExpenses([planned, noKey], TODAY)).toEqual([]);
  });
});

describe('detectNewRecurring', () => {
  const regular = () => [
    tx({ kind: 'expense', amount: 9_99, date: '2026-08-12', merchantKey: 'NETFLIX', merchantName: 'Netflix', envelopeId: 7 }),
    tx({ kind: 'expense', amount: 9_99, date: '2026-09-10', merchantKey: 'NETFLIX', merchantName: 'Netflix', envelopeId: 7 }),
    tx({ kind: 'expense', amount: 9_99, date: '2026-10-08', merchantKey: 'NETFLIX', merchantName: 'Netflix', envelopeId: 7 }),
  ];

  it('3 dépenses mensuelles consécutives, montants proches, sans règle qui couvre : signale', () => {
    resetIds();
    const txs = regular();
    expect(detectNewRecurring(txs, [], TODAY)).toEqual([
      { kind: 'new_recurring', key: 'recurring:NETFLIX', payload: { merchantKey: 'NETFLIX', merchantName: 'Netflix', amount: 9_99, envelopeId: 7, dayOfMonth: 8 } },
    ]);
  });

  it('un écart de 24 jours (sous le minimum de 25) ne forme pas une régularité', () => {
    resetIds();
    const txs = [
      tx({ kind: 'expense', amount: 9_99, date: '2026-08-12', merchantKey: 'NETFLIX' }),
      tx({ kind: 'expense', amount: 9_99, date: '2026-09-05', merchantKey: 'NETFLIX' }),
      tx({ kind: 'expense', amount: 9_99, date: '2026-09-29', merchantKey: 'NETFLIX' }),
    ];
    expect(detectNewRecurring(txs, [], TODAY)).toEqual([]);
  });

  it('une charge fixe active couvrant le marchand écarte le signal', () => {
    resetIds();
    const txs = regular();
    const covering = rule({ kind: 'expense', amount: 9_99, label: 'Netflix', active: true });
    expect(detectNewRecurring(txs, [covering], TODAY)).toEqual([]);
  });

  it('une opération déjà rapprochée d’une règle écarte le signal', () => {
    resetIds();
    const txs = regular();
    txs[2]!.recurringRuleId = 42;
    expect(detectNewRecurring(txs, [], TODAY)).toEqual([]);
  });

  it('la dernière occurrence hors fenêtre de 45 jours n’est pas signalée', () => {
    resetIds();
    const txs = [
      tx({ kind: 'expense', amount: 9_99, date: '2026-01-12', merchantKey: 'NETFLIX' }),
      tx({ kind: 'expense', amount: 9_99, date: '2026-02-10', merchantKey: 'NETFLIX' }),
      tx({ kind: 'expense', amount: 9_99, date: '2026-03-08', merchantKey: 'NETFLIX' }),
    ];
    expect(detectNewRecurring(txs, [], TODAY)).toEqual([]);
  });

  it('un montant qui s’écarte de plus de 10 % de la médiane écarte le signal', () => {
    resetIds();
    const txs = [
      tx({ kind: 'expense', amount: 10_00, date: '2026-08-12', merchantKey: 'NETFLIX' }),
      tx({ kind: 'expense', amount: 10_00, date: '2026-09-10', merchantKey: 'NETFLIX' }),
      tx({ kind: 'expense', amount: 15_00, date: '2026-10-08', merchantKey: 'NETFLIX' }),
    ];
    expect(detectNewRecurring(txs, [], TODAY)).toEqual([]);
  });
});

describe('detectPriceChanges', () => {
  it('une opération rapprochée d’une règle dont le montant diffère d’au moins 1 € et 3 % : signale', () => {
    resetIds();
    const r = rule({ kind: 'expense', amount: 10_00, label: 'Salle' });
    const t = tx({ kind: 'expense', amount: 11_00, date: '2026-10-05', recurringRuleId: r.id });
    expect(detectPriceChanges([t], [r], TODAY)).toEqual([
      { kind: 'price_change', key: `price:${r.id}:1100`, payload: { ruleId: r.id, ruleName: r.name, oldAmount: 10_00, newAmount: 11_00, transactionId: t.id, rule: r } },
    ]);
  });

  it('un écart de moins de 1 € n’est pas signalé même si c’est plus de 3 %', () => {
    resetIds();
    const r = rule({ kind: 'expense', amount: 10_00, label: 'Salle' });
    const t = tx({ kind: 'expense', amount: 10_50, date: '2026-10-05', recurringRuleId: r.id });
    expect(detectPriceChanges([t], [r], TODAY)).toEqual([]);
  });

  it('un écart de 1 € mais moins de 3 % n’est pas signalé', () => {
    resetIds();
    const r = rule({ kind: 'expense', amount: 100_00, label: 'Assurance' });
    const t = tx({ kind: 'expense', amount: 101_00, date: '2026-10-05', recurringRuleId: r.id });
    expect(detectPriceChanges([t], [r], TODAY)).toEqual([]);
  });

  it('une opération prévue (non confirmée) n’est pas comptée', () => {
    resetIds();
    const r = rule({ kind: 'expense', amount: 10_00, label: 'Salle' });
    const t = tx({ kind: 'expense', amount: 20_00, date: '2026-10-05', recurringRuleId: r.id, status: 'planned' });
    expect(detectPriceChanges([t], [r], TODAY)).toEqual([]);
  });
});

describe('detectMissingCharges', () => {
  it('une prévue en retard de plus de 5 jours est signalée', () => {
    resetIds();
    const t = tx({ kind: 'expense', amount: 80000, date: '2026-10-01', status: 'planned', recurringRuleId: 3, label: 'Loyer' });
    expect(detectMissingCharges([t], TODAY)).toEqual([
      { kind: 'missing_charge', key: `missing:${t.id}`, payload: { transactionId: t.id, label: 'Loyer', amount: 80000, date: '2026-10-01', txKind: 'expense' } },
    ]);
  });

  it('une prévue en retard de pile 5 jours n’est pas encore signalée', () => {
    resetIds();
    const t = tx({ kind: 'expense', amount: 80000, date: '2026-10-05', status: 'planned', recurringRuleId: 3 });
    expect(detectMissingCharges([t], TODAY)).toEqual([]);
  });

  it('ignore les transferts et répartitions, et les opérations sans règle', () => {
    resetIds();
    const transfer = tx({ kind: 'transfer', amount: 1000, date: '2026-09-01', status: 'planned', recurringRuleId: 1 });
    const noRule = tx({ kind: 'expense', amount: 1000, date: '2026-09-01', status: 'planned', recurringRuleId: null });
    expect(detectMissingCharges([transfer, noRule], TODAY)).toEqual([]);
  });
});

describe('detectConsentExpiring', () => {
  it('un consentement actif qui expire dans moins de 14 jours est signalé', () => {
    const connections = [{ id: 1, aspspName: 'La Banque Postale', status: 'active', validUntil: '2026-10-20T00:00:00.000Z' }];
    expect(detectConsentExpiring(connections, TODAY)).toEqual([
      { kind: 'consent_expiring', key: 'consent:1:2026-10-20T00:00:00.000Z', payload: { connectionId: 1, aspspName: 'La Banque Postale', validUntil: '2026-10-20T00:00:00.000Z' } },
    ]);
  });

  it('un consentement qui expire dans 14 jours pile n’est pas encore signalé', () => {
    const connections = [{ id: 1, aspspName: 'La Banque Postale', status: 'active', validUntil: '2026-10-24T00:00:00.000Z' }];
    expect(detectConsentExpiring(connections, TODAY)).toEqual([]);
  });

  it('ignore les connexions révoquées ou en attente', () => {
    const connections = [{ id: 1, aspspName: 'LBP', status: 'revoked', validUntil: '2026-10-11T00:00:00.000Z' }];
    expect(detectConsentExpiring(connections, TODAY)).toEqual([]);
  });
});

describe('detectSyncErrors', () => {
  const base: SyncErrorConnectionInfo = {
    id: 1,
    aspspName: 'La Banque Postale',
    status: 'active',
    lastError: 'Réseau indisponible',
    consecutiveFailures: 0,
    lastSuccessAt: null,
    firstFailureAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
  };
  const now = new Date('2026-10-10T12:00:00.000Z');

  it('2 échecs consécutifs déclenchent le signal', () => {
    const c = { ...base, consecutiveFailures: 2, lastSuccessAt: '2026-10-10T00:00:00.000Z', firstFailureAt: '2026-10-10T06:00:00.000Z' };
    expect(detectSyncErrors([c], now)).toEqual([
      { kind: 'sync_error', key: `sync:1:2026-10-10T06:00:00.000Z`, payload: { connectionId: 1, aspspName: 'La Banque Postale', lastError: 'Réseau indisponible' } },
    ]);
  });

  it('1 seul échec récent (moins de 24 h sans succès) ne déclenche rien', () => {
    const c = { ...base, consecutiveFailures: 1, lastSuccessAt: '2026-10-10T00:00:00.000Z', firstFailureAt: '2026-10-10T06:00:00.000Z' };
    expect(detectSyncErrors([c], now)).toEqual([]);
  });

  it('1 seul échec mais plus de 24 h sans synchro réussie déclenche le signal', () => {
    const c = { ...base, consecutiveFailures: 1, lastSuccessAt: '2026-10-08T00:00:00.000Z', firstFailureAt: '2026-10-09T00:00:00.000Z' };
    expect(detectSyncErrors([c], now)).toEqual([
      { kind: 'sync_error', key: `sync:1:2026-10-09T00:00:00.000Z`, payload: { connectionId: 1, aspspName: 'La Banque Postale', lastError: 'Réseau indisponible' } },
    ]);
  });

  it('pas d’erreur en cours : rien à signaler', () => {
    const c = { ...base, lastError: null };
    expect(detectSyncErrors([c], now)).toEqual([]);
  });
});
