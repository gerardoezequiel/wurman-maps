-- ============================================================
-- Wurman Maps — self-hosted multi-city H3 dataset (DuckDB)
-- ============================================================
-- Builds public/wurman_cities.pmtiles: one H3 res-8 cell per populated
-- Kontur cell across the 10 city presets, enriched with Overture-derived
-- land cover, land use, water and POI counts — the properties src/deck/classify.ts
-- needs for the Wurman shape grammar. No raster processing required: land cover
-- comes from Overture's base/land_cover (itself derived from ESA WorldCover).
--
-- Prerequisites:
--   brew install duckdb tippecanoe
--   go install github.com/protomaps/go-pmtiles/cmd/pmtiles@latest  (or `brew install pmtiles`)
--   node data/extract-population.mjs        # writes data/sources/population.csv
--
-- Run:
--   duckdb wurman.db < data/build-cities.sql
--   tippecanoe -o /tmp/wurman_cities.mbtiles -l kpop -Z2 -z9 \
--     --no-feature-limit --no-tile-size-limit -r1 --no-line-simplification \
--     -f data/sources/wurman_cities.geojsonseq
--   pmtiles convert /tmp/wurman_cities.mbtiles public/wurman_cities.pmtiles
--
-- Overture release is pinned below; bump it to refresh.
-- ============================================================

INSTALL h3 FROM community; LOAD h3;
INSTALL spatial; LOAD spatial;
INSTALL httpfs; LOAD httpfs;
CREATE OR REPLACE SECRET ov (TYPE s3, PROVIDER config, REGION 'us-west-2');
SET memory_limit='8GB';

-- Pin the Overture release (latest as of build). Predicate pushdown on bbox keeps
-- the global read cheap — only row groups overlapping a city bbox are fetched.
-- s3://overturemaps-us-west-2/release/2026-05-20.0/

-- ── 1. Population universe (from kpop tiles, via data/extract-population.mjs) ──
CREATE OR REPLACE TABLE pop AS
SELECT h3, population::INTEGER AS population, lng, lat
FROM read_csv('data/sources/population.csv', header=true);

-- H3 cell boundary polygons for area-weighted land-cover fractions
CREATE OR REPLACE TABLE cell_geom AS
SELECT h3, ST_GeomFromText(h3_cell_to_boundary_wkt(h3)) AS geom,
       ST_Area(ST_GeomFromText(h3_cell_to_boundary_wkt(h3))) AS cell_area
FROM pop;

-- The 10 city bboxes are inlined as an OR predicate in each Overture read below
-- so DuckDB can push the filter down to S3. (London, Barcelona, Amsterdam,
-- Berlin, Rome, Paris, Madrid, Las Palmas, New York, Tokyo — see
-- data/extract-population.mjs for the exact extents.)

-- ── 2. Overture PLACES → per-cell POI counts (strict institutional allowlist,
--        broad commercial categories — calibrated against the per-cell
--        distribution so institutional reads as an accent, not the whole map) ──
CREATE OR REPLACE TABLE places_raw AS
SELECT h3_h3_to_string(h3_latlng_to_cell(bbox.ymin, bbox.xmin, 8)) AS h3,
       lower(coalesce(categories.primary,'')) AS cat
FROM read_parquet('s3://overturemaps-us-west-2/release/2026-05-20.0/theme=places/type=place/*.parquet')
WHERE (bbox.xmin BETWEEN -0.55 AND 0.34 AND bbox.ymin BETWEEN 51.28 AND 51.72)
   OR (bbox.xmin BETWEEN 1.85 AND 2.40 AND bbox.ymin BETWEEN 41.22 AND 41.58)
   OR (bbox.xmin BETWEEN 4.60 AND 5.20 AND bbox.ymin BETWEEN 52.20 AND 52.55)
   OR (bbox.xmin BETWEEN 13.05 AND 13.77 AND bbox.ymin BETWEEN 52.34 AND 52.69)
   OR (bbox.xmin BETWEEN 12.20 AND 12.80 AND bbox.ymin BETWEEN 41.70 AND 42.05)
   OR (bbox.xmin BETWEEN 2.05 AND 2.65 AND bbox.ymin BETWEEN 48.70 AND 49.02)
   OR (bbox.xmin BETWEEN -3.98 AND -3.42 AND bbox.ymin BETWEEN 40.20 AND 40.64)
   OR (bbox.xmin BETWEEN -15.60 AND -15.30 AND bbox.ymin BETWEEN 27.95 AND 28.20)
   OR (bbox.xmin BETWEEN -74.35 AND -73.65 AND bbox.ymin BETWEEN 40.45 AND 40.95)
   OR (bbox.xmin BETWEEN 139.40 AND 140.00 AND bbox.ymin BETWEEN 35.45 AND 35.92);

