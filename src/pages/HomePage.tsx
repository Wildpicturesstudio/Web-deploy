import Hero from '../components/home/Hero';
import React, { useEffect, useRef } from 'react';
import Testimonials from '../components/home/Testimonials';
import CTA from '../components/home/CTA';
import ParallaxSection from '../components/ui/ParallaxSection';
import { Camera, Users, Baby, Landmark } from 'lucide-react';
import Button from '../components/ui/Button';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFeatureFlags } from '../contexts/FeatureFlagsContext';
import { useAuth } from '../contexts/AuthContext';

const HomePage = () => {
  const { t } = useTranslation();
  const { flags } = useFeatureFlags();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = !!user && user.email === 'javierevents2@gmail.com';

  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (hasScrolledRef.current) return;
    const scrollTo = (location.state as any)?.scrollTo;
    if (scrollTo === 'services') {
      hasScrolledRef.current = true;
      const perform = () => {
        const el = document.getElementById('nossos-servicos');
        const header = document.querySelector('header');
        const headerHeight = header ? (header as HTMLElement).offsetHeight : 0;
        const rect = el?.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const extraDown = 500;
        if (el && rect) {
          const target = rect.top + scrollTop - headerHeight + extraDown;
          window.scrollTo({ top: target, behavior: 'smooth' });
        }
      };
      setTimeout(perform, 80);
    }
  }, [location]);

  return (
    <>
      <Hero />

      <ParallaxSection className="bg-accent/10" contentSpeed={0.65} backgroundSpeed={0.25} zIndexClassName="relative z-10" fullScreen>
        <section id="nossos-servicos" className="min-h-screen pt-20 pb-32 md:pb-20 flex items-start md:items-center">
        <div className="container mx-auto px-4 sm:px-6 md:px-8">
          <div className="text-center mx-auto origin-center">
            <h2 className="section-title mx-auto after:left-1/2 after:-translate-x-1/2 mb-8">
              {t('home.services.title')}
            </h2>
            <p className="text-gray-700 mb-12 text-lg">
              {t('home.services.subtitle')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {flags.pages.portrait && (
                <div className="bg-white p-6 text-center rounded-lg shadow-md transform hover:scale-105 transition-transform duration-300 flex flex-col">
                  <Camera size={48} className="text-secondary mx-auto mb-6" />
                  <h3 className="text-2xl font-playfair mb-4">{t('home.services.portraits.title')}</h3>
                  <p className="text-gray-600 mb-4 flex-grow">
                    {t('home.services.portraits.description')}
                  </p>
                  <Button to="/portrait" variant="primary" className="w-full">
                    {t('nav.portraits')}
                  </Button>
                </div>
              )}

              {flags.pages.maternity && (
                <div className="bg-white p-6 text-center rounded-lg shadow-md transform hover:scale-105 transition-transform duration-300 flex flex-col">
                  <Baby size={48} className="text-secondary mx-auto mb-6" />
                  <h3 className="text-2xl font-playfair mb-4">{t('home.services.maternity.title')}</h3>
                  <p className="text-gray-600 mb-4 flex-grow">
                    {t('home.services.maternity.description')}
                  </p>
                  <Button to="/maternity" variant="primary" className="w-full">
                    {t('nav.maternity')}
                  </Button>
                </div>
              )}

              {flags.pages.events && (
                <div className="bg-white p-6 text-center rounded-lg shadow-md transform hover:scale-105 transition-transform duration-300 flex flex-col">
                  <Users size={48} className="text-secondary mx-auto mb-6" />
                  <h3 className="text-2xl font-playfair mb-4">{t('home.services.events.title')}</h3>
                  <p className="text-gray-600 mb-4 flex-grow">
                    {t('home.services.events.description')}
                  </p>
                  <Button to="/events" variant="primary" className="w-full">
                    {t('nav.events')}
                  </Button>
                </div>
              )}

              {flags.pages.civilWedding && (
                <div className="bg-white p-6 text-center rounded-lg shadow-md transform hover:scale-105 transition-transform duration-300 flex flex-col">
                  <Landmark size={48} className="text-secondary mx-auto mb-6" />
                  <h3 className="text-2xl font-playfair mb-4">Cas. Civil</h3>
                  <p className="text-gray-600 mb-4 flex-grow">
                    Pacotes pensados para cerimônias civis no cartório, com cobertura elegante e objetiva.
                  </p>
                  <Button to="/events/civil" variant="primary" className="w-full">
                    Cas. Civil
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        </section>
      </ParallaxSection>

      <ParallaxSection className="bg-black text-white" contentSpeed={0.55} backgroundSpeed={0.2} zIndexClassName="relative z-20" fullScreen>
        <section className="min-h-screen py-20 flex items-center">
        <div className="container-custom">
          <div className="transform scale-95 md:scale-90 origin-center grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div className="mx-auto my-10 rounded-lg shadow-lg flex items-center justify-center w-full max-w-xl">
              <img
                src="https://images.pexels.com/photos/3014856/pexels-photo-3014856.jpeg?auto=compress&cs=tinysrgb&w=1600"
                alt="Fotógrafa em ação"
                className="max-h-[75vh] w-auto max-w-full object-contain"
              />
            </div>
            <div>
              <h2 className="section-title mb-6 text-white">{t('home.about.title')}</h2>
              <p className="text-white/80 mb-6 text-lg">
                {t('home.about.description')}
              </p>
              <div className="grid grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-3xl font-playfair text-white mb-2">500+</p>
                  <p className="text-gray-300">{t('home.about.stats.clients')}</p>
                </div>
                <div>
                  <p className="text-3xl font-playfair text-white mb-2">5</p>
                  <p className="text-gray-300">{t('home.about.stats.experience')}</p>
                </div>
                <div>
                  <p className="text-3xl font-playfair text-white mb-2">1000+</p>
                  <p className="text-gray-300">{t('home.about.stats.sessions')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        </section>
      </ParallaxSection>

      <ParallaxSection className="bg-white" contentSpeed={0.45} backgroundSpeed={0.15} zIndexClassName="relative z-30" fullScreen>
        <div className="w-full transform scale-95 md:scale-90 origin-center">
          <Testimonials theme="light" />
        </div>
      </ParallaxSection>
      <ParallaxSection className="bg-black text-white" contentSpeed={0.5} backgroundSpeed={0.2} zIndexClassName="relative z-40" fullScreen>
        <div className="w-full transform scale-95 md:scale-90 origin-center">
          <CTA theme="dark" />
        </div>
      </ParallaxSection>

      {isAdmin && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button to="/admin" variant="secondary" className="px-4 py-2">
            {t('admin.title')}
          </Button>
        </div>
      )}
    </>
  );
}

export default HomePage;
