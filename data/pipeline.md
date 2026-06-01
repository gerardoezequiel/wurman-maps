# Wurman Maps — H3 Data Pipeline

Replicate the Kontur Geocint bivariate tile dataset from open sources.
The goal: a single PMTiles file with H3 res-8 hexagons carrying the properties
that `src/deck/classify.ts` needs for the Wurman shape grammar.

## Implemented pipeline (Overture-based, no raster step)

The shipped dataset (`public/wurman_cities.pmtiles`) is built by two scripts and
covers the 10 city presets. It avoids raster processing entirely by sourcing land
cover from Overture's `base/land_cover` theme (itself derived from ESA WorldCover):

```bash
brew install duckdb tippecanoe pmtiles
node data/extract-population.mjs            # kpop z9 tiles → data/sources/population.csv
duckdb wurman.db < data/build-cities.sql    # join Overture land cover/use/water/POIs → geojsonseq
# Tile z9-only: deck.gl overzooms z9 for the z10-12 city views; a single zoom
# level avoids duplicate ancestor tiles colliding with the H3 dedup.
tippecanoe -o /tmp/wurman_cities.mbtiles -l kpop -Z9 -z9 \
  --no-feature-limit --no-tile-size-limit -r1 --no-line-simplification \
  -f data/sources/wurman_cities.geojsonseq
pmtiles convert /tmp/wurman_cities.mbtiles public/wurman_cities.pmtiles
```

Result: ~24.8k H3 res-8 cells, 8 MB PMTiles, self-hosted from `public/`. To refresh,
bump the pinned Overture release in `data/build-cities.sql`. To host on a CDN instead
of bundling, upload and point `VITE_POP_PMTILES_URL` at it:

```bash
# Cloudflare R2 (needs your Cloudflare auth):
wrangler r2 object put wurman-tiles/wurman_cities.pmtiles --file public/wurman_cities.pmtiles
# then set VITE_POP_PMTILES_URL=https://<your-r2-or-cloudfront>/wurman_cities.pmtiles
```

The sections below document the **higher-fidelity raster alternative** (ESA WorldCover
10 m + GHSL + Foursquare via exactextract) for a full 196-property rebuild.

## Property → Source mapping

### Tier 1: Population (core — required)

| Property | Source | Format | Download |
|----------|--------|--------|----------|
| `population` | Kontur Population | GeoPackage (2.4 GB) | https://geodata-eu-central-1-kontur-public.s3.eu-central-1.amazonaws.com/kontur_datasets/kontur_population_20231101.gpkg.gz |
| `h3` | Kontur Population | (included) | Same file |
| `area_km2` | Derived from H3 | Computed | `h3_cell_area(h3, 'km^2')` |

### Tier 2: Land cover fractions (critical for classification)

| Property | WorldCover class | Source | Download |
|----------|-----------------|--------|----------|
| `builtup` | 50 (Built-up) | ESA WorldCover 2021 | https://esa-worldcover.org/en (10m GeoTIFF, free) |
| `cropland` | 40 (Cropland) | ESA WorldCover 2021 | Same |
| `forest` | 10 (Tree cover) | ESA WorldCover 2021 | Same |
| `herbage` | 30 (Grassland) | ESA WorldCover 2021 | Same |
| `shrubs` | 20 (Shrubland) | ESA WorldCover 2021 | Same |
| `permanent_water` | 80 (Permanent water) | ESA WorldCover 2021 | Same |
| `wetland` | 90 (Herbaceous wetland) | ESA WorldCover 2021 | Same |
| `bare_vegetation` | 60 (Bare/sparse) | ESA WorldCover 2021 | Same |
| `moss_lichen` | 100 (Moss/lichen) | ESA WorldCover 2021 | Same |
| `snow_ice` | 70 (Snow/ice) | ESA WorldCover 2021 | Same |

**Note:** Kontur used Copernicus CGLS 100m. ESA WorldCover is 10m (better) and
has nearly identical classes. Fraction = count of 10m pixels in class / total
pixels per H3 cell.

**Alternative (easier, lower res):** Copernicus Global Land Cover 100m
https://lcviewer.vito.be/download — comes as GeoTIFF fraction layers
(e.g., `Tree-CoverFraction-layer`), so you skip the pixel-counting step.

