export function isGpuAmbientAllowed() {
  if (!('gpu' in navigator) || !navigator.gpu) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return false;
  if (window.matchMedia('(forced-colors: active)').matches) return false;
  return true;
}
