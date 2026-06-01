import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { CITIES, OVERTURE, TILES_PMTILES } from '../config';

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
        'kontur': { type: 'vector', url: `pmtiles://${TILES_PMTILES}`, minzoom: 0, maxzoom: 9 },
        'terrain': {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15,
        },
      },
      layers: [
        // ════════════════════════════════════════
        // BELOW DECK.GL (before hex anchor)
        // ════════════════════════════════════════

        // 1. Background — warm paper white
        {
          id: 'bg',
          type: 'background',
          paint: { 'background-color': '#FAFAF6' },
        },

        // 2. Hillshade — grey terrain relief (increased exaggeration)
        {
          id: 'hillshade',
          type: 'hillshade',
          source: 'terrain',
          paint: {
            'hillshade-shadow-color': '#4a4a4a',
            'hillshade-highlight-color': '#fafaf6',
            'hillshade-exaggeration': 0.60,
          },
        } as any,

        // 3. Land cover — natural polygons
        {
          id: 'land-cover',
          type: 'fill',
          source: 'ov-base',
          'source-layer': 'land_cover',
          paint: {
            'fill-color': [
              'match', ['get', 'subtype'],
              'forest', '#79d47e',
              'grass', '#a0e18c',
              'shrub', '#a8d890',
              'crop', '#fdf285',
              'barren', '#C8C0A8',
              'wetland', '#96fcfe',
              'moss', '#a0d8a0',
              'urban_vegetation', '#88cc80',
              'snow', '#E8E8F0',
              'ice', '#E0E4F0',
              'transparent',
            ],
            'fill-opacity': [
              'interpolate', ['linear'], ['zoom'],
              4, 0.40,
              8, 0.35,
              12, 0.20,
            ],
          },
        },

        // 4. Land use — human land use polygons (subtle tint)
        {
          id: 'land-use',
          type: 'fill',
          source: 'ov-base',
          'source-layer': 'land_use',
          paint: {
            'fill-color': [
              'match', ['get', 'subtype'],
              'residential', '#d49aaa',
              'commercial', '#64b3c9',
              'industrial', '#B898B8',
              'recreation', '#79d47e',
              'education', '#90bcd8',
              'hospital', '#C0A8B8',
              'military', '#B0A890',
              'cemetery', '#A8B898',
              'transportation', '#C8C0B0',
              'religious', '#C0B8A8',
              'transparent',
            ],
            'fill-opacity': [
              'interpolate', ['linear'], ['zoom'],
              8, 0.15,
              12, 0.10,
              14, 0.06,
            ],
          },
        },

        // 5. Water polygons — light tint below deck.gl (just to mask terrain under lakes)
        {
          id: 'water-below',
          type: 'fill',
          source: 'ov-base',
          'source-layer': 'water',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'fill-color': '#d0f4f6',
            'fill-opacity': 0.6,
          },
        },

        // 6. Admin boundaries — region/county (dashed)
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
            'line-color': '#9A9080',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              6, 0.4,
              10, 0.8,
              13, 1.2,
            ],
            'line-opacity': 0.30,
            'line-dasharray': [6, 3],
          },
        },

        // 7. Admin boundaries — locality/municipality
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
            'line-color': '#8A8070',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              9, 0.2,
              12, 0.5,
              14, 0.8,
            ],
            'line-opacity': 0.25,
          },
        },

        // ════════════════════════════════════════
        // DECK.GL ANCHOR — hex layer (invisible)
        // deck.gl renders here with interleaved: true
        // ════════════════════════════════════════
        {
          id: 'hex',
          type: 'fill',
          source: 'kontur',
          'source-layer': 'kpop',
          paint: { 'fill-opacity': 0 },
        },

        // ════════════════════════════════════════
        // ABOVE DECK.GL (after hex anchor)
        // Water fills, roads, and labels ON TOP of glyphs
        // ════════════════════════════════════════

        // 8. Water fill — added dynamically in main.ts AFTER deck.gl overlay
        //    so it renders above all glyphs

        // 9. Motorway/trunk — bold dark lines (visible from z7)
        {
          id: 'roads-motorway',
          type: 'line',
          source: 'ov-trans',
          'source-layer': 'segment',
          minzoom: 7,
          filter: [
            'any',
            ['==', ['get', 'class'], 'motorway'],
            ['==', ['get', 'class'], 'trunk'],
          ],
          paint: {
            'line-color': '#2A2A2A',
            'line-width': [
              'interpolate', ['exponential', 1.5], ['zoom'],
              7, 0.4,
              9, 1.0,
              11, 2.0,
              13, 3.5,
              15, 5,
            ],
            'line-opacity': [
              'interpolate', ['linear'], ['zoom'],
              7, 0.35,
              9, 0.65,
              11, 0.75,
            ],
          },
        },

        // 10. Primary roads
        {
          id: 'roads-primary',
          type: 'line',
          source: 'ov-trans',
          'source-layer': 'segment',
          minzoom: 8,
          filter: ['==', ['get', 'class'], 'primary'],
          paint: {
            'line-color': '#3A3A3A',
            'line-width': [
              'interpolate', ['exponential', 1.5], ['zoom'],
              8, 0.3,
              10, 0.8,
              12, 1.5,
              14, 2.5,
            ],
            'line-opacity': [
              'interpolate', ['linear'], ['zoom'],
              8, 0.30,
              10, 0.55,
              12, 0.65,
            ],
          },
        },

        // 11. Secondary + tertiary roads
        {
          id: 'roads-secondary',
          type: 'line',
          source: 'ov-trans',
          'source-layer': 'segment',
          minzoom: 10,
          filter: [
            'any',
            ['==', ['get', 'class'], 'secondary'],
            ['==', ['get', 'class'], 'tertiary'],
          ],
          paint: {
            'line-color': '#4A4A4A',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 0.2,
              12, 0.6,
              14, 1.2,
            ],
            'line-opacity': 0.40,
          },
        },

        // 12. Railway — purple/violet dashed
        {
          id: 'railway',
          type: 'line',
          source: 'ov-trans',
          'source-layer': 'segment',
          minzoom: 8,
          filter: ['==', ['get', 'class'], 'rail'],
          paint: {
            'line-color': '#7B52AE',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8, 0.4,
              12, 1.0,
              14, 1.5,
            ],
            'line-opacity': 0.35,
            'line-dasharray': [6, 3],
          },
        },

        // 13. Labels — locality (city/town)
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

        // 14. Labels — district/borough/suburb
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

        // 15. Labels — neighbourhood
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
