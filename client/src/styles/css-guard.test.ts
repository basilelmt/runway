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
  // La devise suit la taille du montant qu'elle accompagne (0.55em) : une proportion, pas une taille de l'échelle.
  'components/ui/AmountHero.module.css': ['taille de police en dur'],
};

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith('.css') ? [path] : [];
  });
}

/**
 * Déclarations du fichier, une par entrée, espaces repliés : une valeur écrite sur plusieurs lignes
 * est vérifiée en entier. Les commentaires sont retirés en gardant leurs retours à la ligne, pour que
 * chaque déclaration garde le numéro de sa première ligne.
 */
function declarations(css: string): { line: number; text: string }[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const out: { line: number; text: string }[] = [];
  let start = 0;
  for (const part of source.split(/[;{}]/)) {
    const offset = part.search(/\S/);
    if (offset >= 0) {
      const line = source.slice(0, start + offset).split('\n').length;
      out.push({ line, text: part.replace(/\s+/g, ' ').trim() });
    }
    start += part.length + 1;
  }
  return out;
}

describe('CSS sans valeur en dur', () => {
  it('lit une déclaration écrite sur plusieurs lignes en entier', () => {
    const css = 'a {\n  color: red; /* note */\n  box-shadow:\n    0 0 0 2px var(--paper);\n}';
    expect(declarations(css)).toEqual([
      { line: 1, text: 'a' },
      { line: 2, text: 'color: red' },
      { line: 3, text: 'box-shadow: 0 0 0 2px var(--paper)' },
    ]);
  });

  for (const file of cssFiles(root)) {
    const rel = relative(root, file);
    it(rel, () => {
      const allowed = ALLOWED[rel] ?? [];
      const offenders = declarations(readFileSync(file, 'utf8')).flatMap(({ line, text }) =>
        RULES.filter((r) => !allowed.includes(r.name) && r.pattern.test(text)).map((r) => `${rel}:${line} ${r.name} : ${text}`),
      );
      expect(offenders).toEqual([]);
    });
  }
});
