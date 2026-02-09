import { BINS, COL } from '../config';

/** Build inline population bin legend in the top band */
export function setupBins(): void {
  const row = document.getElementById('bins-row')!;
  for (let i = 1; i < BINS.length; i++) {
    const item = document.createElement('div');
    item.className = 'bin-item';
    const R = 9;
    const sz = R * 2 + 3;
    const cx = sz / 2;
    const cy = sz / 2;
    let svg = `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}">`;
    svg += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgb(${COL.mauve})" stroke-width="0.6" opacity="0.5"/>`;
    const dr = BINS[i].dotR * R;
    svg += `<circle cx="${cx}" cy="${cy}" r="${dr}" fill="rgb(${COL.crimson})" opacity="0.85"/>`;
    svg += '</svg>';
    item.innerHTML = svg + `<span>${BINS[i].label}</span>`;
    row.appendChild(item);
  }
}