CREATE OR REPLACE TABLE poi AS
SELECT h3,
  count(*) FILTER (WHERE cat IN ('elementary_school','school','high_school','middle_school','primary_school',
      'secondary_school','preschool','kindergarten','private_school','public_school','college_university',
      'university','day_care_preschool','montessori_school','charter_school','boarding_school')) AS osm_schools_count,
  count(*) FILTER (WHERE cat IN ('hospital','medical_center','clinic','emergency_room','urgent_care_clinic',
      'urgent_care_center','childrens_hospital','general_hospital')) AS osm_hospitals_count,
  count(*) FILTER (WHERE cat LIKE '%hotel%' OR cat LIKE '%hostel%' OR cat IN ('motel','bed_and_breakfast','resort')) AS osm_hotels_count,
  count(*) FILTER (WHERE cat LIKE '%restaurant%' OR cat LIKE '%cafe%' OR cat LIKE '%coffee%' OR cat IN ('bar','pub','fast_food_restaurant','food','bakery','diner','bistro','food_court')) AS eatery_count,
  count(*) FILTER (WHERE cat LIKE '%store%' OR cat LIKE '%shop%' OR cat LIKE '%retail%' OR cat IN ('market','shopping_mall','supermarket','grocery_store','boutique','department_store')) AS retail_fsq_count,
  count(*) FILTER (WHERE cat LIKE '%museum%' OR cat LIKE '%theat%' OR cat LIKE '%cinema%' OR cat LIKE '%gallery%' OR cat IN ('art_gallery','performing_arts_venue','concert_hall','night_club')) AS arts_and_entertainment_fsq_count,
  count(*) FILTER (WHERE cat LIKE '%gym%' OR cat LIKE '%fitness%' OR cat LIKE '%stadium%' OR cat IN ('sports_club','recreation_center','sports_complex','golf_course','swimming_pool')) AS sports_and_recreation_fsq_count,
  count(*) FILTER (WHERE cat LIKE '%office%' OR cat LIKE '%bank%' OR cat IN ('business_center','professional_services','financial_service','insurance_agency','coworking_space','corporate_office')) AS business_and_professional_services_fsq_count,
  count(*) FILTER (WHERE cat IN ('government_building','city_hall','town_hall','courthouse','library','post_office','police_station','fire_station','embassy')) AS community_and_government_fsq_count,
  count(*) FILTER (WHERE cat LIKE '%airport%') AS osm_airports_count,
  count(*) FILTER (WHERE cat IN ('port','harbor','marina','ferry_terminal')) AS osm_ports_count,
  count(*) AS foursquare_os_places_count
FROM places_raw GROUP BY h3;

-- ── 3. Overture base/land_cover → area-weighted fractions per cell ──
CREATE OR REPLACE TABLE lc_raw AS
SELECT lower(subtype) AS subtype, geometry AS geom
FROM read_parquet('s3://overturemaps-us-west-2/release/2026-05-20.0/theme=base/type=land_cover/*.parquet')
WHERE (bbox.xmin BETWEEN -0.55 AND 0.34 AND bbox.ymin BETWEEN 51.28 AND 51.72)
   OR (bbox.xmin BETWEEN 1.85 AND 2.40 AND bbox.ymin BETWEEN 41.22 AND 41.58)
   OR (bbox.xmin BETWEEN 4.60 AND 5.20 AND bbox.ymin BETWEEN 52.20 AND 52.55)
   OR (bbox.xmin BETWEEN 13.05 AND 13.77 AND bbox.ymin BETWEEN 52.34 AND 52.69)
   OR (bbox.xmin BETWEEN 12.20 AND 12.80 AND bbox.ymin BETWEEN 41.70 AND 42.05)
   OR (bbox.xmin BETWEEN 2.05 AND 2.65 AND bbox.ymin BETWEEN 48.70 AND 49.02)
   OR (bbox.xmin BETWEEN -3.98 AND -3.42 AND bbox.ymin BETWEEN 40.20 AND 40.64)
   OR (bbox.xmin BETWEEN -15.60 AND -15.30 AND bbox.ymin BETWEEN 27.95 AND 28.20)
   OR (bbox.xmin BETWEEN -74.35 AND -73.65 AND bbox.ymin BETWEEN 40.45 AND 40.95)
   OR (bbox.xmin BETWEEN 139.40 AND 140.00 AND bbox.ymin BETWEEN 35.45 AND 35.92);

