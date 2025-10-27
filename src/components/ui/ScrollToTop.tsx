import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop = () => {
  const location = useLocation();
  const { pathname, state } = location as any;

  useEffect(() => {
    // Skip auto scroll when a targeted section scroll is requested
    if (state && state.scrollTo) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, state]);

  return null;
};

export default ScrollToTop;
