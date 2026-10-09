// Navigasi sederhana berbasis hash (#/, #/hall, #/avatar) supaya tetap jalan di GitHub Pages.
import { useEffect, useState } from 'react';

const read = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0];

export function useRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path) {
  window.location.hash = path;
}
