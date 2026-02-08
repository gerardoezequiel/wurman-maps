import type maplibregl from 'maplibre-gl';
import { COLORS } from '../config';

interface CoverEntry {
  name: string;
  val: number;
  color: string;
}

/** Attach hover tooltip to the wurman-dots layer */
export function setupTooltip(map: maplibregl.Map): void {
  const tooltip = document.getElementById('tooltip')!;

  map.on('mousemove', 'wurman-dots', (e) => {
    if (!e.features || e.features.length === 0) return;

    map.getCanvas().style.cursor = 'crosshair';
    const f = e.features[0].properties!;
    const pop = (f.population as number) || 0;
    const area = (f.area_km2 as number) || 0;

    // Land cover values
    const covers: CoverEntry[] = [
      { name: 'Built-up',  val: (f.builtup as number) || 0,          color: COLORS.urban },
      { name: 'Forest',    val: (f.forest as number) || 0,           color: COLORS.forest },
      { name: 'Cropland',  val: (f.cropland as number) || 0,         color: COLORS.cropland },
      { name: 'Shrubs',    val: (f.shrubs as number) || 0,           color: COLORS.grass },
      { name: 'Herbage',   val: (f.herbage as number) || 0,          color: COLORS.grass },
      { name: 'Water',     val: (f.permanent_water as number) || 0,  color: COLORS.water },
    ].filter((c) => c.val > 0).sort((a, b) => b.val - a.val);

    const maxCover = covers.length > 0 ? covers[0].val : 1;

    let html = `<div class="tt-title">${pop.toLocaleString()} people</div>`;
    html += `<div class="tt-row"><span class="tt-label">Area</span><span class="tt-value">${area.toFixed(2)} km\u00B2</span></div>`;

    if (f.populated_area_km2) {
      html += `<div class="tt-row"><span class="tt-label">Populated</span><span class="tt-value">${Number(f.populated_area_km2).toFixed(2)} km\u00B2</span></div>`;
    }
    if (area > 0) {
      html += `<div class="tt-row"><span class="tt-label">Density</span><span class="tt-value">${Math.round(pop / area).toLocaleString()} /km\u00B2</span></div>`;
    }

    if (f.building_count) {
      html += `<div class="tt-row"><span class="tt-label">Buildings</span><span class="tt-value">${Number(f.building_count).toLocaleString()}</span></div>`;
    }
    if (f.ghs_avg_building_height) {
      html += `<div class="tt-row"><span class="tt-label">Avg height</span><span class="tt-value">${Number(f.ghs_avg_building_height).toFixed(1)}m</span></div>`;
    }

    // Land cover bars
    if (covers.length > 0) {
      html += '<div class="tt-bar-row">';
      covers.slice(0, 4).forEach((c) => {
        const pct = maxCover > 0 ? (c.val / maxCover) * 100 : 0;
        html += `<div class="tt-bar-container">
          <span class="tt-bar-label">${c.name}</span>
          <div class="tt-bar-track">
            <div class="tt-bar-fill" style="width:${pct}%;background:${c.color}"></div>
          </div>
        </div>`;
      });
      html += '</div>';
    }

    tooltip.innerHTML = html;
    tooltip.classList.add('visible');
    tooltip.style.left = (e.point.x + 16) + 'px';
    tooltip.style.top = (e.point.y - 16) + 'px';

    // Keep tooltip within viewport
    const rect = tooltip.getBoundingClientRect();
    if (rect.right > window.innerWidth - 20) {
      tooltip.style.left = (e.point.x - rect.width - 16) + 'px';
    }
    if (rect.bottom > window.innerHeight - 20) {
      tooltip.style.top = (e.point.y - rect.height - 16) + 'px';
    }
  });

  map.on('mouseleave', 'wurman-dots', () => {
    map.getCanvas().style.cursor = '';
    tooltip.classList.remove('visible');
  });
}