### Tier 3: Terrain & vegetation indices

| Property | Source | Format | Download |
|----------|--------|--------|----------|
| `avg_elevation_gebco` | Copernicus DEM GLO-30 | GeoTIFF (30m) | https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model |
| `avg_slope_gebco` | Derived from DEM | Computed | `slope = atan(dz/dx)` per pixel, then mean per H3 |
| `avg_ndvi` | Sentinel-2 L2A composite | GeoTIFF | Google Earth Engine or Copernicus Data Space |
| `avg_forest_canopy_height` | ETH Global Canopy Height 2020 | GeoTIFF (10m) | https://langnico.github.io/globalcanopyheight/ |

### Tier 4: Building morphology

| Property | Source | Format | Download |
|----------|--------|--------|----------|
| `ghs_avg_building_height` | GHSL Built-H R2023A | GeoTIFF (100m) | https://human-settlement.emergency.copernicus.eu/download.php?ds=bu_built_h |
| `ghs_max_building_height` | GHSL Built-H R2023A | Same | Same (compute max per H3) |
| `total_building_count` | Overture Buildings | Parquet | `s3://overturemaps-us-west-2/release/2024-*/theme=buildings/` |
| `avg_osm_building_levels` | Overture Buildings (`height` field) | Same | Same |

### Tier 5: POIs — commercial & institutional classification

| Property | Source | Format | Download |
|----------|--------|--------|----------|
| `osm_schools_count` | Overture Places (category filter) | Parquet | `s3://overturemaps-us-west-2/release/2024-*/theme=places/` |
| `osm_hospitals_count` | Overture Places | Same | Same |
| `osm_hotels_count` | Overture Places | Same | Same |
| `osm_airports_count` | Overture Places | Same | Same |
| `foursquare_os_places_count` | Foursquare OS Places | Parquet | https://docs.foursquare.com/data-products/docs/access-fsq-os-places |
| `dining_and_drinking_fsq_count` | Foursquare OS Places | Same | Same |
| `retail_fsq_count` | Foursquare OS Places | Same | Same |
| (all other `*_fsq_count`) | Foursquare OS Places | Same | Same |

### Tier 6: Infrastructure (nice-to-have)

| Property | Source | Format |
|----------|--------|--------|
| `night_lights_intensity` | NASA Black Marble VNP46A4 | GeoTIFF |
| `motor_vehicle_road_length` | Overture Transportation segments | Parquet |
| `railway_length` | Overture Transportation segments | Parquet |
| `industrial_area` | Overture Buildings/Places (landuse=industrial) | Parquet |

---

## Pipeline architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     RASTER → H3                              │
│                                                              │
│  ESA WorldCover (10m GeoTIFF)  ──→  exactextract  ──→ CSV  │
│  Copernicus DEM (30m GeoTIFF)  ──→  exactextract  ──→ CSV  │
│  GHSL Built-H (100m GeoTIFF)  ──→  exactextract  ──→ CSV  │
│  ETH Canopy Height (10m)       ──→  exactextract  ──→ CSV  │
│                                                              │
│  (Alternative: Google Earth Engine → export as CSV/Parquet) │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     VECTOR → H3                              │
│                                                              │
│  Kontur Population (GeoPackage)     ──→ DuckDB H3  ──→ ──┐ │
│  Overture Places (Parquet)          ──→ DuckDB H3  ──→ ──┤ │
│  Overture Buildings (Parquet)       ──→ DuckDB H3  ──→ ──┤ │
│  Foursquare OS Places (Parquet)     ──→ DuckDB H3  ──→ ──┤ │
│  Overture Transportation (Parquet)  ──→ DuckDB H3  ──→ ──┘ │
│                                                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     JOIN + EXPORT                            │
│                                                              │
│  DuckDB: JOIN all H3 tables on h3 index                     │
│  → Export as GeoJSON/FlatGeobuf with H3 centroids           │
│                                                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     TILE + SERVE                             │
│                                                              │
│  tippecanoe → .mbtiles (z0-z9, drop-densest-as-needed)     │
│  pmtiles convert → .pmtiles                                 │
│  Upload to Cloudflare R2 (~$2/mo)                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Quick-start: minimum viable pipeline

