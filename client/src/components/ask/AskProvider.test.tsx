import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAsk, type AskApi } from './ask-context';
import { AskProvider } from './AskProvider';

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

const answer = (text: string) => ({ sessionId: SESSION, answer: text, highlight: null, chart: null, actions: [] });

let api: AskApi;
const expose = (a: AskApi) => {
  api = a;
};
function Probe() {
  const current = useAsk();
  useEffect(() => expose(current));
  return (
    <ul>
      {current.turns.map((t) => (
        <li key={t.id}>{`${t.question}|${t.status}|${t.step ?? ''}|${t.answer?.answer ?? ''}|${t.error ?? ''}`}</li>
      ))}
    </ul>
  );
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  render(
    <AskProvider>
      <Probe />
    </AskProvider>,
  );
});
afterEach(() => vi.unstubAllGlobals());

const bodyOf = (call: number) => JSON.parse(String((fetchMock.mock.calls[call]![1] as RequestInit).body));

describe('AskProvider', () => {
  it('suit les étapes, la réponse, puis reprend la session pour la suite', async () => {
    const first = controllableSse();
    fetchMock.mockResolvedValueOnce(first.response);
    act(() => api.send('Combien ?'));
    expect(await screen.findByText('Combien ?|pending|||')).toBeInTheDocument();
    act(() => first.push('step', { text: 'Je consulte tes opérations…' }));
    expect(await screen.findByText('Combien ?|pending|Je consulte tes opérations…||')).toBeInTheDocument();
    act(() => {
      first.push('answer', answer('20 €'));
      first.close();
    });
    expect(await screen.findByText('Combien ?|done||20 €|')).toBeInTheDocument();
    expect(api.pending).toBe(false);
    expect(bodyOf(0)).toEqual({ question: 'Combien ?', sessionId: null });

    const second = controllableSse();
    fetchMock.mockResolvedValueOnce(second.response);
    act(() => api.send('Et en 2025 ?'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)).toEqual({ question: 'Et en 2025 ?', sessionId: SESSION });
  });

  it('nouvelle conversation : vide le fil et oublie la session', async () => {
    const first = controllableSse();
    fetchMock.mockResolvedValueOnce(first.response);
    act(() => api.send('Q1'));
    act(() => {
      first.push('answer', answer('A1'));
      first.close();
    });
    await screen.findByText('Q1|done||A1|');
    act(() => api.reset());
    expect(screen.queryByText(/Q1/)).not.toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(controllableSse().response);
    act(() => api.send('Q2'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).sessionId).toBeNull();
  });

  it('arrêter coupe la requête et retire le tour en cours', async () => {
    fetchMock.mockResolvedValueOnce(controllableSse().response);
    act(() => api.send('Longue question'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = (fetchMock.mock.calls[0]![1] as RequestInit).signal!;
    act(() => api.stop());
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText(/Longue question/)).not.toBeInTheDocument();
  });

  it('affiche une erreur puis réessaie la même question', async () => {
    const failing = controllableSse();
    fetchMock.mockResolvedValueOnce(failing.response);
    act(() => api.send('Q'));
    act(() => {
      failing.push('error', { message: 'Claude Code n’est pas connecté', code: 'claude_not_logged_in' });
      failing.close();
    });
    expect(await screen.findByText('Q|error|||Claude Code n’est pas connecté')).toBeInTheDocument();
    const retry = controllableSse();
    fetchMock.mockResolvedValueOnce(retry.response);
    act(() => api.retry(api.turns[0]!.id));
    act(() => {
      retry.push('answer', answer('Ok'));
      retry.close();
    });
    expect(await screen.findByText('Q|done||Ok|')).toBeInTheDocument();
    expect(bodyOf(1).question).toBe('Q');
  });

  it('un flux fermé sans réponse passe en erreur', async () => {
    const cut = controllableSse();
    fetchMock.mockResolvedValueOnce(cut.response);
    act(() => api.send('Q'));
    act(() => cut.close());
    expect(await screen.findByText('Q|error|||La réponse a été interrompue')).toBeInTheDocument();
  });
});
