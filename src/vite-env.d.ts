/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override the H3 population PMTiles source (Kontur Population / self-hosted mirror). */
  readonly VITE_POP_PMTILES_URL?: string;
  /** Legacy override for a raw bivariate MVT tile template. */
  readonly VITE_BIVARIATE_TILES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
