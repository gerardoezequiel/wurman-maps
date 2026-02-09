/**
 * Halftone grain + paper texture overlay using p5.js.
 * Animated at 3fps — risograph-authentic halftone dot pattern at 45° angle,
 * plus a value-noise paper texture with temporal flicker.
 */

import p5 from 'p5';
import { GRAIN } from '../config';

/** Deterministic cell hash for noise */
function cellHash(cx: number, cy: number, seed: number): number {
  let h = (cx * 374761393 + cy * 668265263 + seed * 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h & 0x7fffffff) / 0x7fffffff;
}

/** Paper texture — value noise with frame-count animation */
function paperNoise(x: number, y: number, frame: number): number {
  const scale = 0.008;
  const sx = x * scale;
  const sy = y * scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = sx - ix;
  const fy = sy - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const n00 = cellHash(ix, iy, frame);
  const n10 = cellHash(ix + 1, iy, frame);
  const n01 = cellHash(ix, iy + 1, frame);
  const n11 = cellHash(ix + 1, iy + 1, frame);
  return n00 * (1 - ux) * (1 - uy) + n10 * ux * (1 - uy) + n01 * (1 - ux) * uy + n11 * ux * uy;
}

/** Initialize p5.js halftone grain overlay in the map frame */
export function initGrain(): void {
  const container = document.getElementById('grain-canvas');
  if (!container) return;

  new p5((p: p5) => {
    let W = 0;
    let H = 0;

    p.setup = () => {
      const frame = document.getElementById('map-frame');
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      W = Math.ceil(rect.width);
      H = Math.ceil(rect.height);
      const canvas = p.createCanvas(W, H);
      canvas.style('display', 'block');
      p.pixelDensity(1);
      p.frameRate(3);
    };

    p.draw = () => {
      p.loadPixels();
      const d = p.pixels;
      const fc = p.frameCount;

      // Pass 1: Paper texture
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const pn = paperNoise(x, y, Math.floor(fc / 6));
          const warm = Math.round(245 + pn * 8 - 4);
          const i = (y * W + x) * 4;
          d[i] = warm;
          d[i + 1] = warm - 2;
          d[i + 2] = warm - 5;
          d[i + 3] = Math.round(8 * GRAIN);
        }
      }

      // Pass 2: Halftone dots on 45-degree grid
      const spacing = 6;
      const cos45 = Math.cos(Math.PI / 4);
      const sin45 = Math.sin(Math.PI / 4);

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const rx = x * cos45 + y * sin45;
          const ry = -x * sin45 + y * cos45;
          const gxi = Math.round(rx / spacing);
          const gyi = Math.round(ry / spacing);
          const gx = gxi * spacing;
          const gy = gyi * spacing;
          const dx = rx - gx;
          const dy = ry - gy;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Temporal flicker
          const seed = cellHash(gxi, gyi, Math.floor(fc / 2));
          const threshold = 0.5 + seed * 0.3;

          if (dist < threshold) {
            const i = (y * W + x) * 4;
            // Single pixel dot
            d[i] = Math.max(0, d[i] - 30);
            d[i + 1] = Math.max(0, d[i + 1] - 28);
            d[i + 2] = Math.max(0, d[i + 2] - 25);
            d[i + 3] = Math.min(255, d[i + 3] + Math.round(18 * GRAIN));

            // Occasional 2x2 cluster
            if (seed > 0.7 && x + 1 < W && y + 1 < H) {
              const i2 = (y * W + x + 1) * 4;
              d[i2] = Math.max(0, d[i2] - 20);
              d[i2 + 1] = Math.max(0, d[i2 + 1] - 18);
              d[i2 + 2] = Math.max(0, d[i2 + 2] - 15);
              d[i2 + 3] = Math.min(255, d[i2 + 3] + Math.round(12 * GRAIN));
            }
          }
        }
      }

      p.updatePixels();
    };

    p.windowResized = () => {
      const frame = document.getElementById('map-frame');
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      W = Math.ceil(rect.width);
      H = Math.ceil(rect.height);
      p.resizeCanvas(W, H);
    };
  }, container);
}
