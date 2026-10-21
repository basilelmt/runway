import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exec, ExecResult } from '../src/services/claude';
import { createTestApp, type TestApp } from './helpers';

const ok = (structured: unknown): ExecResult => ({ stdout: JSON.stringify({ is_error: false, result: 'ok', structured_output: structured }), stderr: '', exitCode: 0 });
const path = (key: string) => `/api/merchants/${encodeURIComponent(key)}/describe`;
/** Laisse passer la recherche web lancée en fond, sans dépendre d'un vrai délai. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('POST /api/merchants/:key/describe', () => {
  let t: TestApp;
  let exec: ReturnType<typeof vi.fn<Exec>>;
  beforeEach(async () => {
    exec = vi.fn<Exec>(async () => ok({ description: 'Boutique de vêtements, Paris (3e)' }));
    t = createTestApp('2026-03-12', { exec });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-02', amount: 42_00, label: 'ACHAT CB SC-FOURTEEN CA 15.10.26 CARTE NUMERO 089', accountId: t.courant.id });
  });

  it('répond tout de suite avec la tâche, puis écrit la description et finit la tâche', async () => {
    const res = await t.call('POST', path('SC-FOURTEEN CA'));
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ kind: 'merchant_web', status: 'running', subject: 'SC-FOURTEEN CA', label: 'Claude cherche Sc-Fourteen Ca sur le web' });

    const args = exec.mock.calls[0]![0];
    expect(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2)).toEqual(['--tools', 'WebSearch,WebFetch']);
    const prompt = args.at(-1)!;
    expect(prompt).toContain('SC-FOURTEEN CA');
    expect(prompt).not.toContain('42');
    expect(prompt).not.toContain('2026-03-02');
    expect(exec.mock.calls[0]![1]).toBe(120_000);

    await settle();
    expect((await t.call('GET', `/api/merchants/${encodeURIComponent('SC-FOURTEEN CA')}`)).body).toMatchObject({ description: 'Boutique de vêtements, Paris (3e)', descriptionSource: 'web' });
    expect((await t.call('GET', '/api/claude/tasks')).body).toMatchObject([{ status: 'done', result: 'Boutique de vêtements, Paris (3e)' }]);
  });

  it('rien trouvé : description nulle, « Rien trouvé sur le web » comme résultat de la tâche', async () => {
    exec.mockResolvedValueOnce(ok({ description: '  ' }));
    await t.call('POST', path('SC-FOURTEEN CA'));
    await settle();

    const merchant = (await t.call('GET', `/api/merchants/${encodeURIComponent('SC-FOURTEEN CA')}`)).body;
    expect(merchant).toMatchObject({ description: null, descriptionSource: 'web' });
    expect(merchant.describedAt).not.toBeNull();
    expect((await t.call('GET', '/api/claude/tasks')).body).toMatchObject([{ status: 'done', result: 'Rien trouvé sur le web' }]);
  });

  it('dédoublonne deux appels simultanés : même tâche, un seul appel à Claude', async () => {
    const [a, b] = await Promise.all([t.call('POST', path('SC-FOURTEEN CA')), t.call('POST', path('SC-FOURTEEN CA'))]);
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    expect(a.body.id).toBe(b.body.id);
    await settle();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('ne remplace pas une description de l’utilisateur, et n’ouvre pas de tâche', async () => {
    await t.call('PUT', `/api/merchants/${encodeURIComponent('SC-FOURTEEN CA')}`, { name: 'SC-Fourteen', description: 'Friperie' });
    const res = await t.call('POST', path('SC-FOURTEEN CA'));
    expect(res.status).toBe(409);
    expect(exec).not.toHaveBeenCalled();
    expect((await t.call('GET', '/api/claude/tasks')).body).toEqual([]);
  });

  it('propage une erreur de Claude à la tâche', async () => {
    exec.mockResolvedValueOnce({ stdout: '', stderr: 'ENOENT', exitCode: 127 });
    const res = await t.call('POST', path('SC-FOURTEEN CA'));
    expect(res.status).toBe(202);
    await settle();
    expect((await t.call('GET', '/api/claude/tasks')).body).toMatchObject([{ status: 'failed', error: expect.stringContaining('introuvable') }]);
  });

  it('404 pour une clé inconnue', async () => {
    expect((await t.call('POST', path('INCONNU'))).status).toBe(404);
  });
});
