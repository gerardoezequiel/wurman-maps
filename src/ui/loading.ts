import type maplibregl from 'maplibre-gl';
import { KONTUR_MVT_URL } from '../config';

/** Set up loading overlay dismissal and MVT tile status check */
export function setupLoading(map: maplibregl.Map): void {
  const loadingEl = document.getElementById('loading')!;
  const statusEl = document.getElementById('tile-status')!;

  // Dismiss loading on first tile load
  const onData = (e: maplibregl.MapSourceDataEvent): void => {
    if (e.sourceId === 'kontur-bivariate' && e.isSourceLoaded) {
      setTimeout(() => loadingEl.classList.add('hidden'), 500);
      map.off('sourcedata', onData);
    }
  };
  map.on('sourcedata', onData);

  // Fallback: dismiss after timeout
  setTimeout(() => loadingEl.classList.add('hidden'), 4000);

  // Check MVT tile availability
  checkTileStatus(map, statusEl);
}

/** Convert lng/lat to tile coordinates */
function lngLatToTile(
  lng: number,
  lat: number,
  z: number,
): { x: number; y: number; z: number } {
  const x = Math.floor(((lng + 180) / 360) * (1 << z));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      (1 << z),
  );
  return { x, y, z };
}

/** Test if the Kontur MVT endpoint is reachable */
async function checkTileStatus(
  map: maplibregl.Map,
  statusEl: HTMLElement,
): Promise<void> {
  try {
    const center = map.getCenter();
    const tile = lngLatToTile(center.lng, center.lat, 6);
    const url = KONTUR_MVT_URL
      .replace('{z}', String(tile.z))
      .replace('{x}', String(tile.x))
      .replace('{y}', String(tile.y));

    const res = await fetch(url, { method: 'HEAD' });

    if (res.ok) {
      statusEl.textContent = `MVT OK \u2014 ${res.headers.get('content-type') ?? 'unknown'}`;
      setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    } else {
      statusEl.textContent = `MVT ${res.status}`;
    }
  } catch {
    statusEl.textContent = 'MVT: network error';
  }
}
