import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MerchantStatus } from '@shared/api-types';
import { useMerchantNamingSync } from './hooks';

describe('useMerchantNamingSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('interroge le statut toutes les 3 secondes tant que le nommage tourne, s’arrête une fois terminé, et rafraîchit les caches dérivées', async () => {
    // Avance l'horloge truquée puis laisse React traiter les mises à jour qui en découlent (fetch, re-rendu, effet).
    const settle = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

    let call = 0;
    const statuses: MerchantStatus[] = [
      { total: 10, named: 2, running: true, lastError: null },
      { total: 10, named: 2, running: true, lastError: null },
      { total: 10, named: 10, running: false, lastError: null }, // le nommage vient de se terminer
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(statuses[Math.min(call++, statuses.length - 1)]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    renderHook(() => useMerchantNamingSync(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });

    // Chargement initial, au montage.
    await settle(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Le nommage tourne encore : nouvel appel 3 secondes plus tard, pas avant.
    await settle(2999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await settle(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Troisième appel, 3 secondes après : le nommage vient de se terminer, les caches dérivées sont invalidées.
    await settle(3000);
    await settle(10); // laisse l'effet réagir au nouveau statut
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['transaction'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merchants', 'detail'] });

    // Terminé : plus de scrutation, même longtemps après.
    await settle(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
