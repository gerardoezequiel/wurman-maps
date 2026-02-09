import { MVTLayer } from '@deck.gl/geo-layers';
import { ScatterplotLayer } from '@deck.gl/layers';
import { IconLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { TILES, COL, BINS, SAT, MISREG, CELL_M } from '../config';
import { createAtlas, IM } from './atlas';
import { prep, getPos, getCls, getBinI } from './classify';
import type { PreparedFeature } from './classify';

const iconAtlas = createAtlas();

/* eslint-disable @typescript-eslint/no-explicit-any */

const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * Math.max(0, Math.min(1, t));

function ringOp(z: number): number { return lerp(0, 0.92, (z - 8) / 2); }
function dotOp(z: number): number { return lerp(0, 0.95, (z - 8.5) / 2); }
function fieldOp(z: number): number { return lerp(0, 0.9, (z - 7) / 2.5); }

const seenH3 = new Set<string>();

export function clearSeen(): void {
  seenH3.clear();
}

export function buildLayers(Z: number): Layer[] {
  const z = Z;
  const rOp = ringOp(z);
  const dOp = dotOp(z);
  const fOp = fieldOp(z);
  const m = MISREG;

  return [
    new MVTLayer({
      id: 'k',
      data: TILES,
      minZoom: 0,
      maxZoom: 9,
      binary: false,
      uniqueIdProperty: 'h3',

      onViewportLoad: (tiles: unknown) => {
        seenH3.clear();
        if (tiles && Array.isArray(tiles)) {
          for (const t of tiles) {
            const tile = t as { data?: PreparedFeature[] };
            if (tile.data) {
              for (const f of tile.data) {
                if (f.properties?.h3) prep(f);
              }
            }
          }
        }
      },

      renderSubLayers: (props: any) => {
        const data = props.data as PreparedFeature[] | undefined;
        if (!data?.length) return null;

        const allH3: PreparedFeature[] = [];
        for (const d of data) {
          const idx = d.properties?.h3;
          if (!idx || seenH3.has(idx as string)) continue;
          seenH3.add(idx as string);
          allH3.push(d);
        }
        allH3.forEach(prep);

        const populated = allH3.filter((d) => (d.properties.population || 0) > 0);
        const green = allH3.filter((d) => getCls(d) === 'green');
        const navy = populated.filter((d) => getCls(d) === 'commercial' || getCls(d) === 'industrial');
        const institutional = populated.filter((d) => getCls(d) === 'institutional');
        const water = allH3.filter((d) => getCls(d) === 'water');
        const layers: Layer[] = [];

        // TERRAIN FIELD
        if (fOp > 0.01) {
          layers.push(
            new ScatterplotLayer({
              id: `${props.id}-fld`,
              data: allH3,
              getPosition: getPos,
              getRadius: 420,
              getFillColor: (d: PreparedFeature) => {
                const rgb = d.__field!;
                return [rgb[0], rgb[1], rgb[2], 55];
              },
              radiusUnits: 'meters',
              radiusMinPixels: 1,
              radiusMaxPixels: 80,
              opacity: fOp,
              antialiasing: true,
            }),
          );
        }

        // PASS 1: MAUVE RINGS
        if (rOp > 0.01) {
          const cRings = populated.filter((d) => {
            const c = getCls(d);
            return c === 'residential' || c === 'green' || c === 'institutional';
          });
          if (cRings.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-rc`,
                data: cRings,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'circle_ring',
                getSize: (d: PreparedFeature) => CELL_M * (0.96 + d.__jx! * 0.04),
                getColor: (d: PreparedFeature) => [...COL.mauve, 165 + Math.round(d.__jy! * 20)],
                sizeUnits: 'meters',
                sizeMinPixels: 3,
                sizeMaxPixels: 60,
                opacity: rOp,
                billboard: false,
              }),
            );
          }
          if (navy.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-rs`,
                data: navy,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: () => 'square_ring',
                getSize: (d: PreparedFeature) => CELL_M * (0.96 + d.__jx2! * 0.04),
                getColor: (d: PreparedFeature) => [...COL.mauve, 145 + Math.round(d.__jx2! * 20)],
                sizeUnits: 'meters',
                sizeMinPixels: 3,
                sizeMaxPixels: 60,
                opacity: rOp,
                billboard: false,
              }),
            );
          }
        }

        // PASS 2: CRIMSON DOTS
        if (dOp > 0.01) {
          const dotData = populated.filter((d) => getBinI(d) > 0);
          if (dotData.length) {
            layers.push(
              new IconLayer({
                id: `${props.id}-dot`,
                data: dotData,
                getPosition: getPos,
                iconAtlas: iconAtlas as any,
                iconMapping: IM,
                getIcon: (d: PreparedFeature) => getCls(d) === 'green' ? 'sm_dot' : 'circle_dot',
                getSize: (d: PreparedFeature) => BINS[getBinI(d)].dotR * CELL_M,
                getColor: (d: PreparedFeature) => [...COL.crimson, 215 + Math.round(d.__jy! * 25)],
                sizeUnits: 'meters',
                sizeMinPixels: 0.5,
                sizeMaxPixels: 55,
                opacity: dOp,
                getPixelOffset: (d: PreparedFeature) => [d.__jx! * m * 1.2, d.__jy! * m * 1.2],
                billboard: false,
                pickable: dOp > 0.2,
                autoHighlight: true,
                highlightColor: [255, 255, 255, 50],
                updateTriggers: { getSize: [SAT], getPixelOffset: [m] },
              }),
            );
          }
        }

        // PASS 3: GREEN SQUARES
        if (dOp > 0.01 && green.length) {
          layers.push(
            new IconLayer({
              id: `${props.id}-gr`,
              data: green,
              getPosition: getPos,
              iconAtlas: iconAtlas as any,
              iconMapping: IM,
              getIcon: () => 'green_sq',
              getSize: (d: PreparedFeature) => CELL_M * (0.76 + d.__jx! * 0.04),
              getColor: (d: PreparedFeature) => [...COL.green, 155 + Math.round(d.__jy2! * 25)],
              sizeUnits: 'meters',
              sizeMinPixels: 1.5,
              sizeMaxPixels: 50,
              opacity: dOp * 0.85,
              getPixelOffset: (d: PreparedFeature) => [d.__jx2! * m * 1.6, d.__jy2! * m * 1.6],
              billboard: false,
              updateTriggers: { getPixelOffset: [m] },
            }),
          );
        }

        // PASS 4: INDIGO SQUARES
        if (dOp > 0.01 && navy.length) {
          layers.push(
            new IconLayer({
              id: `${props.id}-nv`,
              data: navy,
              getPosition: getPos,
              iconAtlas: iconAtlas as any,
              iconMapping: IM,
              getIcon: () => 'navy_sq',
              getSize: (d: PreparedFeature) => CELL_M * (0.66 + d.__jy! * 0.04),
              getColor: (d: PreparedFeature) => [...COL.indigo, 180 + Math.round(d.__jx3! * 20)],
              sizeUnits: 'meters',
              sizeMinPixels: 1.5,
              sizeMaxPixels: 45,
              opacity: dOp * 0.9,
              getPixelOffset: (d: PreparedFeature) => [d.__jx3! * m * 1.3, d.__jy3! * m * 1.3],
              billboard: false,
              updateTriggers: { getPixelOffset: [m] },
            }),
          );
        }

        // PASS 4b: INSTITUTIONAL DIAMONDS
        if (dOp > 0.01 && institutional.length) {
          layers.push(
            new IconLayer({
              id: `${props.id}-in`,
              data: institutional,
              getPosition: getPos,
              iconAtlas: iconAtlas as any,
              iconMapping: IM,
              getIcon: () => 'diamond',
              getSize: CELL_M * 0.5,
              getColor: (d: PreparedFeature) => [74, 128, 128, 175 + Math.round(d.__jy2! * 20)],
              sizeUnits: 'meters',
              sizeMinPixels: 1,
              sizeMaxPixels: 35,
              opacity: dOp * 0.85,
              getPixelOffset: (d: PreparedFeature) => [d.__jx2! * m * 1.0, d.__jy3! * m * 1.0],
              billboard: false,
              updateTriggers: { getPixelOffset: [m] },
            }),
          );
        }

        // PASS 5: WATER SQUARES
        if (dOp > 0.01 && water.length) {
          layers.push(
            new IconLayer({
              id: `${props.id}-wa`,
              data: water,
              getPosition: getPos,
              iconAtlas: iconAtlas as any,
              iconMapping: IM,
              getIcon: () => 'blue_sq',
              getSize: CELL_M * 0.72,
              getColor: (d: PreparedFeature) => [...COL.blue, 105 + Math.round(d.__jx3! * 20)],
              sizeUnits: 'meters',
              sizeMinPixels: 1.5,
              sizeMaxPixels: 50,
              opacity: dOp * 0.7,
              getPixelOffset: (d: PreparedFeature) => [d.__jx! * m * 1.4, d.__jy2! * m * 1.4],
              billboard: false,
              updateTriggers: { getPixelOffset: [m] },
            }),
          );
        }

        // CHOROPLETH (high zoom)
        if (z > 12.5) {
          const op = lerp(0, 0.6, (z - 12.5) / 1.5);
          if (op > 0.01) {
            const CC: Record<string, readonly number[]> = {
              residential: COL.crimson,
              green: COL.green,
              commercial: COL.indigo,
              industrial: COL.indigo,
              institutional: [74, 128, 128],
              water: COL.blue,
            };
            layers.push(
              new ScatterplotLayer({
                id: `${props.id}-ch`,
                data: populated,
                getPosition: getPos,
                getRadius: 450,
                getFillColor: (d: PreparedFeature) => {
                  const rgb = CC[getCls(d)] || COL.crimson;
                  const r = Math.min((d.properties.population || 0) / SAT, 1);
                  return [rgb[0], rgb[1], rgb[2], Math.round(Math.pow(r, 0.35) * 170 + 30)];
                },
                radiusUnits: 'meters',
                radiusMinPixels: 3,
                radiusMaxPixels: 80,
                opacity: op,
                antialiasing: true,
                pickable: true,
                autoHighlight: true,
                highlightColor: [255, 255, 255, 35],
                updateTriggers: { getFillColor: [SAT] },
              }),
            );
          }
        }

        return layers;
      },

      updateTriggers: {
        renderSubLayers: [SAT, Math.round(MISREG * 10), Math.round(Z * 3)],
      },
    }),
  ];
}
