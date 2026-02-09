import type maplibregl from 'maplibre-gl';
import { getOverlay } from '../deck/overlay';
import { prep, getCls, getBinI } from '../deck/classify';
import type { PreparedFeature, LandUse } from '../deck/classify';
import { COL, BINS } from '../config';

const CN: Record<LandUse, string> = {
  residential: 'Residential',
  green: 'Open space',
  commercial: 'Commercial',
  industrial: 'Industrial',
  institutional: 'Institutional',
  water: 'Water',
};

const CC2: Record<LandUse, string> = {
  residential: `rgb(${COL.crimson})`,
  green: `rgb(${COL.green})`,
  commercial: `rgb(${COL.indigo})`,
  industrial: `rgb(${COL.indigo})`,
  institutional: 'rgb(74,128,128)',
  water: `rgb(${COL.blue})`,
};

const SS: Record<LandUse, string> = {
  residential: '<circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="0.8"/><circle cx="5" cy="5" r="2.5" fill="currentColor"/>',
  green: '<rect x="1" y="1" width="8" height="8" fill="currentColor" rx="0.3"/>',
  commercial: '<rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  industrial: '<rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  institutional: '<polygon points="5,0.5 9.5,5 5,9.5 0.5,5" fill="currentColor"/>',
  water: '<rect x="1" y="1" width="8" height="8" fill="currentColor" rx="0.3"/>',
};

/** Attach hover tooltip using deck.gl picking */
export function setupTooltip(map: maplibregl.Map): void {
  const tip = document.getElementById('tip')!;

  map.on('mousemove', (e: maplibregl.MapMouseEvent) => {
    const overlay = getOverlay();
    if (!overlay) return;

    const info = (overlay as unknown as {
      pickObject: (opts: { x: number; y: number; radius: number }) => { object?: PreparedFeature } | null;
    }).pickObject({ x: e.point.x, y: e.point.y, radius: 5 });

    if (!info?.object) {
      tip.classList.remove('on');
      map.getCanvas().style.cursor = '';
      return;
    }

    map.getCanvas().style.cursor = 'crosshair';
    const p = info.object.properties;
    if (!p) return;

    prep(info.object);
    const pop = p.population || 0;
    const cls = getCls(info.object);
    const bin = getBinI(info.object);

    document.getElementById('t-pop')!.textContent = pop.toLocaleString();
    document.getElementById('t-cat')!.innerHTML =
      `<svg viewBox="0 0 10 10" style="color:${CC2[cls]}">${SS[cls] || ''}</svg>` +
      `<span style="color:${CC2[cls]}">${CN[cls] || cls}</span>` +
      `<span style="opacity:0.4;font-size:7px;font-family:'Space Mono',monospace"> \u00B7 ${BINS[bin].label}</span>`;

    const cats = [
      { n: 'Built-up', v: (p.builtup || 0) + (p.residential || 0), c: '#AA8C7D' },
      { n: 'Industrial', v: p.industrial_area || 0, c: '#7B5E7B' },
      { n: 'Forest', v: (p.forest || 0) + (p.evergreen_needle_leaved_forest || 0) + (p.unknown_forest || 0), c: '#5A825A' },
      { n: 'Cropland', v: p.cropland || 0, c: '#AF9B46' },
      { n: 'Grass', v: (p.herbage || 0) + (p.shrubs || 0), c: '#82A06E' },
      { n: 'Water', v: (p.permanent_water || 0) + (p.wetland || 0), c: '#5A829B' },
    ].filter((x) => x.v > 0.01).sort((a, b) => b.v - a.v);

    const tl = document.getElementById('t-lc')!;
    const tb = document.getElementById('t-bar')!;
    if (cats.length) {
      tl.textContent = cats.slice(0, 3).map((c) => c.n + ' ' + Math.round(c.v * 100) + '%').join(' \u00B7 ');
      tb.innerHTML = cats.map((c) => `<div style="flex:${c.v};background:${c.c}"></div>`).join('');
      tb.style.display = 'flex';
    } else {
      tl.textContent = '';
      tb.style.display = 'none';
    }

    const bldg = p.total_building_count || p.building_count || 0;
    const ht = (p.ghs_avg_building_height || 0).toFixed(1);
    const fsq = p.foursquare_os_places_count || 0;
    document.getElementById('t-det')!.textContent =
      `${bldg} bldg \u00B7 ${ht}m avg ht \u00B7 ${fsq} POI`;

    tip.classList.add('on');
    const fr = document.getElementById('map-frame')!.getBoundingClientRect();
    const tx = e.point.x + 16;
    const ty = e.point.y - 60;
    tip.style.left = tx + 'px';
    tip.style.top = ty + 'px';

    requestAnimationFrame(() => {
      const r = tip.getBoundingClientRect();
      if (r.right > fr.right - 10) tip.style.left = (e.point.x - r.width - 16) + 'px';
      if (r.top < fr.top + 10) tip.style.top = (e.point.y + 16) + 'px';
    });
  });

  map.on('mouseout', () => tip.classList.remove('on'));
}
