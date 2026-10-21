import type { ElementType, ReactNode } from 'react';
import { askTarget, type AskRefKind } from './ask-target';

type AskTargetProps = {
  kind: AskRefKind;
  /** Identifiant de l'élément, absent pour une section. */
  id?: number;
  /** Nom de la pastille : « Idées en cours », « Enveloppe Courses ». */
  label: string;
  /** Élément rendu, `div` par défaut ; `section` pour garder la structure d'une page. */
  as?: ElementType;
  className?: string;
  children: ReactNode;
};

/**
 * Bloc que le viseur de Demander peut désigner, sans effet visible hors de la visée.
 * Pour une ligne ou une carte, poser plutôt `askTarget()` sur son élément : pas d'enveloppe en plus dans la liste.
 */
export function AskTarget({ kind, id, label, as: Tag = 'div', className, children }: AskTargetProps) {
  return (
    <Tag className={className} {...askTarget(kind, id ?? null, label)}>
      {children}
    </Tag>
  );
}
