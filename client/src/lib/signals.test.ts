import { describe, expect, it } from 'vitest';
import type { AnySignal } from '@shared/api-types';
import { signalHref, signalPhrase } from './signals';

describe('signalPhrase', () => {
  it('dépense inhabituelle avec médiane : montant et multiple', () => {
    const s: AnySignal = { id: 1, kind: 'unusual_expense', key: 'unusual:1', createdAt: '', dismissedAt: null, resolvedAt: null, payload: { transactionId: 1, merchantName: 'Fnac', amount: 389_00, median: 97_25, date: '2026-10-01' } };
    expect(signalPhrase(s)).toBe('Fnac : 389,00 €, 4 fois ta dépense habituelle');
  });

  it('dépense inhabituelle sans historique (marchand jamais vu)', () => {
    const s: AnySignal = { id: 1, kind: 'unusual_expense', key: 'unusual:1', createdAt: '', dismissedAt: null, resolvedAt: null, payload: { transactionId: 1, merchantName: 'Darty', amount: 180_00, median: null, date: '2026-10-01' } };
    expect(signalPhrase(s)).toBe('Darty : 180,00 €, jamais vu chez ce marchand');
  });

  it('multiple non entier affiché avec une décimale et une virgule', () => {
    const s: AnySignal = { id: 1, kind: 'unusual_expense', key: 'unusual:1', createdAt: '', dismissedAt: null, resolvedAt: null, payload: { transactionId: 1, merchantName: 'Fnac', amount: 100_00, median: 40_00, date: '2026-10-01' } };
    expect(signalPhrase(s)).toBe('Fnac : 100,00 €, 2,5 fois ta dépense habituelle');
  });

  it('nouveau prélèvement régulier', () => {
    const s: AnySignal = { id: 1, kind: 'new_recurring', key: 'recurring:NETFLIX', createdAt: '', dismissedAt: null, resolvedAt: null, payload: { merchantKey: 'NETFLIX', merchantName: 'Netflix', amount: 9_99, envelopeId: null, dayOfMonth: 8 } };
    expect(signalPhrase(s)).toBe('Netflix revient tous les mois, autour de 9,99 €');
  });

  it('changement de montant d’une charge', () => {
    const s: AnySignal = { id: 1, kind: 'price_change', key: 'price:1:1100', createdAt: '', dismissedAt: null, resolvedAt: null, payload: { ruleId: 1, ruleName: 'Salle de sport', oldAmount: 10_00, newAmount: 11_00, transactionId: 1, rule: {} as never } };
    expect(signalPhrase(s)).toBe('Salle de sport passe de 10,00 € à 11,00 €');
  });

  it('charge pas arrivée', () => {
    const s: AnySignal = { id: 1, kind: 'missing_charge', key: 'missing:1', createdAt: '', dismissedAt: null, resolvedAt: null, payload: { transactionId: 1, label: 'Loyer', amount: 800_00, date: '2026-10-01', txKind: 'expense' } };
    expect(signalPhrase(s)).toBe('Loyer de 800,00 € prévu le 1 oct. n’est pas arrivé');
  });

  it('consentement bientôt expiré', () => {
    const s: AnySignal = { id: 1, kind: 'consent_expiring', key: 'consent:1:x', createdAt: '', dismissedAt: null, resolvedAt: null, payload: { connectionId: 1, aspspName: 'La Banque Postale', validUntil: '2026-10-20T00:00:00.000Z' } };
    expect(signalPhrase(s)).toBe('L’accès à La Banque Postale expire le 20 oct.');
  });

  it('synchro en échec, avec la cause', () => {
    const s: AnySignal = { id: 1, kind: 'sync_error', key: 'sync:1:x', createdAt: '', dismissedAt: null, resolvedAt: null, payload: { connectionId: 1, aspspName: 'La Banque Postale', lastError: 'Réseau indisponible' } };
    expect(signalPhrase(s)).toBe('La synchronisation La Banque Postale est en échec : Réseau indisponible');
  });
});

describe('signalHref', () => {
  it('dépense inhabituelle et charge manquante renvoient vers les opérations, synchro en échec vers les réglages', () => {
    const unusual: AnySignal = { id: 1, kind: 'unusual_expense', key: 'u', createdAt: '', dismissedAt: null, resolvedAt: null, payload: { transactionId: 1, merchantName: 'Fnac', amount: 1, median: null, date: '2026-10-01' } };
    expect(signalHref(unusual)).toBe('/operations?q=Fnac&period=all');

    const missing: AnySignal = { id: 1, kind: 'missing_charge', key: 'm', createdAt: '', dismissedAt: null, resolvedAt: null, payload: { transactionId: 1, label: 'Loyer', amount: 1, date: '2026-10-01', txKind: 'expense' } };
    expect(signalHref(missing)).toBe('/operations?status=planned&period=all');

    const sync: AnySignal = { id: 1, kind: 'sync_error', key: 's', createdAt: '', dismissedAt: null, resolvedAt: null, payload: { connectionId: 1, aspspName: 'LBP', lastError: null } };
    expect(signalHref(sync)).toBe('/reglages/banque');
  });

  it('les autres types n’ont pas de lien (action par bouton)', () => {
    const newRecurring: AnySignal = { id: 1, kind: 'new_recurring', key: 'r', createdAt: '', dismissedAt: null, resolvedAt: null, payload: { merchantKey: 'X', merchantName: 'X', amount: 1, envelopeId: null, dayOfMonth: 1 } };
    expect(signalHref(newRecurring)).toBeNull();
  });
});
