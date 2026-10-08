import { createContext, useContext } from 'react';
import type { AskAnswerEvent } from '@shared/api-types';

export type AskTurn = {
  id: number;
  question: string;
  status: 'pending' | 'done' | 'error';
  /** Dernière étape annoncée pendant que Claude travaille. */
  step: string | null;
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
};

export const AskContext = createContext<AskApi | null>(null);

/** Conversation avec Claude, partagée entre le panneau et ses déclencheurs. */
export function useAsk(): AskApi {
  const api = useContext(AskContext);
  if (!api) throw new Error('useAsk doit être utilisé sous AskProvider');
  return api;
}
