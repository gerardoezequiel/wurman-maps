import type maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { TILES } from '../config';
import { H3DataProvider } from './h3-data-provider';
import { buildLayers } from './layers';

let overlay: MapboxOverlay | null = null;
let pending = false;
let Z = 10.4;

const provider = new H3DataProvider({
  tileUrl: TILES,
  minZoom: 0,
  maxZoom: 9,
  h3Property: 'h3',
});

function refresh(): void {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    provider.clearSeen();
    if (overlay) overlay.setProps({ layers: buildLayers(provider, Z) });
  });
}

/** Initialize deck.gl overlay on the MapLibre map */
export function setupOverlay(map: maplibregl.Map): void {
  Z = map.getZoom();

  overlay = new MapboxOverlay({
    interleaved: true,
    layers: buildLayers(provider, Z),
  });
  map.addControl(overlay as unknown as maplibregl.IControl);

  map.on('zoom', () => {
    Z = map.getZoom();
    refresh();
  });
  map.on('moveend', () => {
    refresh();
  });
}

/** Get the current overlay for picking */
export function getOverlay(): MapboxOverlay | null {
  return overlay;
}
