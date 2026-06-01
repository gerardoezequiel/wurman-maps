import { describe, it, expect } from 'vitest';
import { classify, fieldRGB } from './classify';
import type { KonturProps } from './classify';
import { getBin, BINS, FC } from '../config';

/** Build a KonturProps with sane zero defaults. */
function cell(overrides: Partial<KonturProps>): KonturProps {
  return { population: 1000, ...overrides };
}

describe('classify — Wurman land-use grammar', () => {
  it('classifies dominant water as water', () => {
    expect(classify(cell({ permanent_water: 0.6 }))).toBe('water');
  });

  it('classifies forest with low built-up as green', () => {
    expect(classify(cell({ forest: 0.45, builtup: 0.05 }))).toBe('green');
  });

  it('does NOT treat cropland as green (agriculture is not park/forest)', () => {
    // Cropland-dominant cell with no forest/grass should not be green.
    expect(classify(cell({ cropland: 0.6, forest: 0, herbage: 0 }))).not.toBe('green');
  });

  it('classifies dense POI cores as commercial', () => {
    expect(classify(cell({ foursquare_os_places_count: 300, eatery_count: 60, retail_fsq_count: 70 }))).toBe('commercial');
  });

  it('classifies civic/education-dominant cells as institutional', () => {
    // Education/health dominate the POI mix → institutional accent.
    expect(classify(cell({ osm_schools_count: 14, foursquare_os_places_count: 30, eatery_count: 2, retail_fsq_count: 2 }))).toBe('institutional');
  });

  it('does NOT over-classify a commercial CBD that also has some schools', () => {
    // Schools present but commerce dominates → commercial, not institutional.
    expect(classify(cell({ osm_schools_count: 4, foursquare_os_places_count: 400, eatery_count: 120, retail_fsq_count: 90 }))).toBe('commercial');
  });

  it('classifies strong industrial land cover as industrial', () => {
    expect(classify(cell({ industrial_area: 0.2, residential: 0.0 }))).toBe('industrial');
  });

  it('falls back to residential for ordinary populated cells', () => {
    expect(classify(cell({ population: 2000, residential: 0.4, foursquare_os_places_count: 8 }))).toBe('residential');
  });
});

describe('getBin — population size classes', () => {
  it('maps zero population to the smallest bin', () => {
    expect(getBin(0)).toBe(0);
  });

  it('increases bin index with population', () => {
    expect(getBin(100)).toBeGreaterThan(getBin(10));
    expect(getBin(5000)).toBe(BINS.length - 1);
  });

  it('is monotonic across bin boundaries', () => {
    for (let i = 1; i < BINS.length; i++) {
      expect(getBin(BINS[i].min)).toBeGreaterThanOrEqual(getBin(BINS[i - 1].min));
    }
  });
});

describe('fieldRGB — land-cover field colour', () => {
  it('returns water colour for water-dominant cells', () => {
    expect(fieldRGB(cell({ permanent_water: 0.5 }))).toEqual(FC.water);
  });

  it('returns forest colour for forest-dominant cells', () => {
    expect(fieldRGB(cell({ forest: 0.6 }))).toEqual(FC.forest);
  });

  it('returns crop colour for cropland-dominant cells', () => {
    expect(fieldRGB(cell({ cropland: 0.6 }))).toEqual(FC.crop);
  });
});
