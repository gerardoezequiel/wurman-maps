import { cellToLatLng } from 'h3-js';
import { getBin, FC } from '../config';
import type { RGB } from './types';

export type LandUse = 'residential' | 'green' | 'commercial' | 'industrial' | 'institutional' | 'water';

/** Kontur MVT feature properties (partial) */
export interface KonturProps {
  h3?: string;
  population?: number;
  area_km2?: number;
  builtup?: number;
  residential?: number;
  forest?: number;
  evergreen_needle_leaved_forest?: number;
  unknown_forest?: number;
  cropland?: number;
  permanent_water?: number;
  wetland?: number;
  herbage?: number;
  shrubs?: number;
  bare_vegetation?: number;
  moss_lichen?: number;
  snow_ice?: number;
  industrial_area?: number;
  osm_schools_count?: number;
  osm_universities_count?: number;
  osm_colleges_count?: number;
  osm_kindergartens_count?: number;
  foursquare_os_places_count?: number;
  eatery_count?: number;
  dining_and_drinking_fsq_count?: number;
  retail_fsq_count?: number;
  night_lights_intensity?: number;
  ghs_avg_building_height?: number;
  total_building_count?: number;
  building_count?: number;
  total_road_length?: number;
  [key: string]: unknown;
}

export interface PreparedFeature {
  properties: KonturProps;
  __pos?: [number, number, number];
  __cls?: LandUse;
  __bin?: number;
  __jx?: number;
  __jy?: number;
  __jx2?: number;
  __jy2?: number;
  __jx3?: number;
  __jy3?: number;
  __field?: RGB;
  __c?: boolean;
}

/** Classify land use from Kontur properties */
export function classify(p: KonturProps): LandUse {
  const wa = (p.permanent_water || 0) + (p.wetland || 0);
  if (wa > 0.35) return 'water';

  const fo = (p.forest || 0) + (p.evergreen_needle_leaved_forest || 0) + (p.unknown_forest || 0);
  const cr = p.cropland || 0;
  const gr = (p.herbage || 0) + (p.shrubs || 0);
  const bu = (p.builtup || 0) + (p.residential || 0);
  if ((fo + gr + cr) > 0.25 && bu < 0.30) return 'green';

  if ((p.industrial_area || 0) > 0.04) return 'industrial';

  const inst = (p.osm_schools_count || 0) + (p.osm_universities_count || 0) +
               (p.osm_colleges_count || 0) + (p.osm_kindergartens_count || 0);
  if (inst > 0) return 'institutional';

  const comm = p.foursquare_os_places_count || 0;
  const eat = (p.eatery_count || 0) + (p.dining_and_drinking_fsq_count || 0) +
              (p.retail_fsq_count || 0);
  if (comm > 4 || eat > 1) return 'commercial';

  return 'residential';
}

/** Dominant land cover color */
export function fieldRGB(p: KonturProps): RGB {
  const fo = (p.forest || 0) + (p.evergreen_needle_leaved_forest || 0) + (p.unknown_forest || 0);
  const cr = p.cropland || 0;
  const wa = (p.permanent_water || 0) + (p.wetland || 0);
  const gr = (p.herbage || 0) + (p.shrubs || 0);
  const bu = (p.builtup || 0) + (p.residential || 0);
  const ba = (p.bare_vegetation || 0) + (p.moss_lichen || 0);

  const mx = Math.max(fo, cr, wa, gr, bu, ba, 0.01);
  if (mx === fo) return FC.forest;
  if (mx === cr) return FC.crop;
  if (mx === wa) return FC.water;
  if (mx === gr) return FC.grass;
  if (mx === bu) return FC.urban;
  if (mx === ba) return FC.bare;
  return FC.mixed;
}

/** Deterministic hash for H3 index — returns [-1, 1] */
function h3hash(s: string, seed: number): number {
  let h = seed | 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return ((h & 0x7fffffff) / 0x7fffffff) * 2 - 1;
}

/** Pre-compute all derived values on a feature */
export function prep(d: PreparedFeature): void {
  if (d.__c) return;
  try {
    const [lat, lng] = cellToLatLng(d.properties.h3!);
    d.__pos = [lng, lat, 0];
  } catch {
    d.__pos = [0, 0, 0];
  }
  d.__cls = classify(d.properties);
  d.__bin = getBin(d.properties.population || 0);
  const idx = d.properties.h3 || '';
  d.__jx = h3hash(idx, 1);
  d.__jy = h3hash(idx, 2);
  d.__jx2 = h3hash(idx, 3);
  d.__jy2 = h3hash(idx, 4);
  d.__jx3 = h3hash(idx, 5);
  d.__jy3 = h3hash(idx, 6);
  d.__field = fieldRGB(d.properties);
  d.__c = true;
}

export function getPos(d: PreparedFeature): [number, number, number] {
  prep(d);
  return d.__pos!;
}

export function getCls(d: PreparedFeature): LandUse {
  prep(d);
  return d.__cls!;
}

export function getBinI(d: PreparedFeature): number {
  prep(d);
  return d.__bin!;
}
