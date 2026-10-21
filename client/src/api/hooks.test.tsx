import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keys, useEnvelopes } from './hooks';

describe('useEnvelopes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('affiche tout de suite les enveloppes actives tirées de la liste complète en cache, le temps du chargement', async () => {
    const all = [
      { id: 1, name: 'Courses', archived: false },
      { id: 2, name: 'Vacances 2025', archived: true },
    ];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(keys.envelopes(true), all);

    const { result } = renderHook(() => useEnvelopes(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });

    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.map((e) => e.name)).toEqual(['Courses']);
  });
});
