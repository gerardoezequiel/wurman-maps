import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { CITIES, OVERTURE, TILES } from '../config';

/** Create the MapLibre instance with Overture PMTiles + Kontur MVT */
export function createMap(container: string): maplibregl.Map {
  // Register PMTiles protocol
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);

  const defaultCity = CITIES[0];

  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'ov-base': { type: 'vector', url: `pmtiles://${OVERTURE}/base.pmtiles` },
        'ov-trans': { type: 'vector', url: `pmtiles://${OVERTURE}/transportation.pmtiles` },
        'ov-div': { type: 'vector', url: `pmtiles://${OVERTURE}/divisions.pmtiles` },
        'kontur': { type: 'vector', tiles: [TILES], minzoom: 0, maxzoom: 9 },
      },
      layers: [
        // 1. Background — warm paper
        {
          id: 'bg',
          type: 'background',
          paint: { 'background-color': '#FAFAF6' },
        },

        // 2. Water polygons — lakes, rivers, ocean (filled deep blue)
        {
          id: 'water',
          type: 'fill',
          source: 'ov-base',
          'source-layer': 'water',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'fill-color': '#3E6B8A',
            'fill-opacity': 1,
          },
        },

        // 3. Water lines — rivers, streams, canals
        {
          id: 'water-line',
          type: 'line',
          source: 'ov-base',
          'source-layer': 'water',
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: {
            'line-color': '#3E6B8A',
            'line-width': [
              'interpolate', ['exponential', 1.6], ['zoom'],
              8, 0.5,
              10, 1.5,
              14, 4,
              18, 12,
            ],
            'line-opacity': 0.8,
          },
        },

        // 4. Admin boundaries — region/county (dashed)
        {
          id: 'admin-region',
          type: 'line',
          source: 'ov-div',
          'source-layer': 'division_boundary',
          minzoom: 6,
          maxzoom: 14,
          filter: [
            'any',
            ['==', ['get', 'subtype'], 'region'],
            ['==', ['get', 'subtype'], 'county'],
          ],
          paint: {
            'line-color': '#D8D0C4',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              6, 0.4,
              10, 0.8,
              13, 1.2,
            ],
            'line-opacity': 0.25,
            'line-dasharray': [6, 3],
          },
        },

        // 5. Admin boundaries — locality/municipality (subtle solid)
        {
          id: 'admin-locality',
          type: 'line',
          source: 'ov-div',
          'source-layer': 'division_boundary',
          minzoom: 9,
          maxzoom: 15,
          filter: [
            'any',
            ['==', ['get', 'subtype'], 'locality'],
            ['==', ['get', 'subtype'], 'municipality'],
          ],
          paint: {
            'line-color': '#E0D9CC',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              9, 0.2,
              12, 0.5,
              14, 0.8,
            ],
            'line-opacity': 0.2,
          },
        },

        // 6. Railway ghost layer — infrastructure skeleton
        {
          id: 'railway',
          type: 'line',
          source: 'ov-trans',
          'source-layer': 'segment',
          minzoom: 8,
          paint: {
            'line-color': '#D8D0C4',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8, 0.3,
              12, 0.8,
              14, 1.2,
            ],
            'line-opacity': 0.15,
            'line-dasharray': [6, 3],
          },
          filter: ['==', ['get', 'class'], 'rail'],
        },

        // 7. Roads — warm paper tone
        {
          id: 'roads',
          type: 'line',
          source: 'ov-trans',
          'source-layer': 'segment',
          minzoom: 10,
          paint: {
            'line-color': '#E0D9CC',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 0.15,
              13, 0.5,
              15, 1,
            ],
            'line-opacity': 0.35,
          },
          filter: [
            'any',
            ['==', ['get', 'class'], 'primary'],
            ['==', ['get', 'class'], 'secondary'],
            ['==', ['get', 'class'], 'motorway'],
            ['==', ['get', 'class'], 'tertiary'],
          ],
        },

        // 8. Labels — locality (city/town)
        {
          id: 'label-locality',
          type: 'symbol',
          source: 'ov-div',
          'source-layer': 'division',
          minzoom: 8,
          maxzoom: 14,
          filter: [
            'any',
            ['==', ['get', 'subtype'], 'city'],
            ['==', ['get', 'subtype'], 'town'],
            ['==', ['get', 'subtype'], 'locality'],
          ],
          layout: {
            'text-field': ['coalesce', ['get', '@name'], ['get', 'name'], ''],
            'text-font': ['Open Sans Semibold'],
            'text-size': [
              'interpolate', ['linear'], ['zoom'],
              8, 10,
              11, 13,
              13, 14,
            ],
            'text-transform': 'uppercase',
            'text-letter-spacing': 0.15,
            'text-max-width': 8,
            'text-padding': 30,
            'text-allow-overlap': false,
            'text-optional': true,
          },
          paint: {
            'text-color': '#A89B88',
            'text-opacity': [
              'interpolate', ['linear'], ['zoom'],
              8, 0.6,
              11, 0.7,
              13, 0.4,
              14, 0,
            ],
            'text-halo-color': 'rgba(250,250,246,0.8)',
            'text-halo-width': 1.5,
          },
        },

        // 9. Labels — district/borough/suburb
        {
          id: 'label-district',
          type: 'symbol',
          source: 'ov-div',
          'source-layer': 'division',
          minzoom: 10,
          maxzoom: 14,
          filter: [
            'any',
            ['==', ['get', 'subtype'], 'district'],
            ['==', ['get', 'subtype'], 'borough'],
            ['==', ['get', 'subtype'], 'suburb'],
          ],
          layout: {
            'text-field': ['coalesce', ['get', '@name'], ['get', 'name'], ''],
            'text-font': ['Open Sans Semibold'],
            'text-size': [
              'interpolate', ['linear'], ['zoom'],
              10, 8,
              12, 10,
              14, 11,
            ],
            'text-transform': 'uppercase',
            'text-letter-spacing': 0.12,
            'text-max-width': 7,
            'text-padding': 20,
            'text-allow-overlap': false,
            'text-optional': true,
          },
          paint: {
            'text-color': '#B8AD9A',
            'text-opacity': [
              'interpolate', ['linear'], ['zoom'],
              10, 0.4,
              12, 0.55,
              14, 0,
            ],
            'text-halo-color': 'rgba(250,250,246,0.7)',
            'text-halo-width': 1.2,
          },
        },

        // 10. Labels — neighbourhood
        {
          id: 'label-neighbourhood',
          type: 'symbol',
          source: 'ov-div',
          'source-layer': 'division',
          minzoom: 11,
          maxzoom: 15,
          filter: ['==', ['get', 'subtype'], 'neighborhood'],
          layout: {
            'text-field': ['coalesce', ['get', '@name'], ['get', 'name'], ''],
            'text-font': ['Open Sans Semibold'],
            'text-size': [
              'interpolate', ['linear'], ['zoom'],
              11, 7.5,
              13, 9.5,
              15, 10,
            ],
            'text-transform': 'uppercase',
            'text-letter-spacing': 0.18,
            'text-max-width': 6,
            'text-padding': 15,
            'text-allow-overlap': false,
            'text-optional': true,
          },
          paint: {
            'text-color': '#B2A796',
            'text-opacity': [
              'interpolate', ['linear'], ['zoom'],
              11, 0.3,
              13, 0.5,
              15, 0,
            ],
            'text-halo-color': 'rgba(250,250,246,0.6)',
            'text-halo-width': 1,
          },
        },

        // 11. Invisible hex (for deck.gl reference)
        {
          id: 'hex',
          type: 'fill',
          source: 'kontur',
          'source-layer': 'stats',
          paint: { 'fill-opacity': 0 },
        },
      ],
    },
    center: [defaultCity.lng, defaultCity.lat],
    zoom: defaultCity.zoom,
    minZoom: 3,
    maxZoom: 15,
    fadeDuration: 0,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchZoomRotate: true,
    touchPitch: false,
    bearing: 0,
    pitch: 0,
  });

  // Lock north-up: disable rotation
  map.touchZoomRotate.disableRotation();

  return map;
}
