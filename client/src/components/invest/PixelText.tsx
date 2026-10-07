/** Police bitmap 5×5, juste les lettres utiles : chaque ligne est un motif où « # » est un pixel allumé. */
const GLYPHS: Record<string, string[]> = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#'],
  E: ['#####', '#....', '####.', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
  '!': ['#', '#', '#', '.', '#'],
  ' ': ['..', '..', '..', '..', '..'],
};
const ROWS = 5;
const GAP = 1;

/** Pixels allumés d'un texte, et sa largeur en pixels. Les caractères absents de la police sont ignorés. */
export function pixelize(text: string): { pixels: { x: number; y: number }[]; width: number } {
  const pixels: { x: number; y: number }[] = [];
  let x = 0;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    glyph.forEach((row, y) => [...row].forEach((c, dx) => c === '#' && pixels.push({ x: x + dx, y })));
    x += glyph[0]!.length + GAP;
  }
  return { pixels, width: Math.max(0, x - GAP) };
}

/** Texte en vrais pixels (SVG net, sans police) ; `pixel` est la taille d'un pixel en px CSS. */
export function PixelText({ text, pixel = 2, className }: { text: string; pixel?: number; className?: string }) {
  const { pixels, width } = pixelize(text);
  return (
    <svg className={className} width={width * pixel} height={ROWS * pixel} viewBox={`0 0 ${width} ${ROWS}`} shapeRendering="crispEdges" aria-hidden>
      {pixels.map(({ x, y }) => (
        <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  );
}