CREATE OR REPLACE TABLE lc_frac AS
SELECT c.h3,
  sum(CASE WHEN lc.subtype='forest' THEN ST_Area(ST_Intersection(c.geom, lc.geom)) ELSE 0 END)/c.cell_area AS forest,
  sum(CASE WHEN lc.subtype IN ('grass','meadow') THEN ST_Area(ST_Intersection(c.geom, lc.geom)) ELSE 0 END)/c.cell_area AS herbage,
  sum(CASE WHEN lc.subtype='shrub' THEN ST_Area(ST_Intersection(c.geom, lc.geom)) ELSE 0 END)/c.cell_area AS shrubs,
  sum(CASE WHEN lc.subtype IN ('crop','cropland') THEN ST_Area(ST_Intersection(c.geom, lc.geom)) ELSE 0 END)/c.cell_area AS cropland,
  sum(CASE WHEN lc.subtype IN ('barren','bare') THEN ST_Area(ST_Intersection(c.geom, lc.geom)) ELSE 0 END)/c.cell_area AS bare_vegetation,
  sum(CASE WHEN lc.subtype='wetland' THEN ST_Area(ST_Intersection(c.geom, lc.geom)) ELSE 0 END)/c.cell_area AS wetland
FROM cell_geom c JOIN lc_raw lc ON ST_Intersects(c.geom, lc.geom)
GROUP BY c.h3, c.cell_area;

-- builtup from land_cover 'urban' subtype (no extra S3 read)
CREATE OR REPLACE TABLE builtup_frac AS
SELECT c.h3, least(2.0, sum(ST_Area(ST_Intersection(c.geom, lc.geom)))/c.cell_area) AS builtup
FROM cell_geom c JOIN lc_raw lc ON lc.subtype='urban' AND ST_Intersects(c.geom, lc.geom)
GROUP BY c.h3, c.cell_area;

-- ── 4. Overture base/water → permanent_water fraction ──
CREATE OR REPLACE TABLE water_raw AS
SELECT geometry AS geom
FROM read_parquet('s3://overturemaps-us-west-2/release/2026-05-20.0/theme=base/type=water/*.parquet')
WHERE (bbox.xmin BETWEEN -0.55 AND 0.34 AND bbox.ymin BETWEEN 51.28 AND 51.72)
   OR (bbox.xmin BETWEEN 1.85 AND 2.40 AND bbox.ymin BETWEEN 41.22 AND 41.58)
   OR (bbox.xmin BETWEEN 4.60 AND 5.20 AND bbox.ymin BETWEEN 52.20 AND 52.55)
   OR (bbox.xmin BETWEEN 13.05 AND 13.77 AND bbox.ymin BETWEEN 52.34 AND 52.69)
   OR (bbox.xmin BETWEEN 12.20 AND 12.80 AND bbox.ymin BETWEEN 41.70 AND 42.05)
   OR (bbox.xmin BETWEEN 2.05 AND 2.65 AND bbox.ymin BETWEEN 48.70 AND 49.02)
   OR (bbox.xmin BETWEEN -3.98 AND -3.42 AND bbox.ymin BETWEEN 40.20 AND 40.64)
   OR (bbox.xmin BETWEEN -15.60 AND -15.30 AND bbox.ymin BETWEEN 27.95 AND 28.20)
   OR (bbox.xmin BETWEEN -74.35 AND -73.65 AND bbox.ymin BETWEEN 40.45 AND 40.95)
   OR (bbox.xmin BETWEEN 139.40 AND 140.00 AND bbox.ymin BETWEEN 35.45 AND 35.92);
CREATE OR REPLACE TABLE water_frac AS
SELECT c.h3, least(1.0, sum(ST_Area(ST_Intersection(c.geom, w.geom)))/c.cell_area) AS permanent_water
FROM cell_geom c JOIN water_raw w ON ST_Intersects(c.geom, w.geom)
GROUP BY c.h3, c.cell_area;

