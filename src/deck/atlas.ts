/**
 * Canvas-generated icon atlas: 6 columns x 4 rows = 24 shape cells.
 * Exhibition-quality Wurman-style glyph system.
 * All shapes drawn white on transparent (mask: true → tinted at render time).
 */

const CELL = 128;

export interface IconMapping {
  [key: string]: { x: number; y: number; width: number; height: number; mask: boolean };
}

export function createAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CELL * 6;
  c.height = CELL * 4;
  const x = c.getContext('2d')!;
  const M = CELL / 2;
  const R = CELL * 0.44;

  // ═══ ROW 0: Outer container shapes (stroked) ═══
  x.strokeStyle = '#fff';
  x.lineWidth = CELL * 0.05;

  // 0,0: Circle ring — residential / institutional outer
  x.beginPath();
  x.arc(M, M, R, 0, Math.PI * 2);
  x.stroke();

  // 1,0: Square ring — bold outer (primary container)
  x.lineWidth = CELL * 0.06;
  const sq = R * 0.90;
  x.strokeRect(CELL + M - sq, M - sq, sq * 2, sq * 2);

  // 2,0: Cross plus (+) — green / forest outer
  x.lineWidth = CELL * 0.09;
  const arm = R * 0.95;
  x.beginPath();
  x.moveTo(CELL * 2 + M - arm, M);
  x.lineTo(CELL * 2 + M + arm, M);
  x.moveTo(CELL * 2 + M, M - arm);
  x.lineTo(CELL * 2 + M, M + arm);
  x.stroke();

  // 3,0: Thin circle ring (parks / utility)
  x.lineWidth = CELL * 0.03;
  x.beginPath();
  x.arc(CELL * 3 + M, M, R, 0, Math.PI * 2);
  x.stroke();

  // 4,0: Thin hollow square — low-density outline
  x.lineWidth = CELL * 0.025;
  const hsq = R * 0.85;
  x.strokeRect(CELL * 4 + M - hsq, M - hsq, hsq * 2, hsq * 2);

  // 5,0: Bold hollow square — high-density thick outline
  x.lineWidth = CELL * 0.08;
  const bsq = R * 0.88;
  x.strokeRect(CELL * 5 + M - bsq, M - bsq, bsq * 2, bsq * 2);

  // ═══ ROW 1: Inner fill shapes ═══
  const y1 = CELL;
  x.fillStyle = '#fff';

  // 0,1: Filled square — residential inner symbol
  const rsq = R * 0.72;
  x.fillRect(M - rsq, y1 + M - rsq, rsq * 2, rsq * 2);

  // 1,1: Filled circle — commercial / industrial inner
  x.beginPath();
  x.arc(CELL + M, y1 + M, R, 0, Math.PI * 2);
  x.fill();

  // 2,1: Concentric square — two nested square outlines
  x.fillStyle = 'transparent';
  x.strokeStyle = '#fff';
  x.lineWidth = CELL * 0.045;
  const csq1 = R * 0.88;
  x.strokeRect(CELL * 2 + M - csq1, y1 + M - csq1, csq1 * 2, csq1 * 2);
  x.lineWidth = CELL * 0.035;
  const csq2 = R * 0.55;
  x.strokeRect(CELL * 2 + M - csq2, y1 + M - csq2, csq2 * 2, csq2 * 2);

  // 3,1: Filled square (water overlay)
  x.fillStyle = '#fff';
  const wsq = R * 0.85;
  x.fillRect(CELL * 3 + M - wsq, y1 + M - wsq, wsq * 2, wsq * 2);

  // 4,1: Small filled circle (center dot)
  x.beginPath();
  x.arc(CELL * 4 + M, y1 + M, R * 0.45, 0, Math.PI * 2);
  x.fill();

  // 5,1: Diamond (rotated square) — institutional inner
  x.save();
  x.translate(CELL * 5 + M, y1 + M);
  x.rotate(Math.PI / 4);
  const dr = R * 0.75;
  x.fillRect(-dr, -dr, dr * 2, dr * 2);
  x.restore();

  // ═══ ROW 2: Rural marks, terrain, special ═══
  const y2 = CELL * 2;

  // 0,2: X-cross (×) — rural agricultural mark
  x.strokeStyle = '#fff';
  x.lineWidth = CELL * 0.06;
  const xr = R * 0.55;
  x.beginPath();
  x.moveTo(M - xr, y2 + M - xr);
  x.lineTo(M + xr, y2 + M + xr);
  x.moveTo(M + xr, y2 + M - xr);
  x.lineTo(M - xr, y2 + M + xr);
  x.stroke();

  // 1,2: Tiny filled circle — sparse dot
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(CELL + M, y2 + M, R * 0.35, 0, Math.PI * 2);
  x.fill();

  // 2,2: Filled circle (large)
  x.beginPath();
  x.arc(CELL * 2 + M, y2 + M, R, 0, Math.PI * 2);
  x.fill();

  // 3,2: Full filled square — terrain grid cell
  x.fillRect(CELL * 3, y2, CELL, CELL);

  // 4,2: Square with forward diagonal (/) — agricultural hatch glyph
  x.strokeStyle = '#fff';
  x.lineWidth = CELL * 0.04;
  const dsq = R * 0.82;
  x.strokeRect(CELL * 4 + M - dsq, y2 + M - dsq, dsq * 2, dsq * 2);
  x.lineWidth = CELL * 0.05;
  x.beginPath();
  x.moveTo(CELL * 4 + M - dsq * 0.7, y2 + M + dsq * 0.7);
  x.lineTo(CELL * 4 + M + dsq * 0.7, y2 + M - dsq * 0.7);
  x.stroke();

  // 5,2: Square with X-cross diagonal — hatch cross glyph
  x.lineWidth = CELL * 0.035;
  const xsq = R * 0.82;
  x.strokeRect(CELL * 5 + M - xsq, y2 + M - xsq, xsq * 2, xsq * 2);
  x.lineWidth = CELL * 0.04;
  x.beginPath();
  x.moveTo(CELL * 5 + M - xsq * 0.65, y2 + M + xsq * 0.65);
  x.lineTo(CELL * 5 + M + xsq * 0.65, y2 + M - xsq * 0.65);
  x.moveTo(CELL * 5 + M - xsq * 0.65, y2 + M - xsq * 0.65);
  x.lineTo(CELL * 5 + M + xsq * 0.65, y2 + M + xsq * 0.65);
  x.stroke();

  // ═══ ROW 3: Micro marks + specialty ═══
  const y3 = CELL * 3;

  // 0,3: Micro dot — ocean/sparse tiny dot
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(M, y3 + M, R * 0.18, 0, Math.PI * 2);
  x.fill();

  // 1,3: Micro cross (+) — terrain/elevation tiny mark
  x.strokeStyle = '#fff';
  x.lineWidth = CELL * 0.04;
  const mArm = R * 0.35;
  x.beginPath();
  x.moveTo(CELL + M - mArm, y3 + M);
  x.lineTo(CELL + M + mArm, y3 + M);
  x.moveTo(CELL + M, y3 + M - mArm);
  x.lineTo(CELL + M, y3 + M + mArm);
  x.stroke();

  // 2,3: Square with center horizontal line — transitional mark
  x.lineWidth = CELL * 0.035;
  const tsq = R * 0.78;
  x.strokeRect(CELL * 2 + M - tsq, y3 + M - tsq, tsq * 2, tsq * 2);
  x.lineWidth = CELL * 0.04;
  x.beginPath();
  x.moveTo(CELL * 2 + M - tsq * 0.7, y3 + M);
  x.lineTo(CELL * 2 + M + tsq * 0.7, y3 + M);
  x.stroke();

  // 3,3: Square outline + circle outline concentric
  x.lineWidth = CELL * 0.04;
  const scsq = R * 0.85;
  x.strokeRect(CELL * 3 + M - scsq, y3 + M - scsq, scsq * 2, scsq * 2);
  x.lineWidth = CELL * 0.035;
  x.beginPath();
  x.arc(CELL * 3 + M, y3 + M, R * 0.55, 0, Math.PI * 2);
  x.stroke();

  // 4,3: Bold cross (+) with dot center — dense green
  x.lineWidth = CELL * 0.07;
  const bgArm = R * 0.9;
  x.beginPath();
  x.moveTo(CELL * 4 + M - bgArm, y3 + M);
  x.lineTo(CELL * 4 + M + bgArm, y3 + M);
  x.moveTo(CELL * 4 + M, y3 + M - bgArm);
  x.lineTo(CELL * 4 + M, y3 + M + bgArm);
  x.stroke();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(CELL * 4 + M, y3 + M, R * 0.22, 0, Math.PI * 2);
  x.fill();

  // 5,3: Square with inner square filled — solid nested
  x.lineWidth = CELL * 0.045;
  const nsq = R * 0.88;
  x.strokeRect(CELL * 5 + M - nsq, y3 + M - nsq, nsq * 2, nsq * 2);
  x.fillStyle = '#fff';
  const nsqi = R * 0.48;
  x.fillRect(CELL * 5 + M - nsqi, y3 + M - nsqi, nsqi * 2, nsqi * 2);

  return c;
}

