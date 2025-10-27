import { useState } from 'react';
import { sessionPackages, galleryImages } from '../data/sessionsData';
import { parsePrice } from '../utils/format';
import { ChevronRight } from 'lucide-react';
import Button from '../components/ui/Button';

const SessionsPage = () => {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'default'|'asc'|'desc'>('asc');
  
  const categories = [
    { id: 'all', name: 'Todos' },
    { id: 'portrait', name: 'Retratos' },
    { id: 'family', name: 'Família' },
    { id: 'maternity', name: 'Gestante' },
    { id: 'couple', name: 'Casal' },
    { id: 'prewedding', name: 'Pré-Wedding' },
  ];
  
  const filteredImages = filter === 'all' 
    ? galleryImages 
    : galleryImages.filter(img => img.category === filter);

  return (
    <>
      <section className="pt-32 pb-16 bg-accent/30">
        <div className="container-custom">
          <div className="max-w-2xl">
            <h1 className="section-title text-4xl md:text-5xl mb-6">Sessões Fotográficas</h1>
            <p className="text-gray-700 mb-6">
              Nossos ensaios fotográficos são experiências únicas, onde capturamos momentos 
              autênticos e emocionantes. Seja para retratos individuais, família, gestantes ou casais, 
              criamos imagens que contam sua história de forma artística e sensível.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container-custom">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="section-title mb-0">Pacotes Disponíveis</h2>
            <div className="ml-auto">
              <label className="text-sm mr-2">Ordenar:</label>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)} className="border px-2 py-1 text-sm">
                <option value="default">Por defecto</option>
                <option value="asc">Precio: menor a mayor</option>
                <option value="desc">Precio: mayor a menor</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[...sessionPackages]
              .sort((a,b)=>{
                if (sortBy==='default') return 0;
                const pa = parsePrice(a.price);
                const pb = parsePrice(b.price);
                return sortBy==='asc' ? pa - pb : pb - pa;
              })
              .map((pkg) => (
              <div key={pkg.id} className="card flex flex-col h-full relative max-h-screen lg:max-h-[85vh] overflow-x-hidden min-h-0">
                <div className="h-48 md:h-56 overflow-hidden mb-4">
                  <img loading="lazy"
                    src={pkg.image} 
                    alt={pkg.title} 
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-lg md:text-xl font-playfair font-medium mb-2">{pkg.title}</h3>
                <p className="text-gray-600 text-sm md:text-base mb-4 break-words">{pkg.description}</p>
                <div className="flex items-center space-x-2 mb-4">
                  <span className="text-xl md:text-2xl font-playfair text-primary">{pkg.price}</span>
                  <span className="text-gray-500 text-sm">/{pkg.duration}</span>
                </div>
                <ul className="mb-6 flex-grow overflow-visible md:overflow-auto">
                  {pkg.features.map((feature, i) => (
                    <li key={i} className="flex items-start mb-2">
                      <ChevronRight size={16} className="text-secondary mt-1 mr-2 flex-shrink-0" />
                      <span className="text-xs md:text-sm text-gray-700 break-words">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button to="/booking" variant="primary" className="mt-auto">
                  Reservar esta sessão
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-accent/10">
        <div className="container-custom">
          <h2 className="section-title mb-8">Galeria</h2>
          
          <div className="flex flex-wrap justify-center space-x-2 mb-12">
            {categories.map((category) => (
              <button 
                key={category.id}
                className={`px-4 py-2 mb-2 ${
                  filter === category.id 
                    ? 'bg-primary text-white' 
                    : 'bg-white text-primary hover:bg-gray-100'
                }`}
                onClick={() => setFilter(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredImages.map((image) => (
              <div key={image.id} className="gallery-item">
                <img loading="lazy"
                  src={image.src} 
                  alt={image.alt} 
                  className="w-full h-80 object-cover"
                />
                <div className="gallery-overlay">
                  <span className="text-white font-playfair text-xl">
                    {image.alt}
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="text-center mt-12">
            <Button to="/booking" variant="primary">
              Reservar sessão
            </Button>
          </div>
        </div>
      </section>
    </>
  );
};

export default SessionsPage;
