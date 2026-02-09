/** Kontur bivariate MVT endpoint — H3 hexagons with 196 properties */
export const TILES =
  'https://disaster.ninja/active/api/tiles/bivariate/v1/{z}/{x}/{y}.mvt?indicatorsClass=general';

/** Overture Maps PMTiles base layers */
export const OVERTURE = 'https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/2025-10-22';

/** Color palette */
export const COL = {
  mauve:   [176, 112, 128] as const,
  crimson: [194, 56, 90] as const,
  green:   [72, 168, 69] as const,
  indigo:  [43, 33, 80] as const,
  blue:    [62, 107, 138] as const,
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
export const GRAIN = 0.40;
export const MISREG = 1.2;
export const CELL_M = 800;

/** Land cover field colors */
export const FC = {
  forest: [88, 128, 88] as const,
  crop:   [170, 150, 68] as const,
  water:  [88, 125, 150] as const,
  grass:  [125, 155, 105] as const,
  urban:  [165, 138, 120] as const,
  bare:   [160, 150, 128] as const,
  mixed:  [150, 142, 126] as const,
};
