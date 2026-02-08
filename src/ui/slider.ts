import type { Map } from 'maplibre-gl';
import { makePopSizeExpr } from '../map/expressions';

/** Wire the population saturation slider to the wurman-dots layer */
export function setupSlider(map: Map): void {
  const slider = document.getElementById('pop-slider') as HTMLInputElement;
  const display = document.getElementById('pop-value')!;

  slider.addEventListener('input', () => {
    const value = parseInt(slider.value, 10);
    display.textContent = value.toLocaleString();

    if (map.getLayer('wurman-dots')) {
      map.setLayoutProperty('wurman-dots', 'icon-size', makePopSizeExpr(value));
    }
  });
}
