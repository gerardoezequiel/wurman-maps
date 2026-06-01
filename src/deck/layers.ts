import { MVTLayer } from '@deck.gl/geo-layers';
import { ScatterplotLayer, IconLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { PMTiles } from 'pmtiles';
import { latLngToCell, cellToLatLng } from 'h3-js';
import type maplibregl from 'maplibre-gl';
import { TILES, TILES_PMTILES, COL, BINS, SAT, MISREG, CELL_M, GRID_M } from '../config';
import { createAtlas, IM } from './atlas';
import { createHatchAtlas, HM } from './hatch';
import { prep, getPos, getCls, getBinI } from './classify';
import type { PreparedFeature } from './classify';

const iconAtlas = createAtlas();
const hatchAtlas = createHatchAtlas();

/* ── MapLibre reference for Overture basemap sampling ── */
let mapRef: maplibregl.Map | null = null;
export function setMapRef(map: maplibregl.Map): void { mapRef = map; }

/* ── Async enrichment system ── */
const overtureCache = new Map<string, Record<string, number>>();
let _enrichQueue: PreparedFeature[] = [];
let _enrichTimer: ReturnType<typeof setTimeout> | null = null;
let _enrichCallback: (() => void) | null = null;

export function setEnrichCallback(cb: () => void): void { _enrichCallback = cb; }

/** Apply cached enrichment instantly (no MapLibre queries) */
function applyCachedEnrichment(f: PreparedFeature): void {
  const p = f.properties;
  if ((p as any).__oe) return;
  const h3 = p.h3 as string;
  if (!h3) return;
  const cached = overtureCache.get(h3);
  if (cached) {
    Object.assign(p, cached);
    (p as any).__oe = 1;
    f.__c = false;
  }
}

/** Map Overture queryRenderedFeatures hits → synthetic Kontur properties */
function mapOvertureHits(hits: maplibregl.MapGeoJSONFeature[]): Record<string, number> {
  const e: Record<string, number> = {};
  for (const feat of hits) {
    const sub = feat.properties?.subtype as string | undefined;
    const lid = feat.layer?.id;
    if (lid === 'land-cover') {
      switch (sub) {
        case 'forest':           e.forest = (e.forest || 0) + 0.40; break;
        case 'grass':            e.herbage = (e.herbage || 0) + 0.35; break;
        case 'shrub':            e.shrubs = (e.shrubs || 0) + 0.35; break;
        case 'crop':             e.cropland = (e.cropland || 0) + 0.40; break;
        case 'barren':           e.bare_vegetation = (e.bare_vegetation || 0) + 0.35; break;
        case 'wetland':
          e.wetland = (e.wetland || 0) + 0.30;
          e.permanent_water = (e.permanent_water || 0) + 0.10;
          break;
        case 'snow': case 'ice': e.snow_ice = (e.snow_ice || 0) + 0.35; break;
        case 'moss':             e.moss_lichen = (e.moss_lichen || 0) + 0.25; break;
        case 'urban_vegetation':
          e.forest = (e.forest || 0) + 0.15;
          e.herbage = (e.herbage || 0) + 0.10;
          break;
      }
    } else if (lid === 'land-use') {
      switch (sub) {
        case 'residential':
          e.residential = (e.residential || 0) + 0.30;
          e.builtup = (e.builtup || 0) + 0.15;
          break;
        case 'commercial':
          e.builtup = (e.builtup || 0) + 0.25;
          e.foursquare_os_places_count = (e.foursquare_os_places_count || 0) + 5;
          break;
        case 'industrial':
          e.industrial_area = (e.industrial_area || 0) + 0.15;
          e.builtup = (e.builtup || 0) + 0.10;
          break;
        case 'recreation':
          e.herbage = (e.herbage || 0) + 0.15;
          e.sports_and_recreation_fsq_count = (e.sports_and_recreation_fsq_count || 0) + 1;
          break;
        case 'education':
          e.osm_schools_count = (e.osm_schools_count || 0) + 1;
          e.builtup = (e.builtup || 0) + 0.10;
          break;
        case 'hospital':
          e.osm_hospitals_count = (e.osm_hospitals_count || 0) + 1;
          e.builtup = (e.builtup || 0) + 0.10;
          break;
        case 'military':  e.builtup = (e.builtup || 0) + 0.10; break;
        case 'cemetery':  e.herbage = (e.herbage || 0) + 0.10; break;
        case 'transportation':
          e.builtup = (e.builtup || 0) + 0.10;
          e.industrial_area = (e.industrial_area || 0) + 0.05;
          break;
      }
    } else if (lid === 'water-below') {
      e.permanent_water = (e.permanent_water || 0) + 0.40;
    }
  }
  return e;
}

/** Schedule async Overture enrichment — runs in batches off the render thread */
function scheduleEnrichment(features: PreparedFeature[]): void {
  _enrichQueue.push(...features);
  if (_enrichTimer) return;
  _enrichTimer = setTimeout(processEnrichBatch, 120); // let Overture tiles settle
}

function processEnrichBatch(): void {
  _enrichTimer = null;
  if (!mapRef || !_enrichQueue.length) return;

  const BATCH = 200;
  const batch = _enrichQueue.splice(0, BATCH);
  let changed = false;

  const { clientWidth: cw, clientHeight: ch } = mapRef.getCanvas();

  for (const f of batch) {
    const p = f.properties;
    if ((p as any).__oe) continue;
    const h3 = p.h3 as string;
    if (!h3) continue;

    // Serve from cache
    if (overtureCache.has(h3)) {
      Object.assign(p, overtureCache.get(h3)!);
      (p as any).__oe = 1;
      f.__c = false;
      changed = true;
      continue;
    }

    // Project to screen
    let pt: maplibregl.Point;
    try {
      const [lat, lng] = cellToLatLng(h3);
      pt = mapRef.project([lng, lat]);
    } catch { continue; }

    if (pt.x < -50 || pt.y < -50 || pt.x > cw + 50 || pt.y > ch + 50) continue;

    let hits: maplibregl.MapGeoJSONFeature[];
    try {
      hits = mapRef.queryRenderedFeatures(pt, {
        layers: ['land-cover', 'land-use', 'water-below'],
      });
    } catch { continue; }

    if (!hits.length) continue; // Overture tiles may not be loaded — skip, retry on next move

    const e = mapOvertureHits(hits);
    if (Object.keys(e).length > 0) {
      overtureCache.set(h3, e);
      Object.assign(p, e);
      changed = true;
    }
    (p as any).__oe = 1;
    f.__c = false;
  }

  if (_enrichQueue.length) {
    _enrichTimer = setTimeout(processEnrichBatch, 8); // yield to browser between batches
  } else if (changed && _enrichCallback) {
    _enrichCallback(); // trigger deck.gl re-render with enriched classifications
  }
}

/* ── PMTiles tile loader for deck.gl ── */
const pm = new PMTiles(TILES_PMTILES);

/**
 * Custom fetch prop for MVTLayer — intercepts PMTiles URLs and returns parsed features.
 * deck.gl 9.x MVTLayer calls `this.props.fetch(url, context)` in getTileData().
 * The default fetch uses loaders.gl `load()`, so we do the same but from PMTiles.
 */
async function pmtilesFetch(url: string, context: any): Promise<any> {
  // Match the {z}/{x}/{y}.mvt the MVTLayer appends — generic so a renamed
  // mirror (e.g. wurman_cities.pmtiles) still resolves.
  const match = url.match(/\/(\d+)\/(\d+)\/(\d+)\.mvt\b/);
  if (match) {
    const z = +match[1], x = +match[2], y = +match[3];
    try {
      const tile = await pm.getZxy(z, x, y);
      if (!tile?.data) return null;
      const { parse } = await import('@loaders.gl/core');
      const { MVTLoader } = await import('@loaders.gl/mvt');
      // CRITICAL: pass the tile index + coordinates:'wgs84' so MVTLoader
      // projects local tile coordinates to lng/lat. Without this, features
      // parse in local space and all glyphs collapse near (0,0).
      return await parse(tile.data, MVTLoader, {
        ...context?.loadOptions,
        mvt: {
          ...context?.loadOptions?.mvt,
          shape: 'geojson',
          coordinates: 'wgs84',
          tileIndex: { x, y, z },
        },
      });
    } catch (err) {
      // Never swallow silently: log and return null so the layer renders empty
      // rather than throwing inside the tile pipeline.
      console.error(`[wurman] kpop tile ${z}/${x}/${y} failed:`, err);
      return null;
    }
  }
  // Fallback to default fetch for non-PMTiles URLs
  const { load } = await import('@loaders.gl/core');
  return load(url, context?.loadOptions);
}

/** Compute centroid of a polygon ring */
function ringCentroid(ring: number[][]): [number, number] {
  let cx = 0, cy = 0;
  for (const [x, y] of ring) { cx += x; cy += y; }
  return [cx / ring.length, cy / ring.length];
}

/** Normalize tile features: map pop→population, derive h3, flag baked attributes. */
function normalizeFeature(f: PreparedFeature): void {
  const p = f.properties;
  // Map kpop's 'pop' to 'population'
  if (p.pop !== undefined && p.population === undefined) {
    p.population = p.pop as number;
  }
  // Derive H3 index from geometry centroid if not present
  if (!p.h3) {
    const geom = (f as any).geometry;
    if (geom) {
      let lng: number, lat: number;
      if (geom.type === 'Point') {
        [lng, lat] = geom.coordinates;
      } else if (geom.type === 'Polygon') {
        [lng, lat] = ringCentroid(geom.coordinates[0]);
      } else {
        return;
      }
      try { p.h3 = latLngToCell(lat, lng, 8); } catch { /* skip */ }
    }
  }
  // If the dataset already carries baked land-cover/POI attributes (the
  // self-hosted wurman_cities.pmtiles), mark it pre-enriched so the Overture
  // basemap-sampling fallback is skipped and fractions are not double-counted.
  if ((p as any).__oe === undefined && (p.builtup !== undefined || p.forest !== undefined)) {
    (p as any).__oe = 1;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * Math.max(0, Math.min(1, t));

// Glyph opacity: fade in z 7.5–9.5
function glyphOp(z: number): number { return lerp(0, 1.0, (z - 7.5) / 2); }
// Terrain field: much lower max opacity — let white show through
function fieldOp(z: number): number { return lerp(0, 0.50, (z - 5) / 2.5); }

const seenH3 = new Set<string>();

export function clearSeen(): void {
  seenH3.clear();
}

/** Total population features parsed from the tile source — for the data-health check. */
let _loadedFeatureCount = 0;
export function getLoadedFeatureCount(): number {
  return _loadedFeatureCount;
}

/** Dark crimson for outline containers — derived from #bf3d55 */
const DK = [130, 42, 58] as [number, number, number];
/** Steel blue accent for commercial — #64b3c9 */
const TL = [100, 179, 201] as [number, number, number];

export function buildLayers(Z: number): Layer[] {
  const z = Z;
  const gOp = glyphOp(z);
  const fOp = fieldOp(z);
  const m = MISREG;

  return [
    new MVTLayer({
      id: 'k',
      data: TILES,
      minZoom: 0,
      maxZoom: 9,
      binary: false,
      fetch: pmtilesFetch,

      onViewportLoad: (tiles: unknown) => {
        seenH3.clear();
        const toEnrich: PreparedFeature[] = [];
        let count = 0;
        if (tiles && Array.isArray(tiles)) {
          for (const t of tiles) {
            const tile = t as { data?: PreparedFeature[] };
            if (tile.data) {
              for (const f of tile.data) {
                normalizeFeature(f);
                applyCachedEnrichment(f);   // instant if already in cache
                if (f.properties?.h3) prep(f);
                if (!(f.properties as any).__oe && f.properties?.h3) toEnrich.push(f);
                count++;
              }
            }
          }
        }
        _loadedFeatureCount = count;
        if (toEnrich.length) scheduleEnrichment(toEnrich);
      },

      renderSubLayers: (props: any) => {
        const data = props.data as PreparedFeature[] | undefined;
        if (!data?.length) return null;

        // Normalize kpop properties + derive H3 + apply cached enrichment
        data.forEach(normalizeFeature);
        data.forEach(applyCachedEnrichment);

        // Snap each cell to the square grid, then deduplicate by GRID CELL
        // (not H3) so glyphs land on a regular Wurman raster — one glyph per
        // grid cell, keeping the most-populated H3 cell that maps to it.
        const byGrid = new Map<string, PreparedFeature>();
        for (const d of data) {
          if (!d.properties?.h3) continue;
          prep(d);
          const key = d.__gkey;
          if (!key || seenH3.has(key)) continue;
          const ex = byGrid.get(key);
          if (!ex || (d.properties.population || 0) > (ex.properties.population || 0)) {
            byGrid.set(key, d);
          }
        }
        const allH3: PreparedFeature[] = [];
        for (const [key, d] of byGrid) {
          seenH3.add(key);
          allH3.push(d);
        }

        // ── Data subsets ──
        const populated = allH3.filter((d) => (d.properties.population || 0) > 0);
        const nonTerrain = allH3.filter((d) => !d.__isTerrain);
        const terrainCells = allH3.filter((d) => d.__isTerrain);
        const oceanCells = allH3.filter((d) => d.__isOcean);
        const nonOcean = allH3.filter((d) => !d.__isOcean);

        // Populated non-terrain cells (get full glyphs)
        const popNonTerrain = populated.filter((d) => !d.__isTerrain);

        // By land use — only non-terrain populated
        const residential = popNonTerrain.filter((d) => getCls(d) === 'residential');
        const commercial = popNonTerrain.filter((d) => getCls(d) === 'commercial' || getCls(d) === 'industrial');
        const institutional = popNonTerrain.filter((d) => getCls(d) === 'institutional');

        // Green cells (can include unpopulated) — non-terrain only
        const green = nonTerrain.filter((d) => getCls(d) === 'green');
        const greenPop = green.filter((d) => (d.properties.population || 0) > 0);

        // (Inland water now rendered by MapLibre fill layer above deck.gl)

        // Rural marks
        const rural = nonTerrain.filter((d) => {
          const pop = d.properties.population || 0;
          if (pop > 50) return false;
          const cls = getCls(d);
          if (cls === 'water') return false;
          const cr = d.properties.cropland || 0;
          const bu = (d.properties.builtup || 0) + (d.properties.residential || 0);
          const gr = (d.properties.herbage || 0) + (d.properties.shrubs || 0);
          return cr > 0.08 || (gr > 0.15 && cr > 0.03) || (bu < 0.05 && pop > 0);
        });

        // Zero-pop infrastructure
        const infraOnly = nonTerrain.filter((d) => {
          const pop = d.properties.population || 0;
          if (pop > 0) return false;
          const bu = (d.properties.builtup || 0) + (d.properties.residential || 0);
          const ind = d.properties.industrial_area || 0;
          const airports = d.properties.osm_airports_count || 0;
          const ports = d.properties.osm_ports_count || 0;
          const powerPlants = d.properties.osm_power_plants_count || 0;
          const railLen = d.properties.railway_length || 0;
          return bu > 0.08 || ind > 0.02 || airports > 0 || ports > 0 || powerPlants > 0 || railLen > 1000;
        });

        const layers: Layer[] = [];

        // ═══════════════════════════════════════════════
        // LAYER 1: TERRAIN FIELD — classified raster
        // Smaller squares (~82% of grid) so white gaps show
        // Lower opacity so paper breathes through
        // ═══════════════════════════════════════════════
        if (fOp > 0.01) {
          // Non-ocean cells get the field color
          const fieldCells = nonOcean;
          if (fieldCells.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-fld`,
                data: fieldCells,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'full_sq',
                getSize: GRID_M * 0.82,
                getColor: (d: PreparedFeature) => {
                  const rgb = d.__field!;
                  return [rgb[0], rgb[1], rgb[2], 180];
                },
                sizeUnits: 'meters',
                sizeMinPixels: 2,
                sizeMaxPixels: 80,
                opacity: fOp,
                billboard: false,
              }),
            );
          }
        }

        // ═══════════════════════════════════════════════
        // LAYER 2: HATCH OVERLAY — diagonal lines on field
        // ═══════════════════════════════════════════════
        if (fOp > 0.01) {
          const hatched = nonOcean.filter((d) => d.__hatch && d.__hatch !== 'none');
          if (hatched.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-htch`,
                data: hatched,
                getPosition: getPos,
                iconAtlas: hatchAtlas as any,
                iconMapping: HM,
                getIcon: (d: PreparedFeature) => d.__hatch!,
                getSize: GRID_M * 0.82,
                getColor: (d: PreparedFeature) => {
                  const rgb = d.__field!;
                  return [
                    Math.max(0, rgb[0] - 50),
                    Math.max(0, rgb[1] - 50),
                    Math.max(0, rgb[2] - 50),
                    100,
                  ];
                },
                sizeUnits: 'meters',
                sizeMinPixels: 2,
                sizeMaxPixels: 80,
                opacity: fOp * 0.45,
                billboard: false,
              }),
            );
          }
        }

        // ═══════════════════════════════════════════════
        // LAYER 3: OCEAN DOT TEXTURE — cyan dots (NOT squares)
        // ═══════════════════════════════════════════════
        if (oceanCells.length) {
          layers.push(
            new IconLayer({
              id: `${props.id}-ocean`,
              data: oceanCells,
              getPosition: getPos,
              iconAtlas: iconAtlas as any,
              iconMapping: IM,
              getIcon: () => 'sm_dot',
              getSize: CELL_M * 0.12,
              getColor: () => [150, 252, 254, 180],
              sizeUnits: 'meters',
              sizeMinPixels: 1.5,
              sizeMaxPixels: 7,
              opacity: Math.max(gOp, 0.35),
              billboard: false,
            }),
          );
        }

        // ═══════════════════════════════════════════════
        // LAYER 4: TERRAIN MARKS — tiny green dots & micro crosses
        // For hillshade/elevation areas: NO big squares
        // ═══════════════════════════════════════════════
        if (gOp > 0.01 && terrainCells.length) {
          // Tiny green dots for all terrain cells
          layers.push(
            new IconLayer({
              id: `${props.id}-tdot`,
              data: terrainCells,
              getPosition: getPos,
              iconAtlas: iconAtlas as any,
              iconMapping: IM,
              getIcon: (d: PreparedFeature) => {
                const fo = (d.properties.forest || 0) + (d.properties.evergreen_needle_leaved_forest || 0);
                return fo > 0.15 ? 'micro_cross' : 'dot_tiny';
              },
              getSize: (d: PreparedFeature) => {
                const fo = (d.properties.forest || 0) + (d.properties.evergreen_needle_leaved_forest || 0);
                return fo > 0.15 ? CELL_M * 0.15 : CELL_M * 0.06;
              },
              getColor: (d: PreparedFeature) => {
                const fo = (d.properties.forest || 0) + (d.properties.evergreen_needle_leaved_forest || 0);
                if (fo > 0.15) return [...COL.green, 170];
                const cr = d.properties.cropland || 0;
                if (cr > 0.10) return [...COL.crimson, 100];
                return [...COL.green, 110];
              },
              sizeUnits: 'meters',
              sizeMinPixels: 0.5,
              sizeMaxPixels: 10,
              opacity: gOp * 0.8,
              billboard: false,
            }),
          );
        }

        // ═══════════════════════════════════════════════
        // LAYER 5: RURAL MARKS — x-crosses, tiny dots
        // ═══════════════════════════════════════════════
        if (gOp > 0.01) {
          // Agricultural x-crosses
          const agri = rural.filter((d) => (d.properties.cropland || 0) > 0.15);
          if (agri.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-rx`,
                data: agri,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'x_cross',
                getSize: CELL_M * 0.18,
                getColor: () => [...COL.crimson, 140],
                sizeUnits: 'meters',
                sizeMinPixels: 1,
                sizeMaxPixels: 12,
                opacity: gOp * 0.7,
                billboard: false,
              }),
            );
          }

          // Sparse rural dots
          const sparse = rural.filter((d) => (d.properties.cropland || 0) <= 0.15 && (d.properties.population || 0) > 0);
          if (sparse.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-rd`,
                data: sparse,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'red_dot',
                getSize: CELL_M * 0.10,
                getColor: () => [...COL.crimson, 110],
                sizeUnits: 'meters',
                sizeMinPixels: 0.5,
                sizeMaxPixels: 7,
                opacity: gOp * 0.55,
                billboard: false,
              }),
            );
          }

          // Zero-pop infrastructure: hollow outline squares
          if (infraOnly.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-hq`,
                data: infraOnly,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'hollow_sq',
                getSize: CELL_M * 0.40,
                getColor: () => [...DK, 90],
                sizeUnits: 'meters',
                sizeMinPixels: 2,
                sizeMaxPixels: 28,
                opacity: gOp * 0.45,
                billboard: false,
              }),
            );
          }
        }

        // ═══════════════════════════════════════════════
        // LAYER 6: OUTER CONTAINERS — square/circle outlines
        // KEY CHANGE: Use square outlines as primary motif
        // Population-based rendering:
        //   bin 0: NOTHING (white space)
        //   bin 1: thin outline only
        //   bin 2+: bold outline (+ inner symbols later)
        //   bin 4-5: concentric squares
        // ═══════════════════════════════════════════════
        if (gOp > 0.01) {

          // ── RESIDENTIAL: Square outlines (primary Wurman motif) ──
          // bin 1: thin outlines only
          const resBin1 = residential.filter((d) => getBinI(d) === 1);
          if (resBin1.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-r1`,
                data: resBin1,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'hollow_sq',
                getSize: CELL_M * 0.28,
                getColor: () => [...DK, 160],
                sizeUnits: 'meters',
                sizeMinPixels: 2,
                sizeMaxPixels: 20,
                opacity: gOp * 0.8,
                billboard: false,
              }),
            );
          }

          // bin 2-3: medium square outlines
          const resBin23 = residential.filter((d) => {
            const b = getBinI(d);
            return b === 2 || b === 3;
          });
          if (resBin23.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-r23`,
                data: resBin23,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'square_ring',
                getSize: (d: PreparedFeature) => BINS[getBinI(d)].dotR * CELL_M * 1.0,
                getColor: (d: PreparedFeature) => [...DK, 190 + Math.round(d.__jy! * 25)],
                sizeUnits: 'meters',
                sizeMinPixels: 3,
                sizeMaxPixels: 55,
                opacity: gOp,
                billboard: false,
              }),
            );
          }

          // bin 4-5: bold square outlines (largest)
          const resBin45 = residential.filter((d) => getBinI(d) >= 4);
          if (resBin45.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-r45`,
                data: resBin45,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'bold_sq',
                getSize: (d: PreparedFeature) => BINS[getBinI(d)].dotR * CELL_M * 1.05,
                getColor: (d: PreparedFeature) => [...DK, 220 + Math.round(d.__jy! * 20)],
                sizeUnits: 'meters',
                sizeMinPixels: 5,
                sizeMaxPixels: 70,
                opacity: gOp,
                billboard: false,
              }),
            );
          }

          // bin 4-5: CONCENTRIC inner ring (second square outline)
          if (resBin45.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-r45c`,
                data: resBin45,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'square_ring',
                getSize: (d: PreparedFeature) => BINS[getBinI(d)].dotR * CELL_M * 0.60,
                getColor: (d: PreparedFeature) => [...COL.mauve, 170 + Math.round(d.__jx! * 20)],
                sizeUnits: 'meters',
                sizeMinPixels: 3,
                sizeMaxPixels: 42,
                opacity: gOp * 0.85,
                getPixelOffset: (d: PreparedFeature) => [d.__jx! * m * 0.6, d.__jy! * m * 0.6],
                billboard: false,
                updateTriggers: { getPixelOffset: [m] },
              }),
            );
          }

          // ── COMMERCIAL / INDUSTRIAL: Square outlines + teal tint ──
          if (commercial.length) {
            // bin 1: thin outline
            const commBin1 = commercial.filter((d) => getBinI(d) === 1);
            if (commBin1.length) {
              layers.push(
                new IconLayer({
                  id: `${props.id}-c1`,
                  data: commBin1,
                  getPosition: getPos,
                  iconAtlas: iconAtlas as any,
                  iconMapping: IM,
                  getIcon: () => 'hollow_sq',
                  getSize: CELL_M * 0.28,
                  getColor: () => [...TL, 140],
                  sizeUnits: 'meters',
                  sizeMinPixels: 2,
                  sizeMaxPixels: 20,
                  opacity: gOp * 0.75,
                  billboard: false,
                }),
              );
            }

            // bin 2+: bold square outlines
            const commBin2p = commercial.filter((d) => getBinI(d) >= 2);
            if (commBin2p.length) {
              layers.push(
                new IconLayer({
                  id: `${props.id}-c2`,
                  data: commBin2p,
                  getPosition: getPos,
                  iconAtlas: iconAtlas as any,
                  iconMapping: IM,
                  getIcon: (d: PreparedFeature) => getBinI(d) >= 4 ? 'bold_sq' : 'square_ring',
                  getSize: (d: PreparedFeature) => BINS[getBinI(d)].dotR * CELL_M * 1.0,
                  getColor: (d: PreparedFeature) => [...DK, 185 + Math.round(d.__jx2! * 25)],
                  sizeUnits: 'meters',
                  sizeMinPixels: 3,
                  sizeMaxPixels: 65,
                  opacity: gOp,
                  billboard: false,
                }),
              );
            }
          }

          // ── INSTITUTIONAL: Square outline + circle inner ──
          if (institutional.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-inst`,
                data: institutional,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: (d: PreparedFeature) => getBinI(d) >= 3 ? 'sq_circle' : 'square_ring',
                getSize: (d: PreparedFeature) => {
                  const bi = getBinI(d);
                  const r = bi === 0 ? 0.15 : BINS[bi].dotR;
                  return r * CELL_M * 1.0;
                },
                getColor: (d: PreparedFeature) => [...DK, 175 + Math.round(d.__jy2! * 20)],
                sizeUnits: 'meters',
                sizeMinPixels: 2,
                sizeMaxPixels: 60,
                opacity: gOp * 0.9,
                billboard: false,
              }),
            );
          }

          // ── GREEN: FOREST → cross_plus / PARK → thin_ring / GRASS → sm_dot ──
          const greenForest = green.filter((d) => d.__greenSub === 'forest');
          if (greenForest.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-gf`,
                data: greenForest,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: (d: PreparedFeature) => {
                  const pop = d.properties.population || 0;
                  if (pop > 200) return 'bold_cross';
                  return 'cross_plus';
                },
                getSize: (d: PreparedFeature) => {
                  const pop = d.properties.population || 0;
                  if (pop === 0) return CELL_M * 0.20;
                  const bi = getBinI(d);
                  const r = bi === 0 ? 0.12 : BINS[bi].dotR;
                  return r * CELL_M * 0.9;
                },
                getColor: (d: PreparedFeature) => [...COL.green, 180 + Math.round(d.__jy2! * 30)],
                sizeUnits: 'meters',
                sizeMinPixels: 1.5,
                sizeMaxPixels: 50,
                opacity: gOp * 0.85,
                billboard: false,
              }),
            );
          }

          const greenPark = green.filter((d) => d.__greenSub === 'park');
          if (greenPark.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-gp`,
                data: greenPark,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'thin_ring',
                getSize: (d: PreparedFeature) => {
                  const pop = d.properties.population || 0;
                  if (pop === 0) return CELL_M * 0.18;
                  const bi = getBinI(d);
                  const r = bi === 0 ? 0.12 : BINS[bi].dotR;
                  return r * CELL_M * 0.85;
                },
                getColor: (d: PreparedFeature) => [...COL.green, 130 + Math.round(d.__jy! * 25)],
                sizeUnits: 'meters',
                sizeMinPixels: 1,
                sizeMaxPixels: 45,
                opacity: gOp * 0.8,
                billboard: false,
              }),
            );
          }

          const greenGrass = green.filter((d) => d.__greenSub === 'grass');
          if (greenGrass.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-gg`,
                data: greenGrass,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'dot_tiny',
                getSize: (d: PreparedFeature) => {
                  const pop = d.properties.population || 0;
                  if (pop === 0) return CELL_M * 0.06;
                  return CELL_M * 0.10;
                },
                getColor: (d: PreparedFeature) => [...COL.green, 120 + Math.round(d.__jy3! * 25)],
                sizeUnits: 'meters',
                sizeMinPixels: 0.5,
                sizeMaxPixels: 6,
                opacity: gOp * 0.75,
                billboard: false,
              }),
            );
          }
        }

        // ═══════════════════════════════════════════════
        // LAYER 7: INNER SYMBOLS — nested inside containers
        // Only for bin 2+ (bin 0-1 get outline only / nothing)
        // ═══════════════════════════════════════════════
        if (gOp > 0.01) {

          // Residential inner: filled square (crimson) — bin 2+ only
          const resInner = residential.filter((d) => getBinI(d) >= 2);
          if (resInner.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-ri`,
                data: resInner,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: (d: PreparedFeature) => {
                  const b = getBinI(d);
                  // bin 2: small dot, bin 3: filled square, bin 4-5: larger filled square
                  if (b === 2) return 'sm_dot';
                  return 'filled_sq';
                },
                getSize: (d: PreparedFeature) => {
                  const b = getBinI(d);
                  if (b === 2) return BINS[b].dotR * CELL_M * 0.25;
                  return BINS[b].dotR * CELL_M * 0.50;
                },
                getColor: (d: PreparedFeature) => [...COL.crimson, 220 + Math.round(d.__jy! * 20)],
                sizeUnits: 'meters',
                sizeMinPixels: 0.5,
                sizeMaxPixels: 35,
                opacity: gOp,
                getPixelOffset: (d: PreparedFeature) => [d.__jx! * m * 1.2, d.__jy! * m * 1.2],
                billboard: false,
                pickable: gOp > 0.2,
                autoHighlight: true,
                highlightColor: [255, 255, 255, 50],
                updateTriggers: { getSize: [SAT], getPixelOffset: [m] },
              }),
            );
          }

          // Commercial inner: filled circle (teal for commercial, crimson for industrial) — bin 2+
          const commInner = commercial.filter((d) => getBinI(d) >= 2);
          if (commInner.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-ci`,
                data: commInner,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: (d: PreparedFeature) => {
                  const b = getBinI(d);
                  if (b === 2) return 'sm_dot';
                  return 'circle_dot';
                },
                getSize: (d: PreparedFeature) => {
                  const b = getBinI(d);
                  if (b === 2) return BINS[b].dotR * CELL_M * 0.22;
                  return BINS[b].dotR * CELL_M * 0.45;
                },
                getColor: (d: PreparedFeature) => {
                  const cls = getCls(d);
                  if (cls === 'commercial') return [...TL, 210 + Math.round(d.__jx3! * 20)];
                  return [...COL.crimson, 200 + Math.round(d.__jx3! * 20)];
                },
                sizeUnits: 'meters',
                sizeMinPixels: 0.5,
                sizeMaxPixels: 30,
                opacity: gOp * 0.9,
                getPixelOffset: (d: PreparedFeature) => [d.__jx3! * m * 1.1, d.__jy3! * m * 1.1],
                billboard: false,
                updateTriggers: { getPixelOffset: [m] },
              }),
            );
          }

          // Institutional inner: diamond (teal)
          const instInner = institutional.filter((d) => getBinI(d) >= 2);
          if (instInner.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-iid`,
                data: instInner,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'diamond',
                getSize: (d: PreparedFeature) => {
                  const bi = getBinI(d);
                  return BINS[bi].dotR * CELL_M * 0.38;
                },
                getColor: (d: PreparedFeature) => [60, 120, 125, 170 + Math.round(d.__jy2! * 20)],
                sizeUnits: 'meters',
                sizeMinPixels: 1,
                sizeMaxPixels: 25,
                opacity: gOp * 0.85,
                getPixelOffset: (d: PreparedFeature) => [d.__jx2! * m * 0.8, d.__jy3! * m * 0.8],
                billboard: false,
                updateTriggers: { getPixelOffset: [m] },
              }),
            );
          }

          // Green inner: crimson dot at center (forest/park only, bin 2+)
          const greenInner = greenPop.filter((d) => getBinI(d) >= 2 && d.__greenSub !== 'grass');
          if (greenInner.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-gi`,
                data: greenInner,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'sm_dot',
                getSize: (d: PreparedFeature) => BINS[getBinI(d)].dotR * CELL_M * 0.25,
                getColor: (d: PreparedFeature) => [...COL.crimson, 160 + Math.round(d.__jy! * 25)],
                sizeUnits: 'meters',
                sizeMinPixels: 0.5,
                sizeMaxPixels: 16,
                opacity: gOp * 0.8,
                getPixelOffset: (d: PreparedFeature) => [d.__jx2! * m * 0.8, d.__jy2! * m * 0.8],
                billboard: false,
                updateTriggers: { getPixelOffset: [m] },
              }),
            );
          }

          // ── DIAGONAL HATCH GLYPHS ──
          // Agricultural/transitional cells with some population: square + diagonal
          const hatchGlyphs = popNonTerrain.filter((d) => {
            const cr = d.properties.cropland || 0;
            const bu = (d.properties.builtup || 0) + (d.properties.residential || 0);
            const bi = getBinI(d);
            // Agricultural cells with some density
            return cr > 0.12 && bu > 0.05 && bi >= 2;
          });
          if (hatchGlyphs.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-dg`,
                data: hatchGlyphs,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: (d: PreparedFeature) => {
                  const cr = d.properties.cropland || 0;
                  return cr > 0.25 ? 'cross_diag_sq' : 'diag_sq';
                },
                getSize: (d: PreparedFeature) => BINS[getBinI(d)].dotR * CELL_M * 0.75,
                getColor: (d: PreparedFeature) => [...DK, 140 + Math.round(d.__jx! * 20)],
                sizeUnits: 'meters',
                sizeMinPixels: 2,
                sizeMaxPixels: 45,
                opacity: gOp * 0.65,
                billboard: false,
              }),
            );
          }

          // Inland water rendered by MapLibre fill layer (above deck.gl)
        }

        // ═══════════════════════════════════════════════
        // LAYER 8: CHOROPLETH (high zoom fallback)
        // ═══════════════════════════════════════════════
        if (z > 12.5) {
          const op = lerp(0, 0.5, (z - 12.5) / 1.5);
          if (op > 0.01) {
            const CC: Record<string, readonly number[]> = {
              residential: COL.crimson,
              green: COL.green,
              commercial: TL,
              industrial: COL.indigo,
              institutional: [74, 128, 128],
              water: COL.blue,
            };
            layers.push(
              new ScatterplotLayer({
                id: `${props.id}-ch`,
                data: populated,
                getPosition: getPos,
                getRadius: 400,
                getFillColor: (d: PreparedFeature) => {
                  const rgb = CC[getCls(d)] || COL.crimson;
                  const r = Math.min((d.properties.population || 0) / SAT, 1);
                  return [rgb[0], rgb[1], rgb[2], Math.round(Math.pow(r, 0.35) * 150 + 25)];
                },
                radiusUnits: 'meters',
                radiusMinPixels: 3,
                radiusMaxPixels: 70,
                opacity: op,
                antialiasing: true,
                pickable: true,
                autoHighlight: true,
                highlightColor: [255, 255, 255, 30],
                updateTriggers: { getFillColor: [SAT] },
              }),
            );
          }
        }

        return layers;
      },

      updateTriggers: {
        renderSubLayers: [SAT, Math.round(MISREG * 10), Math.round(Z * 3)],
      },
    }),
  ];
}
