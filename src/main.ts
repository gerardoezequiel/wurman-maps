import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

import { createMap } from './map/create-map';
import { setupOverlay } from './deck/overlay';
import { setupTooltip } from './ui/tooltip';
import { setupCityNav } from './ui/city-nav';
import { setupScaleBar } from './ui/scale-bar';
import { initGrain } from './ui/grain';
import { setupBins } from './ui/bins';

const map = createMap('map');

map.on('load', () => {
  setupOverlay(map);
  setupTooltip(map);
  initGrain();
  setupScaleBar(map);
});

// DOM-only setup
setupCityNav(map);
setupBins();
