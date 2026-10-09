import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
// `URL` de node explicite : en environnement jsdom, l'`URL` globale résout contre `window.location`
// au lieu du `file:` de `import.meta.url`.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new NodeURL('..', import.meta.url));

/** Valeurs en dur interdites hors de tokens.css : tout passe par un token. */
const RULES: { name: string; pattern: RegExp }[] = [
  { name: 'couleur hex', pattern: /#[0-9a-fA-F]{3,8}\b/ },
  { name: 'couleur rgb/hsl', pattern: /\b(rgba?|hsla?)\(/ },
  { name: 'taille de police en dur', pattern: /font-size:\s*[\d.]+(px|rem|em)/ },
  { name: 'rayon en px', pattern: /border-radius:[^;]*\b\d+px/ },
  { name: 'ombre en dur', pattern: /box-shadow:\s*(?!var\(|none|inset 0 2px 0 var\()[^;]*\d+px/ },
];

/**
 * Exceptions justifiées, fichier par fichier. Chaque entrée dit pourquoi.
 * Une nouvelle exception doit rester rare : préférer un token.
 */
const ALLOWED: Record<string, string[]> = {
  'styles/tokens.css': ['couleur hex', 'couleur rgb/hsl', 'taille de police en dur', 'ombre en dur'],
};

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith('.css') ? [path] : [];
  });
}

describe('CSS sans valeur en dur', () => {
  for (const file of cssFiles(root)) {
    const rel = relative(root, file);
    it(rel, () => {
      const allowed = ALLOWED[rel] ?? [];
      const offenders = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .flatMap((line, i) => RULES.filter((r) => !allowed.includes(r.name) && r.pattern.test(line)).map((r) => `${rel}:${i + 1} ${r.name} : ${line.trim()}`));
      expect(offenders).toEqual([]);
    });
  }
});
