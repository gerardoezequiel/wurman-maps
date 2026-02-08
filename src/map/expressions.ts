import type { ExpressionSpecification } from 'maplibre-gl';
import { COLORS } from '../config';

/**
 * Dominant land cover color expression.
 * Compares builtup, forest, cropland, and grass (shrubs + herbage)
 * and returns the color of whichever class has the largest area.
 */
export function makeLandCoverColorExpr(): ExpressionSpecification {
  const b: ExpressionSpecification = ['coalesce', ['get', 'builtup'], 0];
  const f: ExpressionSpecification = ['coalesce', ['get', 'forest'], 0];
  const c: ExpressionSpecification = ['coalesce', ['get', 'cropland'], 0];
  const g: ExpressionSpecification = ['+', ['coalesce', ['get', 'shrubs'], 0], ['coalesce', ['get', 'herbage'], 0]];

  return [
    'case',
    // Built-up dominant
    ['all', ['>=', b, f], ['>=', b, c], ['>=', b, g], ['>', b, 0]],
    COLORS.urban,
    // Forest dominant
    ['all', ['>=', f, b], ['>=', f, c], ['>=', f, g], ['>', f, 0]],
    COLORS.forest,
    // Cropland dominant
    ['all', ['>=', c, b], ['>=', c, f], ['>=', c, g], ['>', c, 0]],
    COLORS.cropland,
    // Grass/shrub dominant
    ['all', ['>=', g, b], ['>=', g, f], ['>=', g, c], ['>', g, 0]],
    COLORS.grass,
    // Fallback
    COLORS.bare,
  ] as ExpressionSpecification;
}

/**
 * Population → icon size expression.
 * Uses sqrt scaling so circle area is proportional to population.
 * Clamped to the saturation value, with zoom-dependent base size.
 */
export function makePopSizeExpr(saturation: number): ExpressionSpecification {
  const normalized: ExpressionSpecification = [
    '/', ['min', ['coalesce', ['get', 'population'], 0], saturation], saturation,
  ];
  const sqrtNorm: ExpressionSpecification = ['^', normalized, 0.5];

  return [
    'interpolate', ['linear'], ['zoom'],
    5,  ['*', 0.08, sqrtNorm],
    7,  ['*', 0.18, sqrtNorm],
    9,  ['*', 0.45, sqrtNorm],
    11, ['*', 0.9,  sqrtNorm],
    13, ['*', 1.8,  sqrtNorm],
  ] as ExpressionSpecification;
}
