import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAddProvider } from '@/components/layout/QuickAdd';
import { ToastProvider } from '@/components/ui';
import { useAsk } from './ask-context';
import { AskProvider } from './AskProvider';
import { AskTarget } from './AskTarget';

const SESSION = '11111111-1111-4111-8111-111111111111';
const encoder = new TextEncoder();

/** Réponse SSE dont on pousse les événements à la main. */
function controllableSse() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) });
  return {
    response: new Response(body, { status: 200 }),
    push: (event: string, data: unknown) => ctrl.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
    close: () => ctrl.close(),
  };
}

let sse: ReturnType<typeof controllableSse>;
const fetchMock = vi.fn();

beforeEach(() => {
  sse = controllableSse();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => (url === '/api/ask' ? sse.response : new Response('[]', { status: 200 })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function Trigger() {
  const { toggle, open } = useAsk();
  return (
    <button type="button" aria-expanded={open} onClick={toggle}>
      Demander
    </button>
  );
}

function renderPanel(page?: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <AskProvider>
            <QuickAddProvider>
              <Trigger />
              {page}
            </QuickAddProvider>
          </AskProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const panel = () => screen.queryByRole('complementary', { name: 'Demander à Claude' });
const answer = { sessionId: SESSION, answer: 'Tu as dépensé 412,80 € en restos.', highlight: { label: 'Restos ce mois-ci', amount: 412_80 }, chart: { kind: 'bar', title: 'Restos par mois', rows: [{ label: '2026-09', value: 412_80 }] }, actions: [], notices: [] };

describe('AskPanel', () => {
  it('s’ouvre avec k, met le focus dans le champ, se ferme avec Échap et rend le focus', async () => {
    renderPanel();
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'Demander' });
    trigger.focus();
    await user.keyboard('k');
    expect(panel()).toBeInTheDocument();
    expect(screen.getByLabelText('Ta question')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(panel()).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('propose des suggestions, montre les étapes puis la réponse', async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Demander' }));
    await user.click(screen.getByRole('button', { name: 'Combien en restos ce mois-ci ?' }));
    expect(screen.getByText('Combien en restos ce mois-ci ?')).toBeInTheDocument();
    expect(await screen.findByText('Je réfléchis…')).toBeInTheDocument();
    expect(screen.getByLabelText('Ta question')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Arrêter' })).toBeInTheDocument();

    sse.push('step', { text: 'Je consulte tes opérations…', source: 'opérations' });
    expect(await screen.findByText('Je consulte tes opérations…')).toBeInTheDocument();
    sse.push('answer', answer);
    sse.close();
    expect(await screen.findByText('Tu as dépensé 412,80 € en restos.')).toBeInTheDocument();
    expect(screen.getByText('Restos ce mois-ci')).toBeInTheDocument();
    expect(screen.getByText('Restos par mois')).toBeInTheDocument();
    expect(screen.getByLabelText('Ta question')).toBeEnabled();
    expect(screen.getByLabelText('Ta question')).toHaveFocus();
  });

  it('Entrée envoie, Maj+Entrée va à la ligne', async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Demander' }));
    const input = screen.getByLabelText('Ta question');
    await user.type(input, 'Première ligne{Shift>}{Enter}{/Shift}suite');
    expect(input).toHaveValue('Première ligne\nsuite');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/ask', expect.anything());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ask', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(String(fetchMock.mock.calls.find((c) => c[0] === '/api/ask')![1].body))).toEqual({ question: 'Première ligne\nsuite', sessionId: null, page: 'Accueil', refs: [] });
    expect(input).toHaveValue('');
  });

  it('affiche une erreur avec Réessayer, et Nouvelle conversation vide le fil', async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Demander' }));
    await user.type(screen.getByLabelText('Ta question'), 'Q{Enter}');
    sse.push('error', { message: 'Claude a mis trop de temps à répondre', code: 'claude_timeout' });
    sse.close();
    expect(await screen.findByRole('alert')).toHaveTextContent('Claude a mis trop de temps à répondre');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nouvelle conversation' }));
    expect(screen.queryByText('Q')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Combien en restos ce mois-ci ?' })).toBeInTheDocument();
  });

  it('le viseur, armé à l’ouverture, désigne un bloc sans le déclencher, puis l’envoie avec la question', async () => {
    const opened = vi.fn();
    renderPanel(
      <AskTarget kind="section" label="Idées en cours">
        <p>En moyenne, les 5 idées en cours font -4,0 %</p>
        <AskTarget kind="idea" id={7} label="Idée NVDA">
          <button type="button" onClick={opened}>
            NVIDIA
          </button>
        </AskTarget>
      </AskTarget>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Demander' }));
    const aim = screen.getByRole('button', { name: 'Viser un bloc' });
    expect(aim).toHaveAttribute('aria-pressed', 'true');

    // Le bloc le plus profond est désigné, et son bouton ne reçoit pas le clic.
    await user.click(screen.getByRole('button', { name: 'NVIDIA' }));
    expect(opened).not.toHaveBeenCalled();
    await user.click(screen.getByText(/les 5 idées en cours/));
    await user.click(screen.getByText(/les 5 idées en cours/));
    const chips = within(screen.getByRole('list', { name: 'Blocs montrés' }));
    expect(chips.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Idée NVDA', 'Idées en cours']);

    // Le bouton range le viseur sans fermer le panneau ; la page redevient cliquable.
    await user.click(aim);
    expect(aim).toHaveAttribute('aria-pressed', 'false');
    expect(panel()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'NVIDIA' }));
    expect(opened).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Retirer Idée NVDA' }));
    await user.type(screen.getByLabelText('Ta question'), 'C’est faux ?{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ask', expect.anything()));
    const body = JSON.parse(String(fetchMock.mock.calls.find((c) => c[0] === '/api/ask')![1].body));
    expect(body.page).toBe('Accueil');
    expect(body.refs).toEqual([{ kind: 'section', id: null, label: 'Idées en cours', snapshot: 'En moyenne, les 5 idées en cours font -4,0 %NVIDIA' }]);
    // Les pastilles partent avec la question : elles quittent le champ et s'affichent sous la bulle.
    const sent = screen.getAllByRole('list', { name: 'Blocs montrés' });
    expect(sent).toHaveLength(1);
    expect(within(sent[0]!).getByText('Idées en cours')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer Idées en cours' })).not.toBeInTheDocument();
  });
});