export const IM: IconMapping = {
  // Row 0: Outer containers
  circle_ring:  { x: 0,        y: 0,         width: CELL, height: CELL, mask: true },
  square_ring:  { x: CELL,     y: 0,         width: CELL, height: CELL, mask: true },
  cross_plus:   { x: CELL * 2, y: 0,         width: CELL, height: CELL, mask: true },
  thin_ring:    { x: CELL * 3, y: 0,         width: CELL, height: CELL, mask: true },
  hollow_sq:    { x: CELL * 4, y: 0,         width: CELL, height: CELL, mask: true },
  bold_sq:      { x: CELL * 5, y: 0,         width: CELL, height: CELL, mask: true },
  // Row 1: Inner fills
  filled_sq:    { x: 0,        y: CELL,      width: CELL, height: CELL, mask: true },
  circle_dot:   { x: CELL,     y: CELL,      width: CELL, height: CELL, mask: true },
  concentric_sq:{ x: CELL * 2, y: CELL,      width: CELL, height: CELL, mask: true },
  blue_sq:      { x: CELL * 3, y: CELL,      width: CELL, height: CELL, mask: true },
  sm_dot:       { x: CELL * 4, y: CELL,      width: CELL, height: CELL, mask: true },
  diamond:      { x: CELL * 5, y: CELL,      width: CELL, height: CELL, mask: true },
  // Row 2: Rural marks + specialty
  x_cross:      { x: 0,        y: CELL * 2,  width: CELL, height: CELL, mask: true },
  red_dot:      { x: CELL,     y: CELL * 2,  width: CELL, height: CELL, mask: true },
  lg_circle:    { x: CELL * 2, y: CELL * 2,  width: CELL, height: CELL, mask: true },
  full_sq:      { x: CELL * 3, y: CELL * 2,  width: CELL, height: CELL, mask: true },
  diag_sq:      { x: CELL * 4, y: CELL * 2,  width: CELL, height: CELL, mask: true },
  cross_diag_sq:{ x: CELL * 5, y: CELL * 2,  width: CELL, height: CELL, mask: true },
  // Row 3: Micro marks + specialty
  dot_tiny:     { x: 0,        y: CELL * 3,  width: CELL, height: CELL, mask: true },
  micro_cross:  { x: CELL,     y: CELL * 3,  width: CELL, height: CELL, mask: true },
  line_sq:      { x: CELL * 2, y: CELL * 3,  width: CELL, height: CELL, mask: true },
  sq_circle:    { x: CELL * 3, y: CELL * 3,  width: CELL, height: CELL, mask: true },
  bold_cross:   { x: CELL * 4, y: CELL * 3,  width: CELL, height: CELL, mask: true },
  nested_sq:    { x: CELL * 5, y: CELL * 3,  width: CELL, height: CELL, mask: true },
};
