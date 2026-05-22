// useIsMobile — true when the viewport is narrow enough that the desktop
// absolute-overlay layout (side rails + wide transport) no longer fits and we
// switch to the stacked, vertically-scrolling mobile layout instead.

import { useEffect, useState } from 'react';

const MOBILE_MAX = 768; // px — below this we use the mobile layout

export function useIsMobile(max = MOBILE_MAX) {
  const query = `(max-width: ${max}px)`;
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    // addEventListener is the modern API; older Safari uses addListener.
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    setIsMobile(mql.matches);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return isMobile;
}
