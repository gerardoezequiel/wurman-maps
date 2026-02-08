/** Kontur bivariate MVT endpoint — H3 hexagons with 196 properties */
export const KONTUR_MVT_URL =
  'https://apps.disaster.ninja/active/api/tiles/bivariate/v1/{z}/{x}/{y}.mvt?indicatorsClass=general';

/** Wurman color palette — land cover classification */
export const COLORS = {
  urban:    '#C45B52',
  forest:   '#2D5A3F',
  cropland: '#C9A84C',
  grass:    '#6B8E5A',
  water:    '#5B8DB8',
  bare:     '#B8A88A',
  mixed:    '#8B7D6B',
} as const;

/** City preset for navigation */
export interface City {
  name: string;
  lng: number;
  lat: number;
  zoom: number;
}

/** City presets — drives button generation and flyTo navigation */
export const CITIES: readonly City[] = [
  { name: 'London',    lng: -0.07, lat: 51.52, zoom: 10.5 },
  { name: 'Barcelona', lng: 2.17,  lat: 41.39, zoom: 11   },
  { name: 'Amsterdam', lng: 4.89,  lat: 52.37, zoom: 11   },
  { name: 'Berlin',    lng: 13.40, lat: 52.52, zoom: 10.5 },
  { name: 'Rome',      lng: 12.49, lat: 41.89, zoom: 11   },
  { name: 'Paris',     lng: 2.35,  lat: 48.86, zoom: 11   },
] as const;

/** Population saturation slider defaults */
export const DEFAULT_MAX_POP = 5000;
export const POP_SLIDER_MIN = 500;
export const POP_SLIDER_MAX = 20000;
export const POP_SLIDER_STEP = 500;
