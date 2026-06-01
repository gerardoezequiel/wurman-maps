-- ============================================================
-- Wurman Maps — H3 Data Pipeline (DuckDB)
-- ============================================================
-- Builds a composite H3 res-8 dataset from open sources.
-- Run with: duckdb wurman.db < build-h3.sql
--
-- Prerequisites:
--   brew install duckdb
--   Download data into data/sources/ (see pipeline.md)
-- ============================================================

INSTALL spatial; LOAD spatial;
INSTALL h3 FROM community; LOAD h3;
INSTALL httpfs; LOAD httpfs;

-- ============================================================
-- STEP 1: KONTUR POPULATION
-- Source: https://data.humdata.org/dataset/kontur-population-dataset
-- File:   sources/kontur_population_20231101.gpkg
-- ============================================================

CREATE OR REPLACE TABLE pop AS
SELECT
  h3 AS h3,
  population
FROM st_read('sources/kontur_population_20231101.gpkg')
WHERE population > 0;

-- Index for fast joins
CREATE INDEX idx_pop_h3 ON pop(h3);

SELECT count(*) AS populated_cells FROM pop;
-- Expected: ~40-60 million cells globally

-- ============================================================
-- STEP 2: LAND COVER FRACTIONS (from pre-computed CSV)
-- ============================================================
-- ESA WorldCover → H3 aggregation must be done externally
-- (exactextract, Google Earth Engine, or rasterstats)
-- because DuckDB can't natively do raster→H3 zonal stats.
--
-- Expected CSV format from exactextract:
--   h3,builtup,cropland,forest,grassland,shrubland,water,wetland,bare,snow,moss
--   (fractions 0.0-1.0 per H3 cell)
--
-- See pipeline.md for exactextract or GEE commands.
-- ============================================================

-- Uncomment when CSV is ready:
-- CREATE OR REPLACE TABLE landcover AS
-- SELECT
--   h3,
--   builtup,
--   cropland,
--   forest,
--   grassland AS herbage,
--   shrubland AS shrubs,
--   water AS permanent_water,
--   wetland,
--   bare AS bare_vegetation,
--   snow AS snow_ice,
--   moss AS moss_lichen
-- FROM read_csv('sources/worldcover_h3.csv', auto_detect=true);
--
-- CREATE INDEX idx_lc_h3 ON landcover(h3);

-- ============================================================
-- STEP 3: OVERTURE PLACES → POI COUNTS PER H3
-- Source: Overture Maps (read directly from S3)
-- ============================================================

-- NOTE: Reading from S3 requires network. For offline, download first:
--   aws s3 sync s3://overturemaps-us-west-2/release/2025-01-22.0/theme=places/ sources/places/

-- Uncomment when ready:
-- CREATE OR REPLACE TABLE places AS
-- SELECT
--   h3_latlng_to_cell(
--     ST_Y(geometry)::DOUBLE,
--     ST_X(geometry)::DOUBLE,
--     8
--   )::VARCHAR AS h3,
--   categories.primary AS category,
-- FROM read_parquet('sources/places/*.parquet', hive_partitioning=true)
-- WHERE categories.primary IS NOT NULL;
--
-- -- Pivot into counts per H3
-- CREATE OR REPLACE TABLE poi_counts AS
-- SELECT
--   h3,
--   count(*) FILTER (WHERE category ILIKE '%school%' OR category ILIKE '%education%') AS osm_schools_count,
--   count(*) FILTER (WHERE category ILIKE '%hospital%' OR category ILIKE '%medical%') AS osm_hospitals_count,
--   count(*) FILTER (WHERE category ILIKE '%hotel%' OR category ILIKE '%lodging%') AS osm_hotels_count,
--   count(*) FILTER (WHERE category ILIKE '%airport%') AS osm_airports_count,
--   count(*) FILTER (WHERE category ILIKE '%port%' OR category ILIKE '%harbor%') AS osm_ports_count,
--   count(*) FILTER (WHERE category ILIKE '%power%plant%') AS osm_power_plants_count,
--   count(*) FILTER (WHERE category ILIKE '%fire%station%') AS osm_fire_stations_count,
--   count(*) FILTER (WHERE category ILIKE '%police%') AS osm_police_stations_count,
--   count(*) FILTER (WHERE category ILIKE '%restaurant%' OR category ILIKE '%cafe%' OR category ILIKE '%bar%') AS eatery_count,
--   count(*) FILTER (WHERE category ILIKE '%shop%' OR category ILIKE '%retail%' OR category ILIKE '%store%') AS retail_count,
--   count(*) FILTER (WHERE category ILIKE '%entertainment%' OR category ILIKE '%cinema%' OR category ILIKE '%theatre%') AS entertainment_count,
--   count(*) AS total_poi_count
-- FROM places
-- GROUP BY h3;
--
-- CREATE INDEX idx_poi_h3 ON poi_counts(h3);

-- ============================================================
-- STEP 4: OVERTURE BUILDINGS → COUNTS + HEIGHT PER H3
-- Source: Overture Maps buildings theme
-- ============================================================

