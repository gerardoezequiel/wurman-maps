/**
 * Extract H3 res-8 population from kpop.pmtiles for the 10 city bboxes.
 *
 * kpop.pmtiles is Kontur Population tiled to z0-9 (layer "kpop", field "pop",
 * Polygon geometry = H3 res-8 cells). We decode the z9 tiles covering each
 * city, convert each cell to WGS84 via toGeoJSON, take the centroid, derive the
 * H3 res-8 index, and record (h3, population, lng, lat).
 *
 * Output: data/sources/population.csv  (h3,population,lng,lat)
 *
 * Run: node data/extract-population.mjs
 */
import { PMTiles } from 'pmtiles';
import { gunzipSync } from 'node:zlib';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import { latLngToCell } from 'h3-js';
import { mkdirSync, writeFileSync } from 'node:fs';

const KPOP_URL = 'https://data.source.coop/smartmaps/foil4gr1/kpop.pmtiles';
const Z = 9; // max zoom of kpop — least simplified
const RES = 8;

// metro bboxes [west, south, east, north] — generous to include the fringe
const CITIES = {
  London:     [-0.55, 51.28, 0.34, 51.72],
  Barcelona:  [ 1.85, 41.22, 2.40, 41.58],
  Amsterdam:  [ 4.60, 52.20, 5.20, 52.55],
  Berlin:     [13.05, 52.34, 13.77, 52.69],
  Rome:       [12.20, 41.70, 12.80, 42.05],
  Paris:      [ 2.05, 48.70, 2.65, 49.02],
  Madrid:     [-3.98, 40.20, -3.42, 40.64],
  'Las Palmas':[-15.60, 27.95, -15.30, 28.20],
  'New York': [-74.35, 40.45, -73.65, 40.95],
  Tokyo:      [139.40, 35.45, 140.00, 35.92],
};

function lon2tile(lon, z) { return Math.floor(((lon + 180) / 360) * 2 ** z); }
function lat2tile(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

function ringCentroid(coords) {
  let cx = 0, cy = 0;
  for (const [x, y] of coords) { cx += x; cy += y; }
  return [cx / coords.length, cy / coords.length];
}

class HttpSource {
  constructor(url) { this.url = url; }
  getKey() { return this.url; }
  async getBytes(offset, length, signal) {
    const resp = await fetch(this.url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` }, signal });
    return { data: await resp.arrayBuffer(), etag: resp.headers.get('etag') || undefined };
  }
}

const p = new PMTiles(new HttpSource(KPOP_URL));

/** Map of h3 -> {population, lng, lat} (deduped across tiles/cities) */
const cells = new Map();

async function processTile(z, x, y, bbox) {
  let res;
  try { res = await p.getZxy(z, x, y); } catch { return 0; }
  if (!res || !res.data) return 0;
  let buf = Buffer.from(res.data);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  const tile = new VectorTile(new Protobuf(buf));
  const layer = tile.layers.kpop;
  if (!layer) return 0;
  let added = 0;
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const gj = f.toGeoJSON(x, y, z);
    const pop = f.properties.pop;
    if (!pop || pop <= 0) continue;
    let lng, lat;
    const g = gj.geometry;
    if (g.type === 'Polygon') [lng, lat] = ringCentroid(g.coordinates[0]);
    else if (g.type === 'Point') [lng, lat] = g.coordinates;
    else if (g.type === 'MultiPolygon') [lng, lat] = ringCentroid(g.coordinates[0][0]);
    else continue;
    if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
    let h3;
    try { h3 = latLngToCell(lat, lng, RES); } catch { continue; }
    const prev = cells.get(h3);
    if (!prev || pop > prev.population) cells.set(h3, { population: Math.round(pop), lng, lat });
    added++;
  }
  return added;
}

async function main() {
  for (const [name, bbox] of Object.entries(CITIES)) {
    const x0 = lon2tile(bbox[0], Z), x1 = lon2tile(bbox[2], Z);
    const y0 = lat2tile(bbox[3], Z), y1 = lat2tile(bbox[1], Z); // note: lat inverted
    let cityCount = 0;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        cityCount += await processTile(Z, x, y, bbox);
      }
    }
    console.log(`${name.padEnd(11)} tiles x[${x0}..${x1}] y[${y0}..${y1}]  +${cityCount} cells`);
  }

  mkdirSync('data/sources', { recursive: true });
  const lines = ['h3,population,lng,lat'];
  for (const [h3, v] of cells) lines.push(`${h3},${v.population},${v.lng.toFixed(6)},${v.lat.toFixed(6)}`);
  writeFileSync('data/sources/population.csv', lines.join('\n') + '\n');
  console.log(`\nWrote ${cells.size} unique H3 cells to data/sources/population.csv`);
}

main().catch((e) => { console.error(e); process.exit(1); });
