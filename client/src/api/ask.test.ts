import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamAsk } from './ask';

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('streamAsk', () => {
  it('décode les événements même coupés au milieu d’une ligne', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['event: step\ndata: {"te', 'xt":"Je consulte…"}\n\nevent: answer\ndata: {"answer":"Ok"}\n\n'])));
    const events: unknown[] = [];
    await streamAsk({ question: 'Q', sessionId: null }, (e) => events.push(e), new AbortController().signal);
    expect(events).toEqual([
      { event: 'step', data: { text: 'Je consulte…' } },
      { event: 'answer', data: { answer: 'Ok' } },
    ]);
  });

  it('rejette avec le message du serveur en cas de refus', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Question vide' }), { status: 400 })));
    await expect(streamAsk({ question: ' ', sessionId: null }, () => undefined, new AbortController().signal)).rejects.toThrow('Question vide');
  });
});
