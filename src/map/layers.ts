import type maplibregl from 'maplibre-gl';
import { KONTUR_MVT_URL, DEFAULT_MAX_POP } from '../config';
import { makeLandCoverColorExpr, makePopSizeExpr } from './expressions';

/** Add the Kontur bivariate source and all Wurman visualization layers */
export function addLayers(map: maplibregl.Map): void {
  map.addSource('kontur-bivariate', {
    type: 'vector',
    tiles: [KONTUR_MVT_URL],
    maxzoom: 8,
  });

  // Layer 1: Hex grid outline — subtle reference grid
  map.addLayer({
    id: 'hex-grid',
    type: 'line',
    source: 'kontur-bivariate',
    'source-layer': 'stats',
    paint: {
      'line-color': '#C8C0B0',
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        6, 0.2,
        10, 0.4,
        14, 0.6,
      ],
      'line-opacity': 0.25,
    },
  });

  // Layer 2: Reference ring — constant size per zoom (the "empty" reference)
  map.addLayer({
    id: 'wurman-ring',
    type: 'symbol',
    source: 'kontur-bivariate',
    'source-layer': 'stats',
    filter: ['>', ['coalesce', ['get', 'population'], 0], 0],
    layout: {
      'icon-image': 'wurman-ring',
      'icon-size': [
        'interpolate', ['linear'], ['zoom'],
        5, 0.06,
        7, 0.14,
        9, 0.35,
        11, 0.7,
        13, 1.4,
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-padding': 0,
    },
    paint: {
      'icon-color': '#A09888',
      'icon-opacity': 0.2,
    },
  });

  // Layer 3: Wurman dots — data-driven size (population) + color (land cover)
  map.addLayer({
    id: 'wurman-dots',
    type: 'symbol',
    source: 'kontur-bivariate',
    'source-layer': 'stats',
    filter: ['>', ['coalesce', ['get', 'population'], 0], 0],
    layout: {
      'icon-image': 'wurman-circle',
      'icon-size': makePopSizeExpr(DEFAULT_MAX_POP),
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-padding': 0,
    },
    paint: {
      'icon-color': makeLandCoverColorExpr(),
      'icon-opacity': 0.82,
    },
  });
}
