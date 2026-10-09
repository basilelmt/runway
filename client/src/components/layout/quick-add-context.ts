import { createContext, useContext } from 'react';

/** Ouvre la saisie rapide d'une opération depuis n'importe quel écran. */
export const QuickAddContext = createContext<() => void>(() => undefined);

export const useQuickAdd = () => useContext(QuickAddContext);

/** Marque les boutons qui ouvrent la saisie ou Demander : N et K leur retirent le focus avant d'ouvrir. */
export const PANEL_TRIGGER = 'data-panel-trigger';
export const panelTrigger = { [PANEL_TRIGGER]: '' } as const;