-- ── 5. Overture base/land_use → residential / industrial fraction ──
CREATE OR REPLACE TABLE lu_raw AS
SELECT lower(subtype) AS subtype, geometry AS geom
FROM read_parquet('s3://overturemaps-us-west-2/release/2026-05-20.0/theme=base/type=land_use/*.parquet')
WHERE (bbox.xmin BETWEEN -0.55 AND 0.34 AND bbox.ymin BETWEEN 51.28 AND 51.72)
   OR (bbox.xmin BETWEEN 1.85 AND 2.40 AND bbox.ymin BETWEEN 41.22 AND 41.58)
   OR (bbox.xmin BETWEEN 4.60 AND 5.20 AND bbox.ymin BETWEEN 52.20 AND 52.55)
   OR (bbox.xmin BETWEEN 13.05 AND 13.77 AND bbox.ymin BETWEEN 52.34 AND 52.69)
   OR (bbox.xmin BETWEEN 12.20 AND 12.80 AND bbox.ymin BETWEEN 41.70 AND 42.05)
   OR (bbox.xmin BETWEEN 2.05 AND 2.65 AND bbox.ymin BETWEEN 48.70 AND 49.02)
   OR (bbox.xmin BETWEEN -3.98 AND -3.42 AND bbox.ymin BETWEEN 40.20 AND 40.64)
   OR (bbox.xmin BETWEEN -15.60 AND -15.30 AND bbox.ymin BETWEEN 27.95 AND 28.20)
   OR (bbox.xmin BETWEEN -74.35 AND -73.65 AND bbox.ymin BETWEEN 40.45 AND 40.95)
   OR (bbox.xmin BETWEEN 139.40 AND 140.00 AND bbox.ymin BETWEEN 35.45 AND 35.92);
CREATE OR REPLACE TABLE lu_frac AS
SELECT c.h3,
  sum(CASE WHEN lu.subtype='residential' THEN ST_Area(ST_Intersection(c.geom, lu.geom)) ELSE 0 END)/c.cell_area AS residential,
  sum(CASE WHEN lu.subtype='industrial' THEN ST_Area(ST_Intersection(c.geom, lu.geom)) ELSE 0 END)/c.cell_area AS industrial_area
FROM cell_geom c JOIN lu_raw lu ON ST_Intersects(c.geom, lu.geom)
GROUP BY c.h3, c.cell_area;

-- ── 6. Join everything on h3, emit centroids as GeoJSONSeq for tippecanoe ──
CREATE OR REPLACE TABLE wurman_cells AS
SELECT p.h3, p.population,
  round(coalesce(lc.forest,0),3) AS forest,
  round(coalesce(lc.herbage,0),3) AS herbage,
  round(coalesce(lc.shrubs,0),3) AS shrubs,
  round(coalesce(lc.cropland,0),3) AS cropland,
  round(coalesce(lc.bare_vegetation,0),3) AS bare_vegetation,
  round(coalesce(lc.wetland,0),3) AS wetland,
  round(coalesce(w.permanent_water,0),3) AS permanent_water,
  round(coalesce(b.builtup,0),3) AS builtup,
  round(coalesce(lu.residential,0),3) AS residential,
  round(coalesce(lu.industrial_area,0),3) AS industrial_area,
  coalesce(poi.osm_schools_count,0) AS osm_schools_count,
  coalesce(poi.osm_hospitals_count,0) AS osm_hospitals_count,
  coalesce(poi.osm_hotels_count,0) AS osm_hotels_count,
  coalesce(poi.eatery_count,0) AS eatery_count,
  coalesce(poi.retail_fsq_count,0) AS retail_fsq_count,
  coalesce(poi.arts_and_entertainment_fsq_count,0) AS arts_and_entertainment_fsq_count,
  coalesce(poi.sports_and_recreation_fsq_count,0) AS sports_and_recreation_fsq_count,
  coalesce(poi.business_and_professional_services_fsq_count,0) AS business_and_professional_services_fsq_count,
  coalesce(poi.community_and_government_fsq_count,0) AS community_and_government_fsq_count,
  coalesce(poi.osm_airports_count,0) AS osm_airports_count,
  coalesce(poi.osm_ports_count,0) AS osm_ports_count,
  coalesce(poi.foursquare_os_places_count,0) AS foursquare_os_places_count,
  ST_Point(p.lng, p.lat) AS geom
FROM pop p
LEFT JOIN lc_frac lc     ON p.h3 = lc.h3
LEFT JOIN builtup_frac b ON p.h3 = b.h3
LEFT JOIN water_frac w   ON p.h3 = w.h3
LEFT JOIN lu_frac lu     ON p.h3 = lu.h3
LEFT JOIN poi            ON p.h3 = poi.h3;

COPY (SELECT * FROM wurman_cells) TO 'data/sources/wurman_cities.geojsonseq'
  WITH (FORMAT GDAL, DRIVER 'GeoJSONSeq');
