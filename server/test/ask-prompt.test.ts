import { describe, expect, it } from 'vitest';
import { buildAskSystemPrompt } from '../src/ask/prompt';

describe('buildAskSystemPrompt', () => {
  it('décrit les marchands et invite à regrouper par nom de marchand', () => {
    const p = buildAskSystemPrompt({ today: '2026-10-08', overview: { toAllocate: 0, unsortedCount: 0, accounts: [], envelopes: [] } });
    expect(p).toContain('recurring_rule_id, merchant_key)');
    expect(p).toContain('merchants(key, name, source)');
    expect(p).toContain('COALESCE(merchants.name, transactions.label)');
  });

  it('donne le résumé du mois avec les chiffres de l’Accueil', () => {
    const p = buildAskSystemPrompt({
      today: '2026-10-08',
      overview: {
        toAllocate: -9_61,
        unsortedCount: 3,
        accounts: [
          { id: 1, name: 'Courant', onBudget: true, balance: 1234_56 },
          { id: 2, name: 'Livret A', onBudget: false, balance: 5000_00 },
        ],
        envelopes: [
          { id: 4, name: 'Restos', isSavings: false, monthlyBudget: 180_00, monthlyCharges: 0, allocatedThisMonth: 180_00, spentThisMonth: 92_40, balance: 87_60 },
          { id: 5, name: 'Logement', isSavings: false, monthlyBudget: 900_00, monthlyCharges: 850_00, allocatedThisMonth: 900_00, spentThisMonth: 850_00, balance: 50_00 },
          { id: 6, name: 'Mis de côté', isSavings: true, monthlyBudget: 300_00, monthlyCharges: 0, allocatedThisMonth: 300_00, spentThisMonth: 0, balance: 3700_00 },
        ],
      },
    });
    expect(p).toContain('À répartir : -9,61 €');
    expect(p).toContain('Opérations à ranger : 3');
    expect(p).toContain('- 4 : Restos, budget 180,00 €, réparti 180,00 €, dépensé 92,40 €, disponible 87,60 €\n');
    expect(p).toContain('- 5 : Logement, budget 900,00 € (dont 850,00 € de charges fixes), réparti 900,00 €, dépensé 850,00 €, disponible 50,00 €');
    expect(p).toContain('- 6 : Mis de côté, budget 300,00 €, réparti 300,00 €, dépensé 0,00 €, disponible 3 700,00 € [épargne]');
    expect(p).toContain('- 1 : Courant, 1 234,56 €\n');
    expect(p).toContain('- 2 : Livret A, 5 000,00 € [hors budget]');
  });

  it('oriente vers les chiffres de l’app, cadre la recherche web et ne cite aucune table interdite', () => {
    const p = buildAskSystemPrompt({ today: '2026-10-08', overview: { toAllocate: 0, unsortedCount: 0, accounts: [], envelopes: [] } });
    expect(p).toContain('month_summary');
    expect(p).toContain('WebSearch');
    for (const table of ['settings', 'bank_accounts', 'bank_connections']) expect(p).not.toContain(table);
  });

  it('décrit les tables d’Investir et renvoie vers les outils portfolio et ideas plutôt que le SQL', () => {
    const p = buildAskSystemPrompt({ today: '2026-10-08', overview: { toAllocate: 0, unsortedCount: 0, accounts: [], envelopes: [] } });
    expect(p).toContain('holdings(id, platform, ticker, name, source');
    expect(p).toContain('holding_trades(id, holding_id -> holdings, side');
    expect(p).toContain('prices(ticker, date, close, currency, fetched_at)');
    expect(p).toContain("appelle l'outil portfolio ou l'outil ideas plutôt que de recalculer en SQL");
    expect(p).toContain('une idée est un suivi théorique, équipondéré');
  });

  it('explique le format du contexte d’écran et des blocs désignés', () => {
    const p = buildAskSystemPrompt({ today: '2026-10-08', overview: { toAllocate: 0, unsortedCount: 0, accounts: [], envelopes: [] } });
    expect(p).toContain('[Contexte : écran X]');
    expect(p).toContain('[Bloc désigné : <libellé> (<genre>)]');
    expect(p).toContain('[Question]');
  });
});
