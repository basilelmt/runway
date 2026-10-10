import earthrise, { meta } from 'ascii.rest/pieces/earthrise';

/**
 * Calcule et dessine l'ascii art « earthrise » hors du fil principal, sur un canvas transféré (OffscreenCanvas).
 * Sa préparation (relief, ombres portées) prend plus de 150 ms et chaque image ~15 ms : sur le fil principal,
 * l'arrivée sur l'écran Investir se figeait et les animations de la page saccadaient.
 * Le dessin reprend celui de `mount` (ascii.rest) : chaque couple (caractère, couleur) est tracé une fois dans un
 * atlas, puis recopié case par case.
 */
export type EarthriseMessage =
  | { type: 'attach'; canvas: OffscreenCanvas; width: number }
  | { type: 'resize'; width: number }
  | { type: 'run'; go: boolean };

const { cols, rows, palette, ground, fps } = meta;
const cell = meta.cell ?? 2;
const frame = earthrise();
const color = new Uint8Array(cols * rows);

type Surface = {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  atlas: OffscreenCanvas;
  actx: OffscreenCanvasRenderingContext2D;
  slots: Map<number, number>;
  w: number;
  h: number;
  sw: number;
  sh: number;
};

let surface: Surface | null = null;
let t = 0;
let raf = 0;
let last = 0;

function size(s: Surface, width: number) {
  s.w = width / cols;
  s.h = s.w * cell;
  s.sw = Math.ceil(s.w);
  s.sh = Math.ceil(s.h);
  s.canvas.width = Math.round(s.w * cols);
  s.canvas.height = Math.round(s.h * rows);
  s.atlas.width = s.sw * 32;
  s.atlas.height = s.sh * 32;
  s.slots.clear();
}

function glyph(s: Surface, code: number, i: number) {
  const key = code * 256 + i;
  let slot = s.slots.get(key);
  if (slot !== undefined) return slot;
  if (s.slots.size === 1024) {
    s.actx.clearRect(0, 0, s.atlas.width, s.atlas.height);
    s.slots.clear();
  }
  slot = s.slots.size;
  s.actx.font = `${s.w / 0.6}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  s.actx.textAlign = 'center';
  s.actx.textBaseline = 'middle';
  s.actx.fillStyle = palette[i] ?? ground;
  s.actx.fillText(String.fromCharCode(code), (slot % 32) * s.sw + s.sw / 2, Math.floor(slot / 32) * s.sh + s.sh / 2);
  s.slots.set(key, slot);
  return slot;
}

function draw() {
  const s = surface;
  if (!s) return;
  const text = frame(t, { paper: false, color });
  s.ctx.fillStyle = ground;
  s.ctx.fillRect(0, 0, s.canvas.width, s.canvas.height);
  for (let k = 0, x = 0, y = 0; k < text.length; k++) {
    const c = text.charCodeAt(k);
    if (c === 10) {
      x = 0;
      y++;
      continue;
    }
    if (c !== 32) {
      const slot = glyph(s, c, color[y * cols + x] ?? 0);
      const dx = Math.round(x * s.w + (s.w - s.sw) / 2);
      const dy = Math.round(y * s.h + (s.h - s.sh) / 2);
      s.ctx.drawImage(s.atlas, (slot % 32) * s.sw, Math.floor(slot / 32) * s.sh, s.sw, s.sh, dx, dy, s.sw, s.sh);
    }
    x++;
  }
}

function tick(now: number) {
  raf = requestAnimationFrame(tick);
  const dt = now - last;
  if (dt < 1000 / fps - 2) return;
  last = now;
  t += Math.min(dt, 100) / 1000;
  draw();
}

self.addEventListener('message', (event: MessageEvent<EarthriseMessage>) => {
  const message = event.data;
  if (message.type === 'attach') {
    const atlas = new OffscreenCanvas(1, 1);
    const ctx = message.canvas.getContext('2d');
    const actx = atlas.getContext('2d');
    if (!ctx || !actx) return;
    surface = { canvas: message.canvas, ctx, atlas, actx, slots: new Map(), w: 0, h: 0, sw: 0, sh: 0 };
    size(surface, message.width);
    draw();
    self.postMessage('drawn');
  } else if (message.type === 'resize') {
    if (!surface) return;
    size(surface, message.width);
    draw();
  } else if (message.go && !raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  } else if (!message.go && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
});
