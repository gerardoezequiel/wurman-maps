import type { Map } from 'maplibre-gl';

interface ScaleConfig {
  total: number;
  detail: number;
  dStep: number;
  mStep: number;
}

const configs: ScaleConfig[] = [
  { total: 100,    detail: 10,    dStep: 2,    mStep: 20 },
  { total: 200,    detail: 20,    dStep: 5,    mStep: 50 },
  { total: 500,    detail: 50,    dStep: 10,   mStep: 100 },
  { total: 1000,   detail: 100,   dStep: 20,   mStep: 200 },
  { total: 2000,   detail: 200,   dStep: 50,   mStep: 500 },
  { total: 5000,   detail: 500,   dStep: 100,  mStep: 1000 },
  { total: 10000,  detail: 1000,  dStep: 200,  mStep: 2000 },
  { total: 20000,  detail: 2000,  dStep: 500,  mStep: 5000 },
  { total: 50000,  detail: 5000,  dStep: 1000, mStep: 10000 },
  { total: 100000, detail: 10000, dStep: 2000, mStep: 20000 },
];

const niceRatios = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 15000, 20000, 25000, 50000, 100000, 150000, 200000, 250000, 500000, 1000000];

function updateScale(map: Map): void {
  const ctr = map.getCenter();
  const y = (ctr.lat * Math.PI) / 180;
  const mpp = (156543.03392 * Math.cos(y)) / Math.pow(2, map.getZoom());

  const targetM = mpp * 200;
  let cfg = configs[0];
  for (const c of configs) {
    if (c.total <= targetM * 1.5) cfg = c;
    else break;
  }

  const totalPx = cfg.total / mpp;
  const ink = '#C2385A';
  const svgH = 28;
  const baseline = svgH - 4;
  const tickMajor = 12;
  const tickMinor = 6;
  const pad = 2;

  let svg = `<svg width="${Math.ceil(totalPx + pad + 4)}" height="${svgH}" viewBox="0 0 ${Math.ceil(totalPx + pad + 4)} ${svgH}" xmlns="http://www.w3.org/2000/svg">`;

  // Baseline
  svg += `<line x1="${pad}" y1="${baseline}" x2="${pad + totalPx}" y2="${baseline}" stroke="${ink}" stroke-width="1"/>`;

  interface Tick {
    px: number;
    label: string;
    isMajor: boolean;
  }
  const ticks: Tick[] = [];

  // Detail section
  const useKm = cfg.total >= 2000;
  for (let m = 0; m <= cfg.detail; m += cfg.dStep) {
    const px = pad + (m / cfg.total) * totalPx;
    const isMajor = m === 0 || m === cfg.detail;
    let label = '';
    if (m === 0) label = '0';
    else if (isMajor) label = useKm ? String(m / 1000) : String(m);
    ticks.push({ px, label, isMajor });
  }

  // Major section
  for (let m = cfg.detail + cfg.mStep; m <= cfg.total; m += cfg.mStep) {
    const px = pad + (m / cfg.total) * totalPx;
    const label = useKm ? String(m / 1000) : String(m);
    ticks.push({ px, label, isMajor: true });
  }

  // End tick
  const endPx = pad + totalPx;
  const endInList = ticks.some((t) => Math.abs(t.px - endPx) < 1);
  if (!endInList) {
    ticks.push({
      px: endPx,
      label: useKm ? String(cfg.total / 1000) : String(cfg.total),
      isMajor: true,
    });
  }

  // Draw
  for (const t of ticks) {
    const h = t.isMajor ? tickMajor : tickMinor;
    svg += `<line x1="${t.px}" y1="${baseline}" x2="${t.px}" y2="${baseline - h}" stroke="${ink}" stroke-width="${t.isMajor ? 1 : 0.6}"/>`;
    if (t.label) {
      svg += `<text x="${t.px}" y="${baseline - h - 2}" text-anchor="middle" font-family="Space Mono,monospace" font-size="7" fill="${ink}" opacity="0.8">${t.label}</text>`;
    }
  }

  const unitLabel = cfg.total >= 2000 ? 'km' : 'm';
  svg += `<text x="${endPx + 6}" y="${baseline + 1}" font-family="Space Mono,monospace" font-size="6" fill="${ink}" opacity="0.6">${unitLabel}</text>`;
  svg += '</svg>';

  document.getElementById('scale-svg')!.outerHTML = svg.replace('<svg ', '<svg id="scale-svg" ');

  // Numerical ratio
  const metersPerCm = mpp * 37.8;
  let ratio = Math.round(metersPerCm * 100);
  let best = niceRatios[0];
  for (const r of niceRatios) {
    if (Math.abs(r - ratio) < Math.abs(best - ratio)) best = r;
  }
  document.getElementById('scale-ratio')!.textContent = `1:${best.toLocaleString()}`;
}

/** Setup scale bar updates on zoom/move */
export function setupScaleBar(map: Map): void {
  updateScale(map);
  map.on('zoom', () => updateScale(map));
  map.on('moveend', () => updateScale(map));
}
