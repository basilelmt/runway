import { describe, expect, it } from 'vitest';
import { pixelize } from './PixelText';

describe('pixelize', () => {
  it('pose les glyphes côte à côte avec un pixel d’écart', () => {
    const t = pixelize('to');
    expect(t.width).toBe(11);
    expect(t.pixels.filter((p) => p.y === 0).map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 7, 8, 9]);
  });

  it('ignore les caractères absents de la police', () => {
    expect(pixelize('T?').width).toBe(5);
  });
});
