import { createContext, useContext } from 'react';
import type { AskAnswerEvent } from '@shared/api-types';
import type { AskRef } from '@shared/schemas';

export type AskTurn = {
  id: number;
  question: string;
  /** Blocs désignés au viseur et écran affiché, renvoyés tels quels si la question est reposée. */
  refs: AskRef[];
  page: string | null;
  status: 'pending' | 'done' | 'error';
  /** Dernière étape annoncée pendant que Claude travaille. */
  step: string | null;
  /** Sources consultées (« portefeuille », « opérations »), dans l'ordre, sans doublon. */
  sources: string[];
  answer: AskAnswerEvent | null;
  error: string | null;
};

export type AskApi = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  turns: AskTurn[];
  pending: boolean;
  send: (question: string) => void;
  stop: () => void;
  retry: (id: number) => void;
  reset: () => void;
  /** Blocs désignés pour la prochaine question. */
  refs: AskRef[];
  addRef: (ref: AskRef) => void;
  removeRef: (ref: AskRef) => void;
  /** Mode viseur : un clic dans la page désigne un bloc au lieu d'agir. */
  aiming: boolean;
  setAiming: (aiming: boolean) => void;
};

export const AskContext = createContext<AskApi | null>(null);

/** Conversation avec Claude, partagée entre le panneau et ses déclencheurs. */
export function useAsk(): AskApi {
  const api = useContext(AskContext);
  if (!api) throw new Error('useAsk doit être utilisé sous AskProvider');
  return api;
}
