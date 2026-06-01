import { cellToLatLng } from 'h3-js';
import { getBin, FC, GRID_DEG } from '../config';
import type { RGB } from './types';

/**
 * Snap a lng/lat to a regular Web Mercator screen grid so glyphs render as
 * aligned rows/columns (the Wurman / 300.000 Km/s square raster) rather than
 * the offset H3 hex lattice. x = lng and y = mercator-y are both linear in
 * screen space, so a fixed-degree grid is equally spaced on screen at every
 * latitude. Returns the snapped [lng, lat, 0] and a stable integer grid key.
 */
const MERC_MAX_LAT = 85.0511287798066;
function mercY(lat: number): number {
  const clamped = Math.max(-MERC_MAX_LAT, Math.min(MERC_MAX_LAT, lat));
  return (Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360)) * 180) / Math.PI;
}
function invMercY(y: number): number {
  return (Math.atan(Math.exp((y * Math.PI) / 180)) * 360) / Math.PI - 90;
}
function snapToGrid(lng: number, lat: number): { pos: [number, number, number]; key: string } {
  const ix = Math.round(lng / GRID_DEG);
  const iy = Math.round(mercY(lat) / GRID_DEG);
  return { pos: [ix * GRID_DEG, invMercY(iy * GRID_DEG), 0], key: `${ix}:${iy}` };
}

export type LandUse = 'residential' | 'green' | 'commercial' | 'industrial' | 'institutional' | 'water';

/** Kontur MVT feature properties — expanded for full 196-property dataset */
export interface KonturProps {
  h3?: string;
  population?: number;
  area_km2?: number;
  populated_area_km2?: number;

  // Land cover fractions
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

  // Vegetation & terrain
  avg_ndvi?: number;
  avg_elevation_gebco?: number;
  avg_slope_gebco?: number;
  avg_forest_canopy_height?: number;
  max_forest_canopy_height?: number;

  // Building morphology
  ghs_avg_building_height?: number;
  ghs_max_building_height?: number;
  avg_osm_building_levels?: number;
  max_osm_building_levels?: number;
  total_building_count?: number;
  building_count?: number;

  // Night lights
  night_lights_intensity?: number;

  // Transport infrastructure
  total_road_length?: number;
  motor_vehicle_road_length?: number;
  highway_length?: number;
  railway_length?: number;
  pipeline_length?: number;
  powerlines?: number;

  // OSM facility counts
  osm_schools_count?: number;
  osm_universities_count?: number;
  osm_colleges_count?: number;
  osm_kindergartens_count?: number;
  osm_hospitals_count?: number;
  osm_clinics_count?: number;
  osm_hotels_count?: number;
  osm_entertainment_venues_count?: number;
  osm_heritage_sites_count?: number;
  osm_airports_count?: number;
  osm_ports_count?: number;
  osm_power_plants_count?: number;
  osm_railway_stations_count?: number;
  osm_public_transport_stops_count?: number;
  osm_car_parkings_capacity?: number;
  osm_fire_stations_count?: number;
  osm_police_stations_count?: number;

  // Foursquare / commercial POI
  foursquare_os_places_count?: number;
  eatery_count?: number;
  dining_and_drinking_fsq_count?: number;
  retail_fsq_count?: number;
  arts_and_entertainment_fsq_count?: number;
  sports_and_recreation_fsq_count?: number;
  community_and_government_fsq_count?: number;
  business_and_professional_services_fsq_count?: number;
  health_and_medicine_fsq_count?: number;
  travel_and_transportation_fsq_count?: number;

  // kpop.pmtiles uses 'pop' instead of 'population'
  pop?: number;
  [key: string]: unknown;
}

export type HatchType = 'hatch_urban' | 'hatch_trans' | 'hatch_crop' | 'hatch_forest' | 'hatch_bare' | 'hatch_water' | 'none';

/** Green sub-classification: which shape to use for green cells */
export type GreenSub = 'forest' | 'park' | 'grass';

