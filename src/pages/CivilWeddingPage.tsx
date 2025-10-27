import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebaseClient';
import { fetchPackages, DBPackage } from '../utils/packagesService';
import { formatPrice, parsePrice } from '../utils/format';
import { useCart } from '../contexts/CartContext';
import AddPackageModal from '../components/store/AddPackageModal';

const CivilWeddingPage = () => {
  const { addToCart } = useCart();
  const [dbEvents, setDbEvents] = useState<DBPackage[] | null>(null);
  const [sortCivil, setSortCivil] = useState<'default'|'asc'|'desc'>('asc');
  const [pkgModalOpen, setPkgModalOpen] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPackages();
        setDbEvents(data.filter(p => (p as any).active !== false && (((p.category || '').toLowerCase().includes('civil')) || p.id.startsWith('civil'))));
      } catch {
        setDbEvents([]);
      }
    })();
  }, []);

  const civilPackages = (dbEvents || []).map(p => ({
    id: p.id,
    title: p.title,
    price: formatPrice(Number(p.price)),
    duration: p.duration,
    description: p.description,
    features: p.features || [],
    image: p.image_url,
    __db: p,
  }));

  const openAddModal = (pkg: any) => {
    setSelectedPkg(pkg);
    setPkgModalOpen(true);
  };

  const handleAddToCart = async (pkg: any, priceNumber?: number) => {
    const cartItem = {
      id: pkg.id,
      type: 'events' as const,
      name: pkg.title,
      price: formatPrice(priceNumber != null ? priceNumber : (pkg.__db?.price != null ? Number(pkg.__db.price) : pkg.price)),
      duration: pkg.duration,
      image: pkg.image
    };
    addToCart(cartItem);
  };

  return (
    <>
      <section className="pt-32 pb-12 bg-primary text-white">
        <div className="container-custom">
          <h1 className="section-title text-4xl md:text-5xl mb-4 text-white">Cas. Civil</h1>
          <p className="text-white/80 max-w-2xl">Cobertura especializada para cerimônias civis em cartório.</p>
        </div>
      </section>

      <section className="py-12">
        <div className="container-custom">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="section-title mb-0">Pacotes</h2>
            <div className="ml-auto">
              <label className="text-sm mr-2">Ordenar:</label>
              <select value={sortCivil} onChange={e=>setSortCivil(e.target.value as any)} className="border px-2 py-1 text-sm">
                <option value="default">Por defecto</option>
                <option value="asc">Preço: menor a maior</option>
                <option value="desc">Preço: maior a menor</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[...civilPackages]
              .sort((a:any,b:any)=>{
                if (sortCivil==='default') return 0;
                const pa = parsePrice(a.price);
                const pb = parsePrice(b.price);
                return sortCivil==='asc' ? pa - pb : pb - pa;
              })
              .map((pkg:any) => (
              <div key={pkg.id} className="card flex flex-col h-full relative max-h-screen lg:max-h-[85vh] overflow-x-hidden min-h-0">
                <div className="h-48 md:h-56 overflow-hidden mb-4 relative">
                  <img loading="lazy" src={pkg.image} alt={pkg.title} className="w-full h-full object-cover" />
                </div>
                <h3 className="text-lg md:text-xl font-playfair font-medium mb-2">{pkg.title}</h3>
                <p className="text-gray-600 text-sm md:text-base mb-2 break-words">{pkg.description}</p>
                <div className="flex items-center space-x-2 mb-4">
                  <span className="text-xl md:text-2xl font-playfair text-primary">{pkg.price}</span>
                  <span className="text-gray-500 text-sm">/{pkg.duration}</span>
                </div>
                <ul className="mb-6 flex-grow overflow-visible md:overflow-auto">
                  {pkg.features.map((feature: string, i: number) => (
                    <li key={i} className="flex items-start mb-2">
                      <span className="text-secondary mt-1 mr-2">›</span>
                      <span className="text-xs md:text-sm text-gray-700 break-words">{feature}</span>
                    </li>
                  ))}
                </ul>
                <button onClick={() => openAddModal(pkg)} className="btn-primary mt-auto" style={{ minHeight: '48px', minWidth: '48px' }}>
                  Adicionar ao carrinho
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <AddPackageModal
        isOpen={pkgModalOpen}
        onClose={() => setPkgModalOpen(false)}
        pkg={selectedPkg ? {
          id: selectedPkg.id,
          title: selectedPkg.title,
          description: selectedPkg.description,
          image: selectedPkg.image,
          priceNumber: selectedPkg.__db && selectedPkg.__db.price != null ? Number(selectedPkg.__db.price) : (Number.isFinite(Number(selectedPkg.price)) ? Number(selectedPkg.price) : parsePrice(selectedPkg.price)),
          type: 'events'
        } : null}
        onAdd={({ id, name, priceNumber, image }) => {
          const pkg = selectedPkg;
          if (!pkg) return;
          handleAddToCart(pkg, priceNumber);
        }}
      />
    </>
  );
};

export default CivilWeddingPage;
