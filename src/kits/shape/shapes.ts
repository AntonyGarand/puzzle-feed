import { s } from '../../ui/dom';

/** Bold outlined symbols on a 100×100 viewBox (circle, square, triangle, diamond, star, cross, hexagon, ring, arrow). */
export const SHAPES = 9;
export function shape(k: number, fill: string): SVGElement {
  const a = { fill, stroke: 'var(--ink)', 'stroke-width': 6, 'stroke-linejoin': 'round' };
  switch (k) {
    case 0:
      return s('circle', { ...a, cx: 50, cy: 50, r: 32 });
    case 1:
      return s('rect', { ...a, x: 20, y: 20, width: 60, height: 60, rx: 6 });
    case 2:
      return s('polygon', { ...a, points: '50,14 86,80 14,80' });
    case 3:
      return s('polygon', { ...a, points: '50,12 86,50 50,88 14,50' });
    case 4:
      return s('polygon', { ...a, points: '50,10 61,38 90,40 67,58 75,88 50,71 25,88 33,58 10,40 39,38' });
    case 5:
      return s('polygon', { ...a, points: '38,14 62,14 62,38 86,38 86,62 62,62 62,86 38,86 38,62 14,62 14,38 38,38' });
    case 6:
      return s('polygon', { ...a, points: '50,12 84,31 84,69 50,88 16,69 16,31' });
    case 7:
      return s('path', { ...a, 'fill-rule': 'evenodd', d: 'M50 16a34 34 0 1 0 0.01 0Z M50 36a14 14 0 1 1 -0.01 0Z' });
    default:
      return s('path', { ...a, d: 'M14 50 L50 14 L86 50 L68 50 L68 86 L32 86 L32 50 Z' });
  }
}
/** Shape names for the guide: [singular, plural] per language, in `shape()` order. */
export const SHAPE_EN = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross', 'hexagon', 'ring', 'arrow'];
export const SHAPE_EN_PL = ['circles', 'squares', 'triangles', 'diamonds', 'stars', 'crosses', 'hexagons', 'rings', 'arrows'];
export const SHAPE_FR = ['cercle', 'carré', 'triangle', 'losange', 'étoile', 'croix', 'hexagone', 'anneau', 'flèche'];
export const SHAPE_FR_PL = ['cercles', 'carrés', 'triangles', 'losanges', 'étoiles', 'croix', 'hexagones', 'anneaux', 'flèches'];
export const SHAPE_FR_ART = [
  'le cercle',
  'le carré',
  'le triangle',
  'le losange',
  'l’étoile',
  'la croix',
  'l’hexagone',
  'l’anneau',
  'la flèche',
];