export interface PreparedFeature {
  properties: KonturProps;
  __pos?: [number, number, number];
  __gkey?: string;          // square-grid cell key (for regular-raster dedup)
  __cls?: LandUse;
  __bin?: number;
  __jx?: number;
  __jy?: number;
  __jx2?: number;
  __jy2?: number;
  __jx3?: number;
  __jy3?: number;
  __field?: RGB;
  __hatch?: HatchType;
  __greenSub?: GreenSub;
  __isTerrain?: boolean;   // High slope/elevation → tiny dot mode
  __isOcean?: boolean;     // Ocean water cell → cyan dot texture
  __c?: boolean;
}

/**
 * Classify land use from Kontur properties.
 *
 * Key distinctions:
 * - Cropland is NOT green. Cropland = agriculture (yellow bg, rural x-marks).
 * - Green = only actual parks, forests, natural vegetation.
 * - Uses NDVI, building height, transport infra, detailed POI categories.
 */
export function classify(p: KonturProps): LandUse {
  // ── Aggregate land cover fractions ──
  const wa = (p.permanent_water || 0) + (p.wetland || 0);
  const fo = (p.forest || 0) + (p.evergreen_needle_leaved_forest || 0) + (p.unknown_forest || 0);
  const cr = p.cropland || 0;
  const gr = (p.herbage || 0) + (p.shrubs || 0);
  const bu = p.builtup || 0;
  const re = p.residential || 0;
  const ind = p.industrial_area || 0;

  // ── Vegetation & terrain ──
  const ndvi = p.avg_ndvi || 0;
  const canopy = p.avg_forest_canopy_height || 0;

  // ── Building morphology ──
  const htAvg = p.ghs_avg_building_height || 0;
  const htMax = p.ghs_max_building_height || 0;
  const maxLvl = p.max_osm_building_levels || 0;

  // ── Infrastructure ──
  const nl = p.night_lights_intensity || 0;
  const railLen = p.railway_length || 0;
  const roadLen = p.motor_vehicle_road_length || 0;
  const pipeLen = p.pipeline_length || 0;
  const pwrLines = p.powerlines || 0;

  // ── Education & civic POI ──
  const schools = (p.osm_schools_count || 0) + (p.osm_universities_count || 0) +
                  (p.osm_colleges_count || 0) + (p.osm_kindergartens_count || 0);
  const hospitals = (p.osm_hospitals_count || 0) + (p.osm_clinics_count || 0);
  const civic = (p.osm_fire_stations_count || 0) + (p.osm_police_stations_count || 0);
  const govFsq = p.community_and_government_fsq_count || 0;
  const healthFsq = p.health_and_medicine_fsq_count || 0;

  // ── Commercial POI ──
  const poi = p.foursquare_os_places_count || 0;
  const eat = (p.eatery_count || 0) + (p.dining_and_drinking_fsq_count || 0);
  const retail = p.retail_fsq_count || 0;
  const arts = p.arts_and_entertainment_fsq_count || 0;
  const biz = p.business_and_professional_services_fsq_count || 0;
  const hotels = p.osm_hotels_count || 0;
  const entertainment = p.osm_entertainment_venues_count || 0;
  const sports = p.sports_and_recreation_fsq_count || 0;

  // ── Heavy infrastructure ──
  const airports = p.osm_airports_count || 0;
  const ports = p.osm_ports_count || 0;
  const powerPlants = p.osm_power_plants_count || 0;

  // ── Composite scores ──
  const commercialPoi = eat + retail + arts + biz + hotels + entertainment;
  const heavyInfra = airports + ports + powerPlants;

  // ═══ 1. WATER ═══
  if (wa > 0.30) return 'water';

  // ═══ 2. GREEN — forests, parks, natural vegetation (NOT cropland) ═══
  // Pure forest: high forest fraction or tall canopy, low built-up
  if (fo > 0.30 && bu < 0.15) return 'green';
  if (canopy > 8 && fo > 0.15 && bu < 0.20) return 'green';

  // NDVI-confirmed vegetation: high NDVI + low cropland + low built-up
  if (ndvi > 0.45 && fo > 0.10 && cr < 0.10 && bu < 0.15) return 'green';

  // Mixed natural: forest + grass dominant, cropland low, not built-up
  if ((fo + gr) > 0.35 && cr < 0.10 && bu < 0.20) return 'green';

  // Urban parks: moderate forest within built-up fabric (NOT agriculture)
  if (fo > 0.12 && (bu + re) > 0.05 && (bu + re) < 0.35 && cr < 0.08 && ndvi > 0.25) return 'green';

  // Sports/recreation areas with green signal
  if (sports > 2 && ndvi > 0.30 && cr < 0.10 && bu < 0.30) return 'green';

  // Natural grassland: grass-dominant, not farmed, not built
  if (gr > 0.30 && cr < 0.10 && bu < 0.10) return 'green';

  // ═══ 3. INDUSTRIAL ═══
  // Heavy infrastructure: airports, ports, power plants
  if (heavyInfra > 0 && re < 0.10) return 'industrial';

  // Strong industrial land cover signal
  if (ind > 0.10) return 'industrial';

  // Moderate industrial + low residential + some built-up
  if (ind > 0.04 && re < 0.08 && bu > 0.08) return 'industrial';

  // Pipeline/powerline corridors with industrial character
  if ((pipeLen > 500 || pwrLines > 3) && ind > 0.02 && re < 0.05) return 'industrial';

  // Night-lit non-residential zones with transport infra → logistics
  if (ind > 0.02 && nl > 18 && re < 0.05 && poi < 3 && (roadLen > 500 || railLen > 200)) return 'industrial';

  // Large parking + industrial → distribution centers
  if ((p.osm_car_parkings_capacity || 0) > 200 && ind > 0.02 && re < 0.08) return 'industrial';

  // ═══ 4. INSTITUTIONAL ═══
  // Calibrated for Overture Places density (denser than Kontur OSM counts):
  // institutional only when education/health/civic POIs DOMINATE the local mix,
  // so it reads as an accent (campuses, hospital complexes) not the whole map.
  const instCount = schools + hospitals + civic;
  const totalPoi = Math.max(poi, 1);
  const instShare = instCount / totalPoi;

  // Education/health/civic dominate this cell's POI mix
  if (instCount >= 5 && instShare > 0.28 && commercialPoi < poi * 0.5) return 'institutional';
  // Large hospital complex
  if (hospitals >= 6 && instShare > 0.18) return 'institutional';
  // Education campus
  if (schools >= 12 && commercialPoi < poi * 0.4) return 'institutional';
  // Government / civic concentration with little commerce
  if ((govFsq + healthFsq) >= 5 && commercialPoi < 8) return 'institutional';
  if ((p.osm_heritage_sites_count || 0) >= 2 && commercialPoi < 6) return 'institutional';

  // ═══ 5. COMMERCIAL ═══
  // Dense commercial cores (≈ top decile of POI density; medians ~34 places).
  if (htAvg > 18 && maxLvl > 8 && poi > 60) return 'commercial';     // CBD with tall stock
  if (htMax > 50 && re < 0.12) return 'commercial';                  // high-rise core
  if (poi > 250 || commercialPoi > 80) return 'commercial';         // major commercial district
  if ((eat + retail) > 55 && poi > 120) return 'commercial';        // retail/dining district
  if (commercialPoi > 35 && commercialPoi > instCount * 2 && re < 0.30) return 'commercial';
  if (hotels > 4 || (hotels > 1 && entertainment > 2)) return 'commercial'; // tourism core

  // ═══ 6. RESIDENTIAL (default for populated built-up areas) ═══
  return 'residential';
}

