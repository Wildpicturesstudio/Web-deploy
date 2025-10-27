import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const Hero = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const tickingRef = useRef(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const heroImages = [
    'https://images.pexels.com/photos/1456268/pexels-photo-1456268.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/1488312/pexels-photo-1488312.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/1701205/pexels-photo-1701205.jpeg?auto=compress&cs=tinysrgb&w=1600'
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % heroImages.length);
    }, 6000);

    return () => clearInterval(interval);
  }, [heroImages.length]);

  useEffect(() => {
    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        setScrollY(window.scrollY || window.pageYOffset || 0);
        tickingRef.current = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll as any);
  }, []);

  const handleBooking = () => {
    navigate('/booking');
  };

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia('(max-width: 767px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <section className="relative h-screen">
      <div className="absolute inset-0 overflow-hidden">
        {heroImages.map((image, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-opacity duration-1500 ease-in-out ${
              index === activeSlide ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="absolute inset-0 bg-hero-pattern z-10"></div>
            <img loading="lazy"
              src={image}
              alt="Wild Pictures Studio Photography"
              className={`absolute inset-0 w-full h-full object-cover ${isMobile ? '' : 'will-change-transform scale-125'}`}
              style={{ transform: isMobile ? undefined : `translateY(${scrollY * 0.5}px)` }}
            />
          </div>
        ))}
      </div>
      
      <div className="relative z-20 h-full flex items-start md:items-center pt-24 md:pt-0">
        <div className="container-custom">
          <div className="max-w-3xl mx-auto text-center text-white hero-reveal">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-playfair font-semibold mb-4">
              {t('home.hero.title')}
            </h1>
            <p className="text-lg md:text-xl opacity-90 mb-8">
              {t('home.hero.subtitle')}
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => navigate('/portfolio')}
                className="btn-secondary"
              >
                {t('home.hero.cta.portfolio')}
              </button>
              <button
                onClick={handleBooking}
                className="btn-primary hero-cta-black"
              >
                {t('home.hero.cta.book')}
              </button>
            </div>
            
            <div className="mt-12 flex justify-center space-x-3">
              {heroImages.map((_, index) => (
                <button
                  key={index}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    index === activeSlide ? 'bg-white' : 'bg-white/30'
                  }`}
                  onClick={() => setActiveSlide(index)}
                  aria-label={`Slide ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
