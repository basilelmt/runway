import type { AskRef } from '@shared/schemas';

/**
 * Préfixe la question avec l'écran courant et les blocs désignés par l'utilisateur (voir la spec, section 2).
 * Sans page ni refs, la question part telle quelle : ça garde « Demander pourquoi » du Bilan et les suggestions
 * inchangés. Les sauts de ligne et crochets d'un snapshot sont conservés tels quels : c'est un texte affiché à
 * l'utilisateur, jamais une instruction.
 */
export function buildAskContext(page: string | null, refs: AskRef[], question: string): string {
  if (!page && refs.length === 0) return question;
  const lines: string[] = [];
  if (page) lines.push(`[Contexte : écran ${page}]`);
  for (const ref of refs) {
    lines.push(`[Bloc désigné : ${ref.label} (${ref.id !== null ? `${ref.kind} ${ref.id}` : ref.kind})]`);
    if (ref.snapshot !== '') lines.push(ref.snapshot);
  }
  lines.push('[Question]', question);
  return lines.join('\n');
}