/**
 * Classified land cover color — vivid categorical raster.
 * Uses NDVI, building morphology, and terrain for sharper discrimination.
 * Matches reference: yellow agriculture, pink urban, green forest,
 * peach transitional, grey bare/rocky, cyan water.
 */
export function fieldRGB(p: KonturProps): RGB {
  const fo = (p.forest || 0) + (p.evergreen_needle_leaved_forest || 0) + (p.unknown_forest || 0);
  const cr = p.cropland || 0;
  const wa = (p.permanent_water || 0) + (p.wetland || 0);
  const gr = (p.herbage || 0) + (p.shrubs || 0);
  const bu = p.builtup || 0;
  const re = p.residential || 0;
  const ba = (p.bare_vegetation || 0) + (p.moss_lichen || 0);
  const sn = p.snow_ice || 0;
  const ind = p.industrial_area || 0;
  const ndvi = p.avg_ndvi || 0;
  const slope = p.avg_slope_gebco || 0;

  // Water — clear priority
  if (wa > 0.15) return FC.water;

  // Snow/ice
  if (sn > 0.15) return FC.snow;

  // Dense urban fabric — pink/magenta
  // Strong built-up OR low-NDVI dense zone with buildings
  if ((bu + re) > 0.35) return FC.urban;
  if ((bu + re) > 0.25 && ndvi < 0.20) return FC.urban;

  // Transitional urban-agricultural — peach/salmon
  if ((bu + re) > 0.10 && cr > 0.10) return FC.trans;
  if ((bu + re) > 0.15 && (cr + gr) > 0.08) return FC.trans;

  // Industrial land within urban matrix
  if (ind > 0.05 && bu > 0.06) return FC.trans;

  // Forest dominant — bright green
  // NDVI-boosted: confirmed dense vegetation
  if (fo > 0.20 && ndvi > 0.30) return FC.forest;
  if (fo > 0.25) return FC.forest;

  // Cropland dominant — bright yellow (agriculture)
  if (cr > 0.20) return FC.crop;

  // Mixed cropland + grass — still yellow
  if (cr > 0.08 && gr > 0.08) return FC.crop;

  // Natural grassland — yellow-green
  // NDVI-confirmed: moderate vegetation, not cropland
  if (gr > 0.15 && ndvi > 0.25 && cr < 0.10) return FC.grass;
  if (gr > 0.20) return FC.grass;

  // Light urban — pink at lower threshold
  if ((bu + re) > 0.10) return FC.urban;

  // Bare rock/sparse — grey
  // Steep slopes with low vegetation → mountain terrain
  if (ba > 0.12) return FC.bare;
  if (slope > 8 && ndvi < 0.15 && fo < 0.05) return FC.bare;

  // Light forest
  if (fo > 0.10) return FC.forest;

  // Light cropland
  if (cr > 0.05) return FC.crop;

  // Low NDVI + no clear land cover → bare/arid
  if (ndvi < 0.10 && (bu + re) < 0.05 && fo < 0.05 && cr < 0.05) return FC.bare;

  return FC.mixed;
}

