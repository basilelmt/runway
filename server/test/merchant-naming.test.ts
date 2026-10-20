import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { merchants } from '../src/db/schema';
import { getMerchant, renameMerchant } from '../src/repos/merchants';
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

/** Laisse passer le `setImmediate` qui diffère le vrai démarrage de `request()`. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Clés demandées dans le prompt, dans l'ordre (le prompt est le dernier argument). */
function askedKeys(args: string[]): string[] {
  return [...args.at(-1)!.matchAll(/clé "([^"]+)"/g)].map((m) => m[1]!);
}

/** Faux Claude qui nomme et décrit chaque clé demandée par des fonctions du test. */
function namingExec(nameOf: (key: string) => string, describe: (key: string) => string = () => '') {
  return vi.fn<Exec>(async (args) => ok({ names: askedKeys(args).map((key) => ({ key, name: nameOf(key), description: describe(key) })) }));
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
    renameMerchant(ctx.db, 'LIBRAIRIE', { name: 'Librairie du Centre', description: 'Librairie' }, '2026-03-12');
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
      renameMerchant(ctx.db, 'CAFE DU PORT', { name: 'Mon café' }, '2026-03-12');
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

  it('un marchand jamais nommé par Claude ne prive pas les suivants, moins fréquents, du même run', async () => {
    // 150 clés très fréquentes que Claude ne nomme jamais (simulation d'un oubli répété), plus une clé rare qu'il nomme bien.
    for (let i = 0; i < MERCHANT_BATCH_SIZE; i++) {
      expense(`ACHAT CB MAGASIN ${i}`);
      expense(`ACHAT CB MAGASIN ${i}`);
    }
    expense('ACHAT CB LIBRAIRIE RARE');
    const exec = vi.fn<Exec>(async (args) => ok({ names: askedKeys(args).filter((key) => key === 'LIBRAIRIE RARE').map((key) => ({ key, name: 'Librairie Rare' })) }));

    expect(await nameMerchants(ctx.db, { exec })).toBe(1);

    expect(exec).toHaveBeenCalledTimes(2);
    expect(askedKeys(exec.mock.calls[0]![0])).toHaveLength(MERCHANT_BATCH_SIZE);
    expect(askedKeys(exec.mock.calls[0]![0])).not.toContain('LIBRAIRIE RARE');
    expect(askedKeys(exec.mock.calls[1]![0])).toEqual(['LIBRAIRIE RARE']);
    expect(merchant('LIBRAIRIE RARE')).toMatchObject({ name: 'Librairie Rare', source: 'claude' });
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

  it('décrit les marchands, y compris ceux déjà nommés, sans toucher aux noms ni aux descriptions web ou utilisateur', async () => {
    expense('ACHAT CB CAFE DU PORT');
    expense('ACHAT CB LIBRAIRIE');
    expense('ACHAT CB BK K0010 PARIS');
    expense('ACHAT CB INCONNU XZ');
    renameMerchant(ctx.db, 'LIBRAIRIE', { name: 'Librairie du Centre' }, '2026-03-12');
    renameMerchant(ctx.db, 'CAFE DU PORT', { name: 'Café du Port', description: 'Bar-tabac' }, '2026-03-12');
    const exec = namingExec(
      (key) => key,
      (key) => ({ 'CAFE DU PORT': 'Café', LIBRAIRIE: 'Librairie', 'BK K PARIS': 'Chaîne de fast-food, Paris', 'INCONNU XZ': '' })[key] ?? '',
    );

    await nameMerchants(ctx.db, { exec });

    const prompt = exec.mock.calls[0]![0].at(-1)!;
    expect(prompt).toContain('ne jamais deviner');
    // Café du Port a déjà nom et description utilisateur : rien à demander.
    expect(askedKeys(exec.mock.calls[0]![0]).sort()).toEqual(['BK K PARIS', 'INCONNU XZ', 'LIBRAIRIE']);
    expect(merchant('LIBRAIRIE')).toMatchObject({ name: 'Librairie du Centre', source: 'user', description: 'Librairie', descriptionSource: 'claude' });
    expect(merchant('CAFE DU PORT')).toMatchObject({ description: 'Bar-tabac', descriptionSource: 'user' });
    expect(merchant('BK K PARIS')).toMatchObject({ description: 'Chaîne de fast-food, Paris', descriptionSource: 'claude' });
    expect(merchant('INCONNU XZ')).toMatchObject({ description: null, descriptionSource: null });
    expect(merchant('INCONNU XZ')!.describedAt).not.toBeNull();

    // Second tour : tout est essayé, plus rien à demander.
    exec.mockClear();
    await nameMerchants(ctx.db, { exec });
    expect(exec).not.toHaveBeenCalled();
  });

  it('une description trop longue est ignorée mais compte comme essayée', async () => {
    expense('ACHAT CB CAFE DU PORT');
    await nameMerchants(ctx.db, { exec: namingExec(() => 'Café du Port', () => 'x'.repeat(141)) });
    expect(merchant('CAFE DU PORT')).toMatchObject({ description: null, descriptionSource: null });
    expect(merchant('CAFE DU PORT')!.describedAt).not.toBeNull();
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
    await tick();
    expect(exec).toHaveBeenCalledTimes(1);
    release();
    await namer.idle();
    expect(exec).toHaveBeenCalledTimes(2);
    expect(namer.status().running).toBe(false);
  });
});

describe('getMerchant', () => {
  it('garde les accents d’un libellé saisi à la main pour le nom de repli', () => {
    expense('Café de Léa');

    expect(getMerchant(ctx.db, 'CAFE DE LEA', '2026-03-12').name).toBe('Café de Léa');
  });
});
