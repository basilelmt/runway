import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeTaskView } from '@shared/api-types';
import { ClaudeTasksTray } from './ClaudeTasksTray';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** Avance l'horloge truquée puis laisse React traiter ce qui en découle (fetch, re-rendu, effet). */
const settle = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

function mockTasks(responses: ClaudeTaskView[][]) {
  let call = 0;
  const fetchMock = vi.fn(async () => json(responses[Math.min(call++, responses.length - 1)]));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderTray(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ClaudeTasksTray />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

const webTask = (status: ClaudeTaskView['status'], extra: Partial<ClaudeTaskView> = {}): ClaudeTaskView => ({
  id: 'merchant_web-1',
  kind: 'merchant_web',
  label: 'Claude cherche Carrefour Express sur le web',
  title: 'Carrefour Express',
  subject: 'CARREFOUR EXPR',
  status,
  startedAt: '2026-10-21T10:00:00Z',
  finishedAt: null,
  result: null,
  error: null,
  ...extra,
});

const ideasTask = (status: ClaudeTaskView['status'], extra: Partial<ClaudeTaskView> = {}): ClaudeTaskView => ({
  id: 'ideas-5',
  kind: 'ideas',
  label: "Claude cherche des idées d'investissement",
  title: "Idées d'investissement",
  subject: null,
  status,
  startedAt: '2026-10-21T10:00:00Z',
  finishedAt: null,
  result: null,
  error: null,
  ...extra,
});

beforeAll(() => {
  // Les lots de notifications de React Query passent par défaut par un `setTimeout` : les rendre
  // synchrones évite de deviner combien de temps il faut laisser aux minuteries truquées pour les voir.
  notifyManager.setScheduler((cb) => cb());
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ClaudeTasksTray', () => {
  it('montre une tâche en cours, puis son résultat à la fin, et invalide les marchands, puis disparaît après 10 secondes', async () => {
    mockTasks([[webTask('running')], [webTask('done', { finishedAt: '2026-10-21T10:01:40Z', result: 'Supérette de quartier, Paris' })]]);
    const qc = renderTray();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    await settle(0);
    const region = screen.getByRole('status');
    expect(within(region).getByText('Claude cherche Carrefour Express sur le web')).toBeInTheDocument();

    await settle(2000); // intervalle de scrutation d'une tâche en cours
    // Le sujet rappelle de quoi parle le résultat.
    expect(within(region).getByText('Carrefour Express')).toBeInTheDocument();
    expect(within(region).getByText(/Supérette de quartier, Paris/)).toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merchants'] });

    await settle(10_000); // disparition automatique d'une tâche finie
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('une tâche en échec vue en cours montre son erreur et reste affichée après 10 secondes, jusqu’à ce qu’on la ferme', async () => {
    mockTasks([[webTask('running')], [webTask('failed', { finishedAt: '2026-10-21T10:01:40Z', error: 'Claude est indisponible' })]]);
    renderTray();

    await settle(0);
    expect(screen.getByText('Claude cherche Carrefour Express sur le web')).toBeInTheDocument();

    await settle(2000);
    expect(screen.getByText(/Claude est indisponible/)).toBeInTheDocument();
    expect(screen.getByText('Carrefour Express')).toBeInTheDocument();

    await settle(10_000);
    expect(screen.getByText(/Claude est indisponible/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByText(/Claude est indisponible/)).toBeNull();
  });

  it('ne montre pas une tâche déjà finie au premier chargement', async () => {
    mockTasks([[webTask('done', { finishedAt: '2026-10-21T10:01:40Z', result: 'Supérette de quartier' })]]);
    renderTray();

    await settle(0);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('une fournée d’idées finie montre un lien Voir vers Investir', async () => {
    mockTasks([[ideasTask('running')], [ideasTask('done', { finishedAt: '2026-10-21T10:01:40Z', result: '3 idées retenues' })]]);
    renderTray();

    await settle(0);
    expect(screen.getByText("Claude cherche des idées d'investissement")).toBeInTheDocument();
    await settle(2000);
    expect(screen.getByText(/3 idées retenues/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir' })).toHaveAttribute('href', '/investir');
  });

  it('une tâche finie disparaît après 10 secondes même si la liste change à chaque interrogation', async () => {
    const done = webTask('done', { finishedAt: '2026-10-21T10:01:40Z', result: 'Supérette' });
    // Une nouvelle recherche démarre à chaque interrogation : la liste change, le panneau se redessine toutes les 2 s.
    const others = (n: number) => Array.from({ length: n }, (_, i) => webTask('running', { id: `merchant_web-${i + 2}`, subject: `K${i}`, label: `Recherche ${i}` }));
    mockTasks([[webTask('running')], ...Array.from({ length: 12 }, (_, i) => [done, ...others(i + 1)])]);
    renderTray();

    await settle(0);
    await settle(2000);
    expect(screen.getByText(/Supérette/)).toBeInTheDocument();
    for (let i = 0; i < 6; i++) await settle(2000);
    expect(screen.queryByText(/Supérette/)).toBeNull();
    expect(screen.getByText('Recherche 0')).toBeInTheDocument();
  });
});