If you want to get the map working fast with classification, here's the
**minimum viable subset** (population + land cover only, ~80% of the visual):

### Step 1: Install tools

```bash
brew install duckdb tippecanoe
# For raster→H3: pip install exactextract (or use GEE)
go install github.com/protomaps/go-pmtiles/cmd/pmtiles@latest
```

### Step 2: Download data

```bash
mkdir -p data/sources
cd data/sources

# Kontur Population (2.4 GB compressed)
curl -O https://geodata-eu-central-1-kontur-public.s3.eu-central-1.amazonaws.com/kontur_datasets/kontur_population_20231101.gpkg.gz
gunzip kontur_population_20231101.gpkg.gz

# ESA WorldCover — download tiles covering your area of interest
# Full global = ~300 GB of 10m GeoTIFF (large!)
# Per-tile: https://esa-worldcover.org/en → Download → select region
# Alternative: use the S3 bucket:
# s3://esa-worldcover/v200/2021/map/

# Copernicus DEM 30m — per tile
# https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model
```

### Step 3: Build H3 population table (DuckDB)

```sql
-- See data/build-h3.sql for the full script
INSTALL spatial; LOAD spatial;
INSTALL h3 FROM community; LOAD h3;

CREATE TABLE pop AS
SELECT h3, population
FROM st_read('sources/kontur_population_20231101.gpkg');
```

### Step 4: Aggregate land cover to H3 (exactextract or GEE)

```bash
# Using exactextract (requires H3 polygon grid as input)
exactextract \
  -r worldcover.tif \
  -p h3_grid.fgb \
  -s "frac" \
  -o landcover_h3.csv \
  --include-col h3
```

### Step 5: Join and export

```sql
-- Join population + land cover
-- Export as GeoJSONSeq with H3 centroids
COPY (
  SELECT p.h3,
         h3_cell_to_lng(p.h3) as lng,
         h3_cell_to_lat(p.h3) as lat,
         p.population,
         lc.builtup, lc.cropland, lc.forest, lc.herbage,
         lc.shrubs, lc.water, lc.bare, lc.snow
  FROM pop p
  LEFT JOIN landcover lc ON p.h3 = lc.h3
) TO 'wurman_h3.geojsonseq'
WITH (FORMAT GDAL, DRIVER 'GeoJSONSeq');
```

### Step 6: Generate tiles

```bash
tippecanoe \
  -o wurman_h3.mbtiles \
  -Z0 -z9 \
  --no-feature-limit \
  --no-tile-size-limit \
  -l wurman \
  wurman_h3.geojsonseq

pmtiles convert wurman_h3.mbtiles wurman_h3.pmtiles
```

### Step 7: Deploy

```bash
# Upload to Cloudflare R2
wrangler r2 object put wurman-tiles/wurman_h3.pmtiles --file wurman_h3.pmtiles

# Or serve locally for dev
npx pmtiles serve wurman_h3.pmtiles
```

---

## Cost summary

| Item | One-time | Monthly |
|------|----------|---------|
| Data downloads | Free (all open data) | — |
| Processing (local machine, ~2-4 hours) | $0 | — |
| Cloudflare R2 storage (1.5 GB) | — | $0.02 |
| Cloudflare R2 reads (100K pageviews) | — | $1.80 |
| **Total** | **$0** | **~$2** |

## Reference

- Kontur dataset catalog: `data/kontur_datasets_may2025.xlsx`
- classify.ts property usage: `src/deck/classify.ts`
- ESA WorldCover: https://esa-worldcover.org/en
- Copernicus DEM: https://spacedata.copernicus.eu
- GHSL: https://human-settlement.emergency.copernicus.eu
- Overture Maps: https://overturemaps.org
- Foursquare OS Places: https://docs.foursquare.com/data-products/docs/access-fsq-os-places
- tippecanoe: https://github.com/felt/tippecanoe
- PMTiles: https://github.com/protomaps/PMTiles
- DuckDB H3: https://github.com/isaacbrodsky/h3-duckdb
