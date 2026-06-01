/**
 * Self-hosted H3 res-8 dataset (population + Overture-derived land cover, land
 * use, POIs) for the 10 city presets, built by data/build-h3.sql and served
 * from public/. Fully self-contained — no third-party tile dependency.
 */
const DEFAULT_POP_PMTILES = '/wurman_cities.pmtiles';

/**
 * Population-only fallback: Kontur Population on source.coop. Used only if the
 * self-hosted dataset is overridden away; land use then falls back to sampling
 * the Overture basemap at runtime.
 */
export const KPOP_FALLBACK = 'https://data.source.coop/smartmaps/foil4gr1/kpop.pmtiles';

/**
 * Active H3 tile source. Override via VITE_POP_PMTILES_URL to point at a hosted
 * copy (e.g. wurman_cities.pmtiles on R2/CloudFront).
 */
export const TILES_PMTILES = import.meta.env.VITE_POP_PMTILES_URL || DEFAULT_POP_PMTILES;

/**
 * Dummy URL template for deck.gl MVTLayer — intercepted by custom fetch
 * that reads from TILES_PMTILES. The {z}/{x}/{y} are parsed by the fetch.
 */
export const TILES = `${TILES_PMTILES}/{z}/{x}/{y}.mvt`;

/** Overture Maps PMTiles base layers (CloudFront CDN) */
export const OVERTURE = 'https://d3c1b7bog2u1nn.cloudfront.net/2025-10-22';

/** Color palette — #bf3d55 #79d47e #fdf285 #64b3c9 #96fcfe #0000f5 */
export const COL = {
  mauve:   [160, 90, 110] as const,
  crimson: [191, 61, 85] as const,   // #bf3d55
  green:   [121, 212, 126] as const, // #79d47e
  indigo:  [43, 33, 80] as const,
  blue:    [100, 179, 201] as const, // #64b3c9
  cyan:    [150, 252, 254] as const, // #96fcfe
};

/** Population bins — Wurman-style discrete size classes */
export interface Bin {
  min: number;
  max: number;
  label: string;
  dotR: number;
}

export const BINS: readonly Bin[] = [
  { min: 0,    max: 49,       label: '< 50',        dotR: 0.00 },
  { min: 50,   max: 200,      label: '50 \u00B7 200',    dotR: 0.20 },
  { min: 201,  max: 500,      label: '201 \u00B7 500',   dotR: 0.38 },
  { min: 501,  max: 1200,     label: '501 \u00B7 1200',  dotR: 0.56 },
  { min: 1201, max: 3600,     label: '1201 \u00B7 3600', dotR: 0.76 },
  { min: 3601, max: Infinity, label: 'over 3600',   dotR: 0.94 },
] as const;

export function getBin(pop: number): number {
  for (let i = BINS.length - 1; i >= 0; i--) {
    if (pop >= BINS[i].min) return i;
  }
  return 0;
}

/** City preset */
export interface City {
  name: string;
  abbr: string;
  lng: number;
  lat: number;
  zoom: number;
}

export const CITIES: readonly City[] = [
  { name: 'London',     abbr: 'LON', lng: -0.10,  lat: 51.505, zoom: 10.4 },
  { name: 'Barcelona',  abbr: 'BCN', lng: 2.17,   lat: 41.39,  zoom: 10.8 },
  { name: 'Amsterdam',  abbr: 'AMS', lng: 4.89,   lat: 52.37,  zoom: 10.8 },
  { name: 'Berlin',     abbr: 'BER', lng: 13.40,  lat: 52.52,  zoom: 10.2 },
  { name: 'Rome',       abbr: 'ROM', lng: 12.49,  lat: 41.89,  zoom: 10.5 },
  { name: 'Paris',      abbr: 'PAR', lng: 2.35,   lat: 48.86,  zoom: 10.4 },
  { name: 'Madrid',     abbr: 'MAD', lng: -3.70,  lat: 40.42,  zoom: 10.5 },
  { name: 'Las Palmas', abbr: 'LPA', lng: -15.42, lat: 28.10,  zoom: 11.8 },
  { name: 'New York',   abbr: 'NYC', lng: -74.00, lat: 40.71,  zoom: 10.2 },
  { name: 'Tokyo',      abbr: 'TKY', lng: 139.69, lat: 35.69,  zoom: 10.2 },
] as const;

/** Constants */
export const SAT = 3000;
export const MISREG = 1.2;
export const CELL_M = 800;

/**
 * Square grid cell size in meters (drives glyph SIZE).
 */
export const GRID_M = 870;

/**
 * Snap-grid cell size, in degrees of the Web Mercator screen lattice.
 * H3 centroids are snapped to this regular grid (equal spacing in x = lng and
 * y = mercator-projected lat) so glyphs align in clean horizontal rows and
 * vertical columns — the Passonneau/Wurman & 300.000 Km/s square raster —
 * instead of the offset, latitude-drifting H3 hex lattice. Smaller = denser/
 * richer (more glyphs); larger = coarser. Tuned to ≈ H3 res-8 screen spacing.
 */
export const GRID_DEG = 0.0095;

/** Land cover field colors — from palette */
export const FC = {
  crop:   [253, 242, 133] as const,  // #fdf285 — yellow agriculture
  urban:  [210, 130, 155] as const,  // muted crimson — urban fabric
  trans:  [235, 195, 155] as const,  // warm peach — transitional
  forest: [121, 212, 126] as const,  // #79d47e — green forest
  grass:  [160, 225, 140] as const,  // lighter green — grassland
  water:  [150, 252, 254] as const,  // #96fcfe — cyan water
  bare:   [195, 190, 180] as const,  // light grey — rocky/bare
  snow:   [240, 240, 245] as const,  // near-white — snow/ice
  mixed:  [210, 200, 180] as const,  // warm grey fallback
};
