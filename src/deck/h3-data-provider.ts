import { MVTLayer } from '@deck.gl/geo-layers';
import type { Layer } from '@deck.gl/core';
import { prep } from './classify';
import type { PreparedFeature } from './classify';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Configuration for an H3-based MVT tile source */
export interface H3DataProviderOptions {
  /** MVT tile URL template with {z}/{x}/{y} placeholders */
  tileUrl: string;
  /** Minimum zoom for tile fetching (default 0) */
  minZoom?: number;
  /** Maximum zoom for tile fetching (default 9) */
  maxZoom?: number;
  /** Property name that contains the H3 cell index (default "h3") */
  h3Property?: string;
}

/**
 * H3DataProvider — manages an H3-indexed MVT tile source.
 *
 * Responsibilities:
 * - Tile URL and zoom range configuration
 * - Feature preprocessing (position from H3, classification, hashing)
 * - Cross-tile deduplication by H3 cell index
 * - MVTLayer creation with proper viewport-load handling
 */
export class H3DataProvider {
  readonly tileUrl: string;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly h3Property: string;

  private seenH3 = new Set<string>();

  constructor(options: H3DataProviderOptions) {
    this.tileUrl = options.tileUrl;
    this.minZoom = options.minZoom ?? 0;
    this.maxZoom = options.maxZoom ?? 9;
    this.h3Property = options.h3Property ?? 'h3';
  }

  /** Clear the deduplication cache — call before each full layer rebuild */
  clearSeen(): void {
    this.seenH3.clear();
  }

  /** Preprocess all features when the viewport loads new tiles */
  onViewportLoad(tiles: unknown): void {
    this.seenH3.clear();
    if (!tiles || !Array.isArray(tiles)) return;
    for (const t of tiles) {
      const tile = t as { data?: PreparedFeature[] };
      if (tile.data) {
        for (const f of tile.data) {
          if (f.properties?.[this.h3Property]) prep(f);
        }
      }
    }
  }

  /**
   * Deduplicate and prepare features from a single tile.
   * Returns only features with a valid H3 index that haven't been seen yet.
   */
  processFeatures(data: PreparedFeature[]): PreparedFeature[] {
    const unique: PreparedFeature[] = [];
    for (const d of data) {
      const idx = d.properties?.[this.h3Property];
      if (!idx || this.seenH3.has(idx as string)) continue;
      this.seenH3.add(idx as string);
      unique.push(d);
    }
    unique.forEach(prep);
    return unique;
  }

  /**
   * Create the deck.gl MVTLayer configured for this H3 data source.
   *
   * @param id       — layer id prefix
   * @param subLayer — callback that receives deduplicated, prepared features
   *                    for a tile and returns the sublayers to render
   * @param updateTriggers — additional values that trigger re-renders
   */
  createMVTLayer(
    id: string,
    subLayer: (tileId: string, features: PreparedFeature[]) => Layer[],
    updateTriggers?: unknown[],
  ): MVTLayer {
    return new MVTLayer({
      id,
      data: this.tileUrl,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom,
      binary: false,
      uniqueIdProperty: this.h3Property,

      onViewportLoad: (tiles: unknown) => this.onViewportLoad(tiles),

      renderSubLayers: (props: any) => {
        const data = props.data as PreparedFeature[] | undefined;
        if (!data?.length) return null;
        const features = this.processFeatures(data);
        if (!features.length) return null;
        return subLayer(props.id, features);
      },

      updateTriggers: {
        renderSubLayers: updateTriggers,
      },
    });
  }
}
