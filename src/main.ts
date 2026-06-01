import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

import { createMap } from './map/create-map';
import { setupOverlay, getOverlay } from './deck/overlay';
import { getLoadedFeatureCount } from './deck/layers';
import { setupTooltip } from './ui/tooltip';
import { setupCityNav } from './ui/city-nav';
import { setupScaleBar } from './ui/scale-bar';
import { setupBins } from './ui/bins';

const map = createMap('map');

// Dev-only: expose for runtime inspection (never bundled into production builds).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__map = map;
  (window as unknown as Record<string, unknown>).__getOverlay = getOverlay;
}

/**
 * Surface a non-silent warning if the population tile source returns nothing.
 * The map previously failed silently when its data source went offline; this
 * makes a dead/blocked source diagnosable instead of looking like an empty map.
 */
function watchDataHealth(): void {
  window.setTimeout(() => {
    if (getLoadedFeatureCount() > 0) return;
    const el = document.getElementById('data-warning');
    if (el) el.style.display = 'block';
    console.error(
      '[wurman] No population features loaded after 8s — check the H3 tile source ' +
        '(VITE_POP_PMTILES_URL / kpop.pmtiles reachability and CORS).',
    );
  }, 8000);
}

map.on('load', () => {
  setupOverlay(map);

  // Water fill ON TOP of deck.gl — must be added after overlay so it's above all glyphs
  map.addLayer({
    id: 'water',
    type: 'fill',
    source: 'ov-base',
    'source-layer': 'water',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': '#0000f5',
      'fill-opacity': 0.85,
    },
  } as any);

  setupTooltip(map);
  setupScaleBar(map);
  watchDataHealth();
});

// DOM-only setup
setupCityNav(map);
setupBins();
