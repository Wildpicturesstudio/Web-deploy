import { ReactNode, useEffect, useState } from 'react';
import Header from './Header';
import Footer from './Footer';
import { Camera } from 'lucide-react';
import ImageAdminOverlay from '../admin/ImageAdminOverlay';
import FloatingWhatsApp from './FloatingWhatsApp';
import { fetchImageOverrides, applyImageOverrides } from '../../utils/siteImageOverrides';
import { useLocation } from 'react-router-dom';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const [mounted, setMounted] = useState(false);
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  useEffect(() => {
    setTimeout(() => {
      setMounted(true);
    }, 1000);

    // Add intersection observer for fade-in animations
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('appear');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    const fadeElements = document.querySelectorAll('.fade-in');
    fadeElements.forEach(element => {
      observer.observe(element);
    });

    return () => {
      fadeElements.forEach(element => {
        observer.unobserve(element);
      });
    };
  }, []);

  // Admin image overlay: disable when site_admin_mode is set
  useEffect(() => {
    const handler = (e: any) => {
      const val = e?.detail ?? (sessionStorage.getItem('site_admin_mode') ? true : false);
      if (val) {
        ImageAdminOverlay.destroyImageAdminOverlay();
      } else {
        ImageAdminOverlay.initImageAdminOverlay();
      }
    };
    window.addEventListener('siteAdminModeChanged', handler as EventListener);
    // run once based on current value
    if (typeof window !== 'undefined' && sessionStorage.getItem('site_admin_mode')) {
      ImageAdminOverlay.destroyImageAdminOverlay();
    }
    return () => {
      window.removeEventListener('siteAdminModeChanged', handler as EventListener);
      ImageAdminOverlay.initImageAdminOverlay();
    };
  }, []);

  // Apply persisted image overrides for public site
  useEffect(() => {
    let obs: MutationObserver | null = null;
    const loadAndApply = async () => {
      const map = await fetchImageOverrides();
      applyImageOverrides(map);
      if (obs) obs.disconnect();
      obs = new MutationObserver(() => applyImageOverrides(map));
      obs.observe(document.body, { childList: true, subtree: true });
    };
    loadAndApply();
    return () => { if (obs) obs.disconnect(); };
  }, []);

  if (!mounted) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center">
        <div className="text-center">
          <Camera size={48} className="text-primary animate-pulse mx-auto mb-4" />
          <div className="text-primary font-playfair text-2xl">Wild Pictures Studio</div>
          <div className="text-primary/80 text-sm uppercase tracking-widest mt-1">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen opacity-100 transition-opacity duration-500 bg-background text-primary">
      {!isAdmin && <Header />}
      <main className="flex-grow">
        {children}
      </main>
      {!isAdmin && <Footer />}

      <FloatingWhatsApp />
    </div>
  );
};

export default Layout;
