import type maplibregl from 'maplibre-gl';

/** Render a canvas to ImageData for map.addImage() */
function canvasToImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d')!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Create a filled circle canvas for SDF icon rendering */
function createCircleImage(size = 64): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  return canvasToImageData(canvas);
}

/** Create a ring (stroke-only circle) canvas for reference markers */
function createRingImage(size = 64): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  return canvasToImageData(canvas);
}

/** Register SDF circle and ring images on the map */
export function registerImages(map: maplibregl.Map): void {
  map.addImage('wurman-circle', createCircleImage(64), { sdf: true });
  map.addImage('wurman-ring', createRingImage(64), { sdf: true });
}
