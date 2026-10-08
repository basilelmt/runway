import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '@/api/client';
import { streamAsk } from '@/api/ask';
import { AskContext, type AskApi, type AskTurn } from './ask-context';
import { AskPanel } from './AskPanel';

/**
 * Fil de la conversation avec Claude et état d'ouverture du panneau.
 * Le fil vit le temps de la session du navigateur ; la session Claude est reprise pour les questions suivantes.
 */
export function AskProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const sessionId = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  const update = (id: number, patch: Partial<AskTurn>) => setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const run = useCallback((id: number, question: string) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    streamAsk(
      { question, sessionId: sessionId.current },
      (e) => {
        if (e.event === 'step') update(id, { step: e.data.text });
        if (e.event === 'answer') {
          sessionId.current = e.data.sessionId;
          update(id, { status: 'done', answer: e.data, step: null });
        }
        if (e.event === 'error') update(id, { status: 'error', error: e.data.message, step: null });
      },
      ctrl.signal,
    )
      .then(() => {
        // Flux fermé sans réponse ni erreur (coupure réseau) : le tour ne doit pas rester en attente.
        if (!ctrl.signal.aborted) setTurns((all) => all.map((t) => (t.id === id && t.status === 'pending' ? { ...t, status: 'error', error: 'La réponse a été interrompue', step: null } : t)));
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) update(id, { status: 'error', error: errorMessage(err), step: null });
      })
      .finally(() => {
        if (controller.current === ctrl) controller.current = null;
      });
  }, []);

  const send = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (!question) return;
      const id = nextId.current++;
      setTurns((all) => [...all, { id, question, status: 'pending', step: null, answer: null, error: null }]);
      run(id, question);
    },
    [run],
  );

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setTurns((all) => all.filter((t) => t.status !== 'pending'));
  }, []);

  const retry = useCallback(
    (id: number) => {
      const turn = turns.find((t) => t.id === id);
      if (!turn) return;
      update(id, { status: 'pending', error: null, step: null });
      run(id, turn.question);
    },
    [turns, run],
  );

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    sessionId.current = null;
    setTurns([]);
  }, []);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  const api = useMemo<AskApi>(
    () => ({ open, setOpen, toggle, turns, pending: turns.some((t) => t.status === 'pending'), send, stop, retry, reset }),
    [open, toggle, turns, send, stop, retry, reset],
  );

  return (
    <AskContext.Provider value={api}>
      {children}
      <AskPanel />
    </AskContext.Provider>
  );
}
