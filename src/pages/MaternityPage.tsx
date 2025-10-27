import { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebaseClient';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Eye } from 'lucide-react';
import { maternityPackages } from '../data/maternityData';
import { useCart } from '../contexts/CartContext';
import { fetchPackages, DBPackage } from '../utils/packagesService';
import { formatPrice, parsePrice } from '../utils/format';
import { useAuth } from '../contexts/AuthContext';
import PackageEditorModal from '../components/admin/PackageEditorModal';
import AddPackageModal from '../components/store/AddPackageModal';
import { fetchCoupons, DBCoupon, bestCouponForItem } from '../utils/couponsService';

const galleryImages = [
  {
    id: 1,
    src: 'https://images.pexels.com/photos/3662503/pexels-photo-3662503.jpeg?auto=compress&cs=tinysrgb&w=1600',
    alt: 'Ensaio gestante ao ar livre'
  },
  {
    id: 2,
    src: 'https://images.pexels.com/photos/3875080/pexels-photo-3875080.jpeg?auto=compress&cs=tinysrgb&w=1600',
    alt: 'Ensaio gestante em estúdio'
  },
  {
    id: 3,
    src: 'https://images.pexels.com/photos/3662850/pexels-photo-3662850.jpeg?auto=compress&cs=tinysrgb&w=1600',
    alt: 'Ensaio gestante com flores'
  },
  {
    id: 4,
    src: 'https://images.pexels.com/photos/3662544/pexels-photo-3662544.jpeg?auto=compress&cs=tinysrgb&w=1600',
    alt: 'Ensaio gestante em casa'
  },
  {
    id: 5,
    src: 'https://images.pexels.com/photos/3662479/pexels-photo-3662479.jpeg?auto=compress&cs=tinysrgb&w=1600',
    alt: 'Ensaio gestante ao pôr do sol'
  },
  {
    id: 6,
    src: 'https://images.pexels.com/photos/3662534/pexels-photo-3662534.jpeg?auto=compress&cs=tinysrgb&w=1600',
    alt: 'Ensaio gestante minimalista'
  }
];

const MaternityPage = () => {
  const { addToCart } = useCart();
  const { user } = useAuth();
  const [dbPackages, setDbPackages] = useState<DBPackage[] | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<DBPackage | null>(null);
  const [storeProducts, setStoreProducts] = useState<Record<string, { name: string; image_url?: string }>>({});
  const [coupons, setCoupons] = useState<DBCoupon[]>([]);
  const [pkgModalOpen, setPkgModalOpen] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<any | null>(null);
  const [sortBy, setSortBy] = useState<'default'|'asc'|'desc'>('asc');

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPackages();
        setDbPackages(data.filter(p => (p as any).active !== false && (p.type === 'maternity' || (p.category || '').toLowerCase().includes('maternity')) && (!((p as any).displayPage) || (p as any).displayPage === 'maternity')));
      } catch (e) {
        console.warn('MaternityPage: falling back to static packages');
        setDbPackages(null);
      }
    })();
    (async () => {
      try {
        const list = await fetchCoupons();
        setCoupons(list);
      } catch {
        setCoupons([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        const map: Record<string, { name: string; image_url?: string }> = {};
        snap.docs.forEach(d => {
          const data = d.data() as any;
          map[d.id] = { name: data.name || 'Producto', image_url: data.image_url || data.image || '' };
        });
        setStoreProducts(map);
      } catch {
        setStoreProducts({});
      }
    })();
  }, []);

  const openAddModal = (pkg: any) => {
    setSelectedPkg(pkg);
    setPkgModalOpen(true);
  };

  const handleAddToCart = async (pkg: any, priceNumber?: number) => {
    try {

      const cartItem = {
        id: pkg.id,
        type: 'maternity' as const,
        name: pkg.title,
        price: formatPrice(priceNumber != null ? priceNumber : (pkg.__db?.price != null ? Number(pkg.__db.price) : pkg.price)),
        duration: pkg.duration,
        image: pkg.image,
        features: pkg.features || []
      };

      addToCart(cartItem);

      const dbPkg: DBPackage | undefined = pkg.__db;
      const includes = (dbPkg && Array.isArray((dbPkg as any).storeItemsIncluded)) ? (dbPkg as any).storeItemsIncluded as { productId: string; quantity: number; variantName?: string }[] : [];
      for (const inc of includes) {
        if (!inc?.productId || Number(inc.quantity||0) <= 0) continue;
        try {
          const isPkg = String(inc.productId).startsWith('pkg:');
          if (isPkg) {
            const pkgId = String(inc.productId).slice(4);
            const psnap = await getDoc(doc(db, 'packages', pkgId));
            const pkgData = psnap.exists() ? (psnap.data() as any) : null;
            if (!pkgData) continue;
            const serviceItem = {
              id: `pkg:${pkgId}`,
              type: (pkgData.type || 'maternity') as 'events' | 'portrait' | 'maternity',
              name: String(pkgData.title || 'Pacote'),
              price: 'R$ 0',
              duration: String(pkgData.duration || ''),
              image: String(pkgData.image_url || ''),
              features: [] as any
            } as any;
            for (let i = 0; i < Number(inc.quantity||0); i++) addToCart(serviceItem);
            continue;
          }
          const snap = await getDoc(doc(db, 'products', inc.productId));
          const p = snap.exists() ? (snap.data() as any) : null;
          if (!p) continue;
          const variant = inc.variantName ? String(inc.variantName) : '';
          const displayName = variant ? `${p.name || 'Producto'} — ${variant}` : (p.name || 'Producto');
          const compositeId = variant ? `${inc.productId}||${variant}` : inc.productId;
          const item = {
            id: compositeId,
            type: 'store' as const,
            name: displayName,
            price: 'R$ 0',
            duration: '',
            image: p.image_url || '',
            features: [] as any
          } as any;
          for (let i = 0; i < Number(inc.quantity||0); i++) {
            addToCart(item);
          }
        } catch {}
      }

      // Verificar que se agregó

    } catch (error) {
      console.error('📱 MaternityPage: Error adding to cart:', error);
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Error al agregar al carrito: ' + ((error as any)?.message || String(error)), type: 'error' } }));
    }
  };

  return (
    <>
      <section className="pt-32 pb-16 bg-accent/30">
        <div className="container-custom">
          <div className="max-w-2xl">
            <h1 className="section-title text-4xl md:text-5xl mb-6">Fotografia de Gestantes</h1>
            <p className="text-gray-700 mb-6">
              Eternize o momento mais especial da maternidade com um ensaio fotográfico profissional.
              Nossas sessões são pensadas para valorizar a beleza única deste período, criando
              memórias emocionantes para você e sua família.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container-custom">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="section-title mb-0">Nossos Pacotes</h2>
            <div className="ml-auto">
              <label className="text-sm mr-2">Ordenar:</label>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)} className="border px-2 py-1 text-sm">
                <option value="default">Por defecto</option>
                <option value="asc">Preço: menor a maior</option>
                <option value="desc">Preço: maior a menor</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {(dbPackages && dbPackages.length > 0
              ? dbPackages.map((p) => ({
                id: p.id,
                title: p.title,
                price: formatPrice(Number(p.price)),
                duration: p.duration,
                description: p.description,
                features: p.features || [],
                image: p.image_url,
                recommended: Boolean((p as any).recommended),
                __db: p as DBPackage
              }))
              : maternityPackages
            ).filter((p: any) => (p as any)?.__db ? ((p as any).__db.active ?? true) : true)
            .sort((a: any,b: any)=>{
              if (sortBy==='default') return 0;
              const pa = parsePrice(a.__db ? a.__db.price : a.price);
              const pb = parsePrice(b.__db ? b.__db.price : b.price);
              return sortBy==='asc' ? pa - pb : pb - pa;
            })
            .map((pkg: any) => (
              <div key={pkg.id} className={`card flex flex-col h-full relative max-h-screen lg:max-h-[85vh] overflow-x-hidden min-h-0 ${pkg.__db?.recommended ? 'ring-2 ring-secondary shadow-md' : ''}`}>
                {user && pkg.__db && (
                  <button
                    className="absolute top-2 right-2 p-2 rounded-full bg-white shadow hover:bg-gray-50"
                    title="Editar"
                    onClick={() => { setEditingPkg(pkg.__db as DBPackage); setEditorOpen(true); }}
                  >
                    <Eye size={18} className="text-gray-700" />
                  </button>
                )}
                {pkg.__db?.recommended && (
                  <span className="absolute top-2 left-3 z-10 bg-secondary text-white text-xs px-2 py-1 rounded">Recomendado</span>
                )}
                <div className="h-48 md:h-56 overflow-hidden mb-4 relative">
                  <img
                    src={pkg.image}
                    alt={pkg.title}
                    className="w-full h-full object-cover"
                  />
                  {(() => {
                    const item = { id: pkg.id, type: (pkg.__db?.type || 'maternity'), name: pkg.title, price: Number(pkg.__db?.price || 0) } as any;
                    const { coupon, discount } = bestCouponForItem(coupons, item);
                    if (!coupon || discount <= 0) return null;
                    const label = coupon.discountType === 'percentage'
                      ? `-${Math.round(Number(coupon.discountValue || 0))}%`
                      : `-${formatPrice(discount)}`;
                    return (
                      <span className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-green-600 text-white shadow">{label}</span>
                    );
                  })()}
                </div>
                <h3 className="text-lg md:text-xl font-playfair font-medium mb-2">{pkg.title}</h3>
                {/* descrição oculta no card */}
                <div className="flex items-center space-x-2 mb-4">
                  <span className="text-xl md:text-2xl font-playfair text-primary">{pkg.price}</span>
                  <span className="text-gray-500 text-sm">/{pkg.duration}</span>
                </div>
                <ul className="mb-6 flex-grow overflow-visible md:overflow-auto">
                  {pkg.features.map((feature: any, i: number) => (
                    <li key={i} className="flex items-start mb-2">
                      <ChevronRight size={16} className="text-secondary mt-1 mr-2 flex-shrink-0" />
                      <span className="text-xs md:text-sm text-gray-700 break-words">{feature}</span>
                    </li>
                  ))}
                  {pkg.__db && Array.isArray((pkg.__db as any).storeItemsIncluded) && (pkg.__db as any).storeItemsIncluded.length > 0 && (
                    <>
                      <li className="mt-2 text-xs text-gray-600">Productos incluidos</li>
                      {(pkg.__db as any).storeItemsIncluded.map((it: any, idx: number) => {
                        const isPkg = String(it.productId).startsWith('pkg:');
                        const pkgName = isPkg && dbPackages ? (dbPackages.find(p => `pkg:${p.id}` === String(it.productId))?.title) : undefined;
                        const sp = !isPkg ? storeProducts[it.productId] : undefined;
                        const label = `${pkgName || sp?.name || it.productId}${it.variantName ? ` — ${it.variantName}` : ''}`;
                        return (
                          <li key={`inc-${idx}`} className="flex items-start mb-2">
                            <ChevronRight size={16} className="text-secondary mt-1 mr-2 flex-shrink-0" />
                            <span className="text-xs md:text-sm text-gray-700 break-words">{label} x{Number(it.quantity || 0)}</span>
                          </li>
                        );
                      })}
                    </>
                  )}
                </ul>
                <button
                  onClick={() => openAddModal(pkg)}
                  className="btn-primary mt-auto touch-manipulation mobile-cart-btn"
                  onTouchStart={() => {
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    handleAddToCart(pkg);
                  }}
                  style={{
                    minHeight: '48px',
                    minWidth: '48px',
                    WebkitTapHighlightColor: 'rgba(212, 175, 55, 0.3)'
                  }}
                >
                  Adicionar ao carrinho
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PackageEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        pkg={editingPkg}
        onSaved={(updated) => {
          setDbPackages(prev => (prev ? prev.map(p => (p.id === updated.id ? updated : p)) : prev));
        }}
      />

      <section className="py-16 bg-accent/10">
        <div className="container-custom">
          <h2 className="section-title mb-12">Galeria de Fotos</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {galleryImages.map((image) => (
              <div key={image.id} className="gallery-item">
                <img
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
          </div>
        </div>
      </section>
    <AddPackageModal
      isOpen={pkgModalOpen}
      onClose={() => setPkgModalOpen(false)}
      pkg={selectedPkg ? (() => {
        const dbPkg: DBPackage | undefined = selectedPkg.__db as any;
        const includes = (dbPkg && Array.isArray((dbPkg as any).storeItemsIncluded)) ? (dbPkg as any).storeItemsIncluded as { productId: string; quantity: number; variantName?: string }[] : [];
        const includesLabels = includes.map(it => {
          const isPkg = String(it.productId).startsWith('pkg:');
          const pkgName = isPkg && dbPackages ? (dbPackages.find(p => `pkg:${p.id}` === String(it.productId))?.title) : undefined;
          const sp = !isPkg ? storeProducts[it.productId] : undefined;
          const label = `${pkgName || sp?.name || it.productId}${it.variantName ? ` — ${it.variantName}` : ''}`;
          return { label, quantity: Number(it.quantity || 0) };
        });
        return {
          id: selectedPkg.id,
          title: selectedPkg.title,
          description: selectedPkg.description,
          image: selectedPkg.image,
          priceNumber: selectedPkg.__db && selectedPkg.__db.price != null ? Number(selectedPkg.__db.price) : (Number.isFinite(Number(selectedPkg.price)) ? Number(selectedPkg.price) : parsePrice(selectedPkg.price)),
          type: (selectedPkg.__db?.type || 'maternity'),
          features: Array.isArray(selectedPkg.features) ? selectedPkg.features : [],
          includes: includesLabels,
        };
      })() : null}
      onAdd={({ id, name, priceNumber, image }) => {
        const pkg = selectedPkg;
        if (!pkg) return;
        handleAddToCart(pkg, priceNumber);
      }}
    />
    </>
  );
};

export default MaternityPage;
