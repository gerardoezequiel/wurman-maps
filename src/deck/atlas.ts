/** Canvas-generated icon atlas: 6 columns x 2 rows = 12 shapes */

const CELL = 128;

export interface IconMapping {
  [key: string]: { x: number; y: number; width: number; height: number; mask: boolean };
}

export function createAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CELL * 6;
  c.height = CELL * 2;
  const x = c.getContext('2d')!;
  const M = CELL / 2;
  const R = CELL * 0.44;

  // Row 0: Ring shapes (stroked only)
  x.strokeStyle = '#fff';
  x.lineWidth = CELL * 0.045;

  // 0,0: Circle ring
  x.beginPath();
  x.arc(M, M, R, 0, Math.PI * 2);
  x.stroke();

  // 1,0: Square ring
  const sq = R * 0.88;
  x.strokeRect(CELL + M - sq, M - sq, sq * 2, sq * 2);

  // 2,0: Thin circle ring
  x.lineWidth = CELL * 0.03;
  x.beginPath();
  x.arc(CELL * 2 + M, M, R, 0, Math.PI * 2);
  x.stroke();

  // Row 1: Filled shapes
  const y1 = CELL;
  x.fillStyle = '#fff';

  // 0,1: Filled circle (crimson dot)
  x.beginPath();
  x.arc(M, y1 + M, R, 0, Math.PI * 2);
  x.fill();

  // 1,1: Filled large square (green)
  const gsq = R * 0.92;
  x.fillRect(CELL + M - gsq, y1 + M - gsq, gsq * 2, gsq * 2);

  // 2,1: Stroked square (navy/indigo)
  x.fillStyle = 'transparent';
  x.strokeStyle = '#fff';
  x.lineWidth = CELL * 0.06;
  const nsq = R * 0.80;
  x.strokeRect(CELL * 2 + M - nsq, y1 + M - nsq, nsq * 2, nsq * 2);

  // 3,1: Filled square (blue/water)
  x.fillStyle = '#fff';
  const wsq = R * 0.85;
  x.fillRect(CELL * 3 + M - wsq, y1 + M - wsq, wsq * 2, wsq * 2);

  // 4,1: Small filled circle
  x.beginPath();
  x.arc(CELL * 4 + M, y1 + M, R, 0, Math.PI * 2);
  x.fill();

  // 5,1: Diamond (rotated square)
  x.save();
  x.translate(CELL * 5 + M, y1 + M);
  x.rotate(Math.PI / 4);
  const dr = R * 0.75;
  x.fillRect(-dr, -dr, dr * 2, dr * 2);
  x.restore();

  return c;
}

export const IM: IconMapping = {
  circle_ring: { x: 0,        y: 0,    width: CELL, height: CELL, mask: true },
  square_ring: { x: CELL,     y: 0,    width: CELL, height: CELL, mask: true },
  thin_ring:   { x: CELL * 2, y: 0,    width: CELL, height: CELL, mask: true },
  circle_dot:  { x: 0,        y: CELL, width: CELL, height: CELL, mask: true },
  green_sq:    { x: CELL,     y: CELL, width: CELL, height: CELL, mask: true },
  navy_sq:     { x: CELL * 2, y: CELL, width: CELL, height: CELL, mask: true },
  blue_sq:     { x: CELL * 3, y: CELL, width: CELL, height: CELL, mask: true },
  sm_dot:      { x: CELL * 4, y: CELL, width: CELL, height: CELL, mask: true },
  diamond:     { x: CELL * 5, y: CELL, width: CELL, height: CELL, mask: true },
};
