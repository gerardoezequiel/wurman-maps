import { PMTiles } from "pmtiles";
import { gunzipSync } from "zlib";
import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";

class HttpSource {
  constructor(url) { this.url = url; }
  getKey() { return this.url; }
  async getBytes(offset, length, signal, etag) {
    const resp = await fetch(this.url, {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal,
    });
    const ab = await resp.arrayBuffer();
    return { data: ab, etag: resp.headers.get("etag") || undefined };
  }
}

async function main() {
  const url = "https://data.source.coop/smartmaps/foil4gr1/kpop.pmtiles";
  const p = new PMTiles(new HttpSource(url));
  
  const result = await p.getZxy(2, 2, 1);
  if (!result) { console.log("Tile empty"); return; }
  
  const buf = Buffer.from(result.data);
  console.log("First bytes:", buf[0].toString(16), buf[1].toString(16));
  
  // Check if gzipped (1f 8b) or raw
  let data;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    data = gunzipSync(buf);
  } else {
    data = buf;
  }
  
  const tile = new VectorTile(new Protobuf(data));
  
  for (const layerName of Object.keys(tile.layers)) {
    const layer = tile.layers[layerName];
    console.log(`Layer: "${layerName}", features: ${layer.length}`);
    
    for (let i = 0; i < Math.min(5, layer.length); i++) {
      const f = layer.feature(i);
      const geomTypes = {1:'Point',2:'LineString',3:'Polygon'};
      console.log(`  Feature ${i}: geometry=${geomTypes[f.type]||f.type}, properties=`, JSON.stringify(f.properties));
    }
    if (layer.length > 5) {
      const f = layer.feature(layer.length - 1);
      const geomTypes = {1:'Point',2:'LineString',3:'Polygon'};
      console.log(`  Feature ${layer.length - 1}: geometry=${geomTypes[f.type]||f.type}, properties=`, JSON.stringify(f.properties));
    }
  }
}

main().catch(e => console.error(e));
