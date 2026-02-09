import type { Map } from 'maplibre-gl';

/** Wire sidebar city buttons + keyboard shortcuts */
export function setupCityNav(map: Map): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.city-btn');

  buttons.forEach((b) => {
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      const [lng, lat, z] = b.dataset.c!.split(',').map(Number);
      document.getElementById('city-title')!.textContent = b.dataset.name!;
      map.flyTo({ center: [lng, lat], zoom: z, duration: 1800 });
    });
  });

  document.addEventListener('keydown', (e) => {
    const bs = [...buttons];
    const n = e.key === '0' ? 10 : parseInt(e.key, 10);
    if (n >= 1 && n <= bs.length) bs[n - 1].click();
  });
}