/** Determine hatch pattern based on land cover composition + NDVI/terrain */
export function hatchType(p: KonturProps): HatchType {
  const fo = (p.forest || 0) + (p.evergreen_needle_leaved_forest || 0) + (p.unknown_forest || 0);
  const cr = p.cropland || 0;
  const wa = (p.permanent_water || 0) + (p.wetland || 0);
  const bu = p.builtup || 0;
  const re = p.residential || 0;
  const ba = (p.bare_vegetation || 0) + (p.moss_lichen || 0);
  const ind = p.industrial_area || 0;
  const ndvi = p.avg_ndvi || 0;
  const slope = p.avg_slope_gebco || 0;

  if (wa > 0.15) return 'hatch_water';

  // Dense urban: strong built-up or low-NDVI developed
  if ((bu + re) > 0.28) return 'hatch_urban';
  if ((bu + re) > 0.18 && ndvi < 0.18) return 'hatch_urban';

  // Transitional: urban-rural fringe, industrial-residential mix
  if ((bu + re) > 0.10 && cr > 0.08) return 'hatch_trans';
  if (ind > 0.04 && bu > 0.06) return 'hatch_trans';

  // Forest: high canopy or strong forest fraction
  if (fo > 0.18 && ndvi > 0.30) return 'hatch_forest';
  if (fo > 0.20) return 'hatch_forest';

  // Cropland
  if (cr > 0.15) return 'hatch_crop';

  // Bare: exposed terrain, steep slopes with low vegetation
  if (ba > 0.12) return 'hatch_bare';
  if (slope > 8 && ndvi < 0.15 && fo < 0.05) return 'hatch_bare';

  // Light urban
  if ((bu + re) > 0.10) return 'hatch_urban';

  // Light forest
  if (fo > 0.08) return 'hatch_forest';

  // Light cropland
  if (cr > 0.05) return 'hatch_crop';

  // Arid/desert: very low NDVI, no land cover
  if (ndvi < 0.10 && (bu + re) < 0.05 && fo < 0.05) return 'hatch_bare';

  return 'none';
}

