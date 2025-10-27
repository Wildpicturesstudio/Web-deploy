import React, { PropsWithChildren, useEffect, useRef, useState } from 'react';

interface ParallaxSectionProps {
  className?: string;
  backgroundImage?: string | null;
  backgroundSpeed?: number; // 0.0 - 1.0 (lower = slower movement)
  contentSpeed?: number; // 0.0 - 1.0 (higher = more aggressive movement)
  zIndexClassName?: string; // allow stacking control (e.g., 'relative z-20')
  fullScreen?: boolean; // occupy full viewport height
}

const ParallaxSection: React.FC<PropsWithChildren<ParallaxSectionProps>> = ({
  children,
  className = '',
  backgroundImage = null,
  backgroundSpeed = 0.2,
  contentSpeed = 0.4,
  zIndexClassName = 'relative',
  fullScreen = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [bgY, setBgY] = useState(0);
  const [contentY, setContentY] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const tickingRef = useRef(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.matchMedia('(max-width: 767px)').matches);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        if (isMobile) {
          setBgY(0);
          setContentY(0);
          tickingRef.current = false;
          return;
        }
        const el = containerRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const translateBase = -rect.top; // how far the section has moved past top of viewport
          setBgY(translateBase * backgroundSpeed);
          setContentY(translateBase * contentSpeed);
        }
        tickingRef.current = false;
      });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll as any);
      window.removeEventListener('resize', onScroll as any);
    };
  }, [backgroundSpeed, contentSpeed, isMobile]);

  return (
    <div
      ref={containerRef}
      className={`${zIndexClassName} overflow-visible md:overflow-hidden ${className}`}
      style={fullScreen ? { minHeight: '100vh' } : undefined}
    >
      {/* Background layer */}
      {backgroundImage && (
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            transform: isMobile ? undefined : `translateY(${bgY}px)`
          }}
        />
      )}

      {/* Content layer with parallax motion */}
      <div className={isMobile ? '' : 'will-change-transform'} style={{ transform: isMobile ? undefined : `translateY(${contentY}px)` }}>
        {children}
      </div>
    </div>
  );
};

export default ParallaxSection;
