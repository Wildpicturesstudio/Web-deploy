import Button from '../ui/Button';
import { useNavigate } from 'react-router-dom';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { useTranslation } from 'react-i18next';

interface CTAProps { theme?: 'dark' | 'light' }
const CTA = ({ theme = 'light' }: CTAProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { flags } = useFeatureFlags();

  const handleBooking = () => {
    if (!flags.pages.booking) return;
    navigate('/booking');
  };

  const isDark = theme === 'dark';
  return (
    <section className={`py-20 ${isDark ? 'bg-primary text-white' : 'bg-accent/20'}`}>
      <div className="container-custom min-h-[calc(100vh-5rem)] flex items-center justify-center">
        <div className="max-w-3xl w-full mx-auto text-center">
          <h2 className={`section-title mx-auto after:left-1/2 after:-translate-x-1/2 mb-6 ${isDark ? 'text-white' : ''}`}>
            {t('home.cta.title')}
          </h2>
          <p className={`${isDark ? 'text-white/80' : 'text-gray-700'} mb-8 text-lg`}>
            {t('home.cta.subtitle')}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={handleBooking} className="btn-primary">
              {t('home.cta.buttons.book')}
            </button>
            <Button to="/contact" variant="secondary">
              {t('home.cta.buttons.contact')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
