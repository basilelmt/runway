import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exec, ExecResult } from '../src/services/claude';
import { createTestApp, type TestApp } from './helpers';

const ok = (structured: unknown): ExecResult => ({ stdout: JSON.stringify({ is_error: false, result: 'ok', structured_output: structured }), stderr: '', exitCode: 0 });
const path = (key: string) => `/api/merchants/${encodeURIComponent(key)}/describe`;

describe('POST /api/merchants/:key/describe', () => {
  let t: TestApp;
  let exec: ReturnType<typeof vi.fn<Exec>>;
  beforeEach(async () => {
    exec = vi.fn<Exec>(async () => ok({ description: 'Boutique de vêtements, Paris (3e)' }));
    t = createTestApp('2026-03-12', { exec });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-02', amount: 42_00, label: 'ACHAT CB SC-FOURTEEN CA 15.10.26 CARTE NUMERO 089', accountId: t.courant.id });
  });

  it('cherche sur le web avec la clé et les libellés seulement, et garde le résultat', async () => {
    const res = await t.call('POST', path('SC-FOURTEEN CA'));
    expect(res.body).toMatchObject({ description: 'Boutique de vêtements, Paris (3e)', descriptionSource: 'web' });
    const args = exec.mock.calls[0]![0];
    expect(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2)).toEqual(['--tools', 'WebSearch,WebFetch']);
    const prompt = args.at(-1)!;
    expect(prompt).toContain('SC-FOURTEEN CA');
    expect(prompt).not.toContain('42');
    expect(prompt).not.toContain('2026-03-02');
    expect(exec.mock.calls[0]![1]).toBe(120_000);
  });

  it('rien trouvé : description nulle, essai noté', async () => {
    exec.mockResolvedValueOnce(ok({ description: '  ' }));
    const res = await t.call('POST', path('SC-FOURTEEN CA'));
    expect(res.body).toMatchObject({ description: null, descriptionSource: 'web' });
    expect(res.body.describedAt).not.toBeNull();
  });

  it('dédoublonne deux appels simultanés', async () => {
    const [a, b] = await Promise.all([t.call('POST', path('SC-FOURTEEN CA')), t.call('POST', path('SC-FOURTEEN CA'))]);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(a.body).toEqual(b.body);
  });

  it('ne remplace pas une description de l’utilisateur', async () => {
    await t.call('PUT', `/api/merchants/${encodeURIComponent('SC-FOURTEEN CA')}`, { name: 'SC-Fourteen', description: 'Friperie' });
    const res = await t.call('POST', path('SC-FOURTEEN CA'));
    expect(res.status).toBe(409);
    expect(exec).not.toHaveBeenCalled();
  });

  it('propage une erreur de Claude', async () => {
    exec.mockResolvedValueOnce({ stdout: '', stderr: 'ENOENT', exitCode: 127 });
    const res = await t.call('POST', path('SC-FOURTEEN CA'));
    expect(res.status).toBe(503);
  });

  it('404 pour une clé inconnue', async () => {
    expect((await t.call('POST', path('INCONNU'))).status).toBe(404);
  });
});
