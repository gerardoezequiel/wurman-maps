import type { Map } from 'maplibre-gl';
import { CITIES } from '../config';

/** Generate city navigation buttons and keyboard shortcuts */
export function setupCityNav(map: Map): void {
  const container = document.getElementById('city-nav')!;
  const buttons: HTMLButtonElement[] = [];

  CITIES.forEach((city, i) => {
    const btn = document.createElement('button');
    btn.className = 'city-btn' + (i === 0 ? ' active' : '');
    btn.textContent = city.name;

    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      map.flyTo({
        center: [city.lng, city.lat],
        zoom: city.zoom,
        duration: 2000,
        essential: true,
      });
    });

    container.appendChild(btn);
    buttons.push(btn);
  });

  // Keyboard shortcuts: 1-N for city navigation
  document.addEventListener('keydown', (e) => {
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= buttons.length) {
      buttons[num - 1].click();
    }
  });
}
