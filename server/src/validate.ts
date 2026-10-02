import { zValidator } from '@hono/zod-validator';
import type { z } from 'zod';

type Target = 'json' | 'query' | 'param' | 'form';

/** Validation zod qui renvoie une erreur lisible en français avec le détail des champs. */
export function validate<T extends z.ZodType>(target: Target, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first?.path.join('.');
      const message = first ? (path ? `${path} : ${first.message}` : first.message) : 'Entrée invalide';
      return c.json({ error: message, code: 'validation', issues: result.error.issues }, 400);
    }
  });
}