-- Uncomment when ready:
-- CREATE OR REPLACE TABLE buildings AS
-- SELECT
--   h3_latlng_to_cell(
--     ST_Y(ST_Centroid(geometry))::DOUBLE,
--     ST_X(ST_Centroid(geometry))::DOUBLE,
--     8
--   )::VARCHAR AS h3,
--   height,
--   num_floors,
-- FROM read_parquet('sources/buildings/*.parquet', hive_partitioning=true);
--
-- CREATE OR REPLACE TABLE building_stats AS
-- SELECT
--   h3,
--   count(*) AS total_building_count,
--   avg(height) FILTER (WHERE height IS NOT NULL) AS ghs_avg_building_height,
--   max(height) FILTER (WHERE height IS NOT NULL) AS ghs_max_building_height,
--   avg(num_floors) FILTER (WHERE num_floors IS NOT NULL) AS avg_osm_building_levels,
--   max(num_floors) FILTER (WHERE num_floors IS NOT NULL) AS max_osm_building_levels,
-- FROM buildings
-- GROUP BY h3;
--
-- CREATE INDEX idx_bld_h3 ON building_stats(h3);

-- ============================================================
-- STEP 5: TERRAIN (from pre-computed CSV)
-- ============================================================
-- Copernicus DEM → H3 aggregation (same as land cover: external tool)
-- Expected CSV: h3, avg_elevation, avg_slope
-- ============================================================

-- Uncomment when CSV is ready:
-- CREATE OR REPLACE TABLE terrain AS
-- SELECT
--   h3,
--   avg_elevation AS avg_elevation_gebco,
--   avg_slope AS avg_slope_gebco,
-- FROM read_csv('sources/terrain_h3.csv', auto_detect=true);
--
-- CREATE INDEX idx_ter_h3 ON terrain(h3);

-- ============================================================
-- STEP 6: JOIN ALL → COMPOSITE TABLE
-- ============================================================

-- For now, start with population only (what we have):
CREATE OR REPLACE TABLE wurman AS
SELECT
  p.h3,
  h3_cell_to_lng(h3_string_to_h3(p.h3)) AS lng,
  h3_cell_to_lat(h3_string_to_h3(p.h3)) AS lat,
  p.population,

  -- Land cover (uncomment when available)
  -- COALESCE(lc.builtup, 0) AS builtup,
  -- COALESCE(lc.cropland, 0) AS cropland,
  -- COALESCE(lc.forest, 0) AS forest,
  -- COALESCE(lc.herbage, 0) AS herbage,
  -- COALESCE(lc.shrubs, 0) AS shrubs,
  -- COALESCE(lc.permanent_water, 0) AS permanent_water,
  -- COALESCE(lc.wetland, 0) AS wetland,
  -- COALESCE(lc.bare_vegetation, 0) AS bare_vegetation,
  -- COALESCE(lc.snow_ice, 0) AS snow_ice,
  -- COALESCE(lc.moss_lichen, 0) AS moss_lichen,

  -- Buildings (uncomment when available)
  -- COALESCE(b.total_building_count, 0) AS total_building_count,
  -- b.ghs_avg_building_height,
  -- b.ghs_max_building_height,
  -- b.avg_osm_building_levels,
  -- b.max_osm_building_levels,

  -- POIs (uncomment when available)
  -- COALESCE(poi.osm_schools_count, 0) AS osm_schools_count,
  -- COALESCE(poi.osm_hospitals_count, 0) AS osm_hospitals_count,
  -- COALESCE(poi.osm_hotels_count, 0) AS osm_hotels_count,
  -- COALESCE(poi.osm_airports_count, 0) AS osm_airports_count,
  -- COALESCE(poi.eatery_count, 0) AS eatery_count,
  -- COALESCE(poi.retail_count, 0) AS retail_fsq_count,
  -- COALESCE(poi.total_poi_count, 0) AS foursquare_os_places_count,

  -- Terrain (uncomment when available)
  -- t.avg_elevation_gebco,
  -- t.avg_slope_gebco,

FROM pop p
-- LEFT JOIN landcover lc ON p.h3 = lc.h3
-- LEFT JOIN building_stats b ON p.h3 = b.h3
-- LEFT JOIN poi_counts poi ON p.h3 = poi.h3
-- LEFT JOIN terrain t ON p.h3 = t.h3
;

SELECT count(*) AS total_cells,
       sum(population) AS total_population
FROM wurman;

-- ============================================================
-- STEP 7: EXPORT AS GEOJSONSEQ (for tippecanoe)
-- ============================================================

COPY (
  SELECT
    -- GeoJSON point geometry at H3 centroid
    ST_Point(lng, lat) AS geometry,
    * EXCLUDE (lng, lat)
  FROM wurman
) TO 'wurman_h3.geojsonseq'
WITH (FORMAT GDAL, DRIVER 'GeoJSONSeq');

-- ============================================================
-- Then run:
--   tippecanoe -o wurman_h3.mbtiles \
--     -Z0 -z9 \
--     --no-feature-limit \
--     --no-tile-size-limit \
--     --drop-densest-as-needed \
--     -l wurman \
--     wurman_h3.geojsonseq
--
--   pmtiles convert wurman_h3.mbtiles wurman_h3.pmtiles
--
--   # Upload to R2:
--   wrangler r2 object put wurman-tiles/wurman_h3.pmtiles \
--     --file wurman_h3.pmtiles
-- ============================================================
