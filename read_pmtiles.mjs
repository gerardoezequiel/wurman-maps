import { PMTiles } from "pmtiles";

class HttpSource {
  constructor(url) {
    this.url = url;
  }
  getKey() { return this.url; }
  async getBytes(offset, length, signal, etag) {
    const resp = await fetch(this.url, {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal,
    });
    const ab = await resp.arrayBuffer();
    return { data: ab, etag: resp.headers.get("etag") || undefined, expires: undefined, cacheControl: undefined };
  }
}

async function main() {
  const url = "https://data.source.coop/smartmaps/foil4gr1/kpop.pmtiles";
  const src = new HttpSource(url);
  const p = new PMTiles(src);
  
  const header = await p.getHeader();
  console.log("=== HEADER ===");
  console.log(JSON.stringify(header, null, 2));
  
  const metadata = await p.getMetadata();
  console.log("\n=== METADATA ===");
  console.log(JSON.stringify(metadata, null, 2));
}

main().catch(e => console.error(e));
