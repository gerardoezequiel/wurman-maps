import type maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { buildLayers, clearSeen } from './layers';

let overlay: MapboxOverlay | null = null;
let pending = false;
let Z = 10.4;

function refresh(): void {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    clearSeen();
    if (overlay) overlay.setProps({ layers: buildLayers(Z) });
  });
}

/** Initialize deck.gl overlay on the MapLibre map */
export function setupOverlay(map: maplibregl.Map): void {
  Z = map.getZoom();

  overlay = new MapboxOverlay({
    interleaved: true,
    layers: buildLayers(Z),
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