/**
 * Classify green cells into subtypes for different glyph rendering:
 * - forest: dense forest / tall canopy → cross_plus (+)
 * - park: urban parks / recreation / sparse forest in built-up areas → thin_ring (green circle)
 * - grass: natural grassland / meadows → green sm_dot stipple
 */
export function greenSubtype(p: KonturProps): GreenSub {
  const fo = (p.forest || 0) + (p.evergreen_needle_leaved_forest || 0) + (p.unknown_forest || 0);
  const gr = (p.herbage || 0) + (p.shrubs || 0);
  const bu = (p.builtup || 0) + (p.residential || 0);
  const canopy = p.avg_forest_canopy_height || 0;
  const sports = p.sports_and_recreation_fsq_count || 0;

  // Urban parks: green space within built-up matrix
  if (bu > 0.05 && fo < 0.25 && (sports > 0 || bu > 0.10)) return 'park';
  // Tall canopy or dense forest → forest
  if (fo > 0.25 || canopy > 6) return 'forest';
  // Natural grassland / meadows
  if (gr > fo * 1.5) return 'grass';
  // Default to forest for anything with decent tree cover
  if (fo > 0.10) return 'forest';
  return 'grass';
}

/**
 * Detect terrain cells that should render as tiny dots instead of large squares.
 * High slope, mountain terrain, elevated areas with natural cover.
 */
export function isTerrain(p: KonturProps): boolean {
  const slope = p.avg_slope_gebco || 0;
  const elev = p.avg_elevation_gebco || 0;
  const fo = (p.forest || 0) + (p.evergreen_needle_leaved_forest || 0) + (p.unknown_forest || 0);
  const bu = (p.builtup || 0) + (p.residential || 0);
  const ba = (p.bare_vegetation || 0) + (p.moss_lichen || 0);
  const pop = p.population || 0;

  // Steep slopes with low urban development
  if (slope > 6 && bu < 0.15 && pop < 200) return true;
  // High elevation with natural cover
  if (elev > 300 && bu < 0.10 && (fo > 0.10 || ba > 0.10)) return true;
  // Mountain terrain: steep + bare
  if (slope > 4 && ba > 0.15 && bu < 0.08) return true;
  return false;
}

/**
 * Detect ocean water cells (for tiny cyan dot texture).
 * Ocean = water-dominant cell with no population, or empty cell
 * where all land cover fractions are near zero (open ocean with no data).
 */
export function isOcean(p: KonturProps): boolean {
  const wa = (p.permanent_water || 0) + (p.wetland || 0);
  const bu = (p.builtup || 0) + (p.residential || 0);
  const fo = (p.forest || 0) + (p.evergreen_needle_leaved_forest || 0);
  const cr = p.cropland || 0;
  const gr = (p.herbage || 0) + (p.shrubs || 0);
  const ba = (p.bare_vegetation || 0) + (p.moss_lichen || 0);
  const pop = p.population || 0;

  // Classic ocean: high water, no development
  if (wa > 0.30 && bu < 0.03 && pop === 0) return true;

  // Empty ocean: virtually no land cover (Kontur may report zeros for open sea)
  const totalLand = bu + fo + cr + gr + ba;
  if (pop === 0 && totalLand < 0.05 && wa >= 0.05) return true;

  // Near-empty cells dominated by water with negligible land signal
  if (pop === 0 && wa > 0.15 && totalLand < 0.10) return true;

  return false;
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
    const snapped = snapToGrid(lng, lat);
    d.__pos = snapped.pos;
    d.__gkey = snapped.key;
  } catch {
    d.__pos = [0, 0, 0];
    d.__gkey = undefined;
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
  d.__hatch = hatchType(d.properties);
  // Always (re)set so a cell that reclassifies away from green after enrichment
  // does not retain a stale green sub-type.
  d.__greenSub = d.__cls === 'green' ? greenSubtype(d.properties) : undefined;
  d.__isTerrain = isTerrain(d.properties);
  d.__isOcean = isOcean(d.properties);
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
