import { createContext, useContext } from 'react';

/** Ouvre la saisie rapide d'une opération depuis n'importe quel écran. */
export const QuickAddContext = createContext<() => void>(() => undefined);

export const useQuickAdd = () => useContext(QuickAddContext);
