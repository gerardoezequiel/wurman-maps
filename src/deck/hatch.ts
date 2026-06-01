/**
 * Diagonal hatch pattern atlas for the classified land cover raster.
 * Each cell contains a SQUARE filled with diagonal lines at ~45°.
 * Different densities encode sub-categories (sparse ↔ dense hatching).
 */

const CELL = 128;

export interface HatchMapping {
  [key: string]: { x: number; y: number; width: number; height: number; mask: boolean };
}

/** Draw diagonal hatch lines inside a square clip region */
function drawHatch(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, half: number,
  spacing: number, lineWidth: number, angle: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - half, cy - half, half * 2, half * 2);
  ctx.clip();

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = lineWidth;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const extent = half * 1.5;

  for (let d = -extent; d <= extent; d += spacing) {
    const x0 = cx + d * cos - extent * sin;
    const y0 = cy + d * sin + extent * cos;
    const x1 = cx + d * cos + extent * sin;
    const y1 = cy + d * sin - extent * cos;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  ctx.restore();
}

export function createHatchAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CELL * 6;
  c.height = CELL * 1;
  const ctx = c.getContext('2d')!;
  const M = CELL / 2;
  const H = CELL * 0.49; // half-side — nearly fills the cell
  const a45 = Math.PI / 4;
  const a135 = (3 * Math.PI) / 4;

  // 0: Dense hatch (urban — pink areas, tight 45° lines)
  drawHatch(ctx, M, M, H, 7, 1.5, a45);

  // 1: Medium hatch (transitional — peach areas)
  drawHatch(ctx, CELL + M, M, H, 12, 1.2, a45);

  // 2: Sparse hatch (cropland — yellow areas, wide 45° lines)
  drawHatch(ctx, CELL * 2 + M, M, H, 18, 1.0, a45);

  // 3: Cross-hatch (forest — green areas, 45° + 135°)
  drawHatch(ctx, CELL * 3 + M, M, H, 16, 0.8, a45);
  drawHatch(ctx, CELL * 3 + M, M, H, 16, 0.8, a135);

  // 4: Fine dots / stipple (bare/grey — vertical lines)
  drawHatch(ctx, CELL * 4 + M, M, H, 10, 0.6, Math.PI / 2);

  // 5: Light cross-hatch (water — cyan)
  drawHatch(ctx, CELL * 5 + M, M, H, 14, 0.6, a45);
  drawHatch(ctx, CELL * 5 + M, M, H, 14, 0.6, a135);

  return c;
}

export const HM: HatchMapping = {
  hatch_urban:  { x: 0,        y: 0, width: CELL, height: CELL, mask: true },
  hatch_trans:  { x: CELL,     y: 0, width: CELL, height: CELL, mask: true },
  hatch_crop:   { x: CELL * 2, y: 0, width: CELL, height: CELL, mask: true },
  hatch_forest: { x: CELL * 3, y: 0, width: CELL, height: CELL, mask: true },
  hatch_bare:   { x: CELL * 4, y: 0, width: CELL, height: CELL, mask: true },
  hatch_water:  { x: CELL * 5, y: 0, width: CELL, height: CELL, mask: true },
};

export type HatchKey = keyof typeof HM;
