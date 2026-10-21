import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AskRef } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { streamAsk } from '@/api/ask';
import { AskContext, type AskApi, type AskTurn } from './ask-context';
import { AskAim } from './AskAim';
import { AskPanel } from './AskPanel';
import { MAX_REFS, pageLabel, sameRef } from './ask-target';

/**
 * Fil de la conversation avec Claude et état d'ouverture du panneau.
 * Le fil vit le temps de la session du navigateur ; la session Claude est reprise pour les questions suivantes.
 */
export function AskProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [refs, setRefs] = useState<AskRef[]>([]);
  const [aiming, setAiming] = useState(false);
  const sessionId = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  const update = (id: number, patch: Partial<AskTurn>) => setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const run = useCallback((id: number, { question, refs, page }: Pick<AskTurn, 'question' | 'refs' | 'page'>) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    streamAsk(
      { question, sessionId: sessionId.current, page, refs },
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
      // L'écran est lu à l'envoi : le fournisseur vit au-dessus du routeur dans les tests.
      const turn = { question, refs, page: pageLabel(window.location.pathname) };
      setTurns((all) => [...all, { id, ...turn, status: 'pending', step: null, answer: null, error: null }]);
      setRefs([]);
      setAiming(false);
      run(id, turn);
    },
    [run, refs],
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
      run(id, turn);
    },
    [turns, run],
  );

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    sessionId.current = null;
    setTurns([]);
    setRefs([]);
  }, []);

  // Le viseur ne vit que panneau ouvert : le fermer range aussi le viseur.
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (!next) setAiming(false);
  }, []);
  const toggle = useCallback(() => {
    setOpenState((o) => !o);
    setAiming(false);
  }, []);

  // Le viseur se range dès qu'on atteint le nombre maximal de blocs.
  const addRef = useCallback(
    (ref: AskRef) => {
      if (refs.some((r) => sameRef(r, ref)) || refs.length >= MAX_REFS) return;
      setRefs([...refs, ref]);
      if (refs.length + 1 >= MAX_REFS) setAiming(false);
    },
    [refs],
  );
  const removeRef = useCallback((ref: AskRef) => setRefs((all) => all.filter((r) => !sameRef(r, ref))), []);

  const api = useMemo<AskApi>(
    () => ({ open, setOpen, toggle, turns, pending: turns.some((t) => t.status === 'pending'), send, stop, retry, reset, refs, addRef, removeRef, aiming, setAiming }),
    [open, setOpen, toggle, turns, send, stop, retry, reset, refs, addRef, removeRef, aiming],
  );

  return (
    <AskContext.Provider value={api}>
      {children}
      <AskPanel />
      {aiming ? <AskAim /> : null}
    </AskContext.Provider>
  );
}
