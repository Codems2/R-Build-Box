/*
 * Detecta cuándo se ha desplegado una versión nueva de la web mientras la app
 * está abierta. Como es una SPA, una pestaña ya abierta seguiría ejecutando el
 * JS antiguo (en memoria / cacheado por el service worker) hasta una recarga
 * completa. Aquí comparamos el nombre del bundle referenciado por el
 * index.html servido: si cambia respecto al que se cargó al arrancar, hay
 * versión nueva y avisamos para recargar.
 */

const ASSET_RE = /assets\/index-[A-Za-z0-9_-]+\.js/;

async function fetchCurrentAsset(): Promise<string | null> {
  try {
    // no-store: siempre pedimos a red, sin caché, para ver el HTML desplegado.
    const res = await fetch('/index.html', { cache: 'no-store' });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(ASSET_RE);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

/**
 * Empieza a vigilar despliegues nuevos. Llama a `onUpdate()` una sola vez
 * cuando detecta que el bundle desplegado ha cambiado. Devuelve una función
 * para dejar de vigilar.
 */
export function startUpdateWatcher(onUpdate: () => void): () => void {
  let baseline: string | null = null;
  let notified = false;

  const check = async () => {
    if (notified) return;
    const asset = await fetchCurrentAsset();
    if (!asset) return;
    if (baseline === null) {
      baseline = asset; // primera lectura: fija la referencia
      return;
    }
    if (asset !== baseline) {
      notified = true;
      onUpdate();
    }
  };

  void check();
  const interval = window.setInterval(check, 5 * 60 * 1000); // cada 5 min
  const onVisible = () => {
    if (!document.hidden) void check();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  };
}
