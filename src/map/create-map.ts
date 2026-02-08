import maplibregl from 'maplibre-gl';
import { CITIES } from '../config';

/** Create the MapLibre instance with CARTO basemap */
export function createMap(container: string): maplibregl.Map {
  const defaultCity = CITIES[0];

  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      name: 'Wurman Base',
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'carto-light': {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png'],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        },
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#F5F0E6' },
        },
        {
          id: 'carto-basemap',
          type: 'raster',
          source: 'carto-light',
          paint: { 'raster-opacity': 0.25, 'raster-saturation': -0.5 },
        },
      ],
    },
    center: [defaultCity.lng, defaultCity.lat],
    zoom: defaultCity.zoom,
    minZoom: 4,
    maxZoom: 14,
    attributionControl: {},
  });

  map.addControl(
    new maplibregl.NavigationControl({ showCompass: false }),
    'bottom-right',
  );

  return map;
}
