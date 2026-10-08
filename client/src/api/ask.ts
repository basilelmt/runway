import type { AskStreamEvent } from '@shared/api-types';
import type { AskRequest } from '@shared/schemas';
import { ApiError } from './client';

/** Envoie une question à Claude et transmet les événements SSE au fil de l'eau. */
export async function streamAsk(req: AskRequest, onEvent: (e: AskStreamEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), signal });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new ApiError(body.error ?? `Erreur ${res.status}`, res.status, body.code);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data) onEvent({ event, data: JSON.parse(data) } as AskStreamEvent);
    }
    if (done) return;
  }
}
