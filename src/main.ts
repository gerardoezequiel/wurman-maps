import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

import { createMap } from './map/create-map';
import { registerImages } from './map/images';
import { addLayers } from './map/layers';
import { setupTooltip } from './ui/tooltip';
import { setupCityNav } from './ui/city-nav';
import { setupSlider } from './ui/slider';
import { setupLoading } from './ui/loading';

const map = createMap('map');

map.on('load', () => {
  registerImages(map);
  addLayers(map);
  setupTooltip(map);
  setupLoading(map);
});

// DOM-only setup — doesn't need map.on('load')
setupCityNav(map);
setupSlider(map);
