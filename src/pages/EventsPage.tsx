import { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebaseClient';
import { eventPackages, eventGalleryImages } from '../data/eventsData';
import { fetchPackages, DBPackage } from '../utils/packagesService';
import { fetchCoupons, DBCoupon, bestCouponForItem } from '../utils/couponsService';
import { ChevronRight, Eye } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { formatPrice, parsePrice } from '../utils/format';
import PackageEditorModal from '../components/admin/PackageEditorModal';
import AddPackageModal from '../components/store/AddPackageModal';

const EventsPage = () => {
  const { addToCart } = useCart();
  const { user } = useAuth();
  const [filter, setFilter] = useState('all');
  const [dbEvents, setDbEvents] = useState<DBPackage[] | null>(null); // ← solo una vez
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<DBPackage | null>(null);
  const [storeProducts, setStoreProducts] = useState<Record<string, { name: string; image_url?: string }>>({});
  const [pkgModalOpen, setPkgModalOpen] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<any | null>(null);
  const [sortPre, setSortPre] = useState<'default'|'asc'|'desc'>('asc');
  const [sortWedding, setSortWedding] = useState<'default'|'asc'|'desc'>('asc');
  const [sortCivil, setSortCivil] = useState<'default'|'asc'|'desc'>('asc');

  const categories = [
    { id: 'all', name: 'Todos' },
    { id: 'wedding', name: 'Casamentos' },
    { id: 'civil', name: 'Civil' },
    { id: 'party', name: 'Festas' },
    { id: 'anniversary', name: 'Aniversários' },
  ];

  const filteredImages = filter === 'all' 
    ? eventGalleryImages 
    : eventGalleryImages.filter(img => img.category === filter);

  const [coupons, setCoupons] = useState<DBCoupon[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPackages();
        setDbEvents(data.filter(p => (p as any).active !== false && (
          p.type === 'events' ||
          (p.category || '').toLowerCase().includes('wedding') ||
          (p.category || '').toLowerCase().includes('prewedding') ||
          (p.category || '').toLowerCase().includes('civil') ||
          p.id.startsWith('wedding') || p.id.startsWith('prewedding') || p.id.startsWith('civil')
        ) && (!((p as any).displayPage) || (p as any).displayPage === 'events')));
      } catch (e) {
        console.warn('EventsPage: falling back to static packages');
        setDbEvents(null);
      }
    })();
    (async () => {
      try {
        const list = await fetchCoupons();
        setCoupons(list);
      } catch (e) {
        setCoupons([]);
      }
    })();
  }, []);

  const [onlyCivil, setOnlyCivil] = useState(false);
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const cat = (searchParams.get('cat') || '').toLowerCase();
    if (cat === 'civil' || cat === 'cartorio' || cat === 'cartório') {
      setFilter('civil');
      setOnlyCivil(true);
    } else {
      setOnlyCivil(false);
    }
  }, [searchParams]);

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

  // Separar pacotes por tipo sem duplicar
  const preWeddingPackages = (dbEvents && dbEvents.length > 0
    ? dbEvents.filter(p => (p as any).active !== false && ((p.category || '').startsWith('prewedding') || p.id.startsWith('prewedding'))).map(p => ({
        id: p.id,
        title: p.title,
        price: formatPrice(Number(p.price)),
        duration: p.duration,
        description: p.description,
        features: p.features || [],
        image: p.image_url,
        recommended: Boolean((p as any).recommended)
      }))
    : eventPackages.filter(pkg => pkg.id.startsWith('prewedding'))
  );

  const weddingPackages = (dbEvents && dbEvents.length > 0
    ? dbEvents.filter(p => (p as any).active !== false && ((p.category || '').startsWith('wedding') || p.id.startsWith('wedding'))).map(p => ({
        id: p.id,
        title: p.title,
        price: formatPrice(Number(p.price)),
        duration: p.duration,
        description: p.description,
        features: p.features || [],
        image: p.image_url,
        recommended: Boolean((p as any).recommended)
      }))
    : eventPackages.filter(pkg => pkg.id.startsWith('wedding'))
  );

  const civilPackages = (dbEvents && dbEvents.length > 0
    ? dbEvents.filter(p => (p as any).active !== false && (((p.category || '').startsWith('civil')) || p.id.startsWith('civil'))).map(p => ({
        id: p.id,
        title: p.title,
        price: formatPrice(Number(p.price)),
        duration: p.duration,
        description: p.description,
        features: p.features || [],
        image: p.image_url,
        recommended: Boolean((p as any).recommended)
      }))
    : []
  );

  const openAddModal = (pkg: any) => {
    const original = (dbEvents || []).find(p => p.id === pkg.id);
    const enriched = original ? { ...pkg, __db: original } : pkg;
    setSelectedPkg(enriched);
    setPkgModalOpen(true);
  };

  const handleAddToCart = async (pkg: any, priceNumber?: number) => {
    try {
      console.log('📱 EventsPage: Button clicked', pkg);
      const cartItem = {
        id: pkg.id,
        type: 'events' as const,
        name: pkg.title,
        price: formatPrice(priceNumber != null ? priceNumber : (pkg.__db?.price != null ? Number(pkg.__db.price) : pkg.price)),
        duration: pkg.duration,
        image: pkg.image
      };
      addToCart(cartItem);
      setTimeout(() => console.log('📱 EventsPage: Checking cart after add'), 100);

      const dbPkg: DBPackage | undefined = (dbEvents || [])?.find(d => d.id === pkg.id);
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
              type: (pkgData.type || 'events') as 'events' | 'portrait' | 'maternity',
              name: String(pkgData.title || 'Pacote'),
              price: 'R$ 0', // included in main package
              duration: String(pkgData.duration || ''),
              image: String(pkgData.image_url || ''),
            } as const;
            for (let i = 0; i < Number(inc.quantity||0); i++) addToCart(serviceItem as any);
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
          };
          for (let i = 0; i < Number(inc.quantity||0); i++) {
            addToCart(item);
          }
        } catch {}
      }
    } catch (error) {
      console.error('📱 EventsPage: Error adding to cart:', error);
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Error al agregar al carrito: ' + (error as any)?.message, type: 'error' } }));
    }
  };

  return (
    <>
      <section className="pt-32 pb-16 bg-primary text-white">
        <div className="container-custom">
          <div className="max-w-2xl">
            <h1 className="section-title text-4xl md:text-5xl mb-6 text-white">Casamentos e Eventos</h1>
            <p className="text-white/80 mb-6">
              Eternizamos cada momento especial do seu casamento ou evento. Nossa equipe 
              captura com sensibilidade e excelência técnica todos os detalhes, emoções e 
              momentos marcantes, transformando seu dia especial em memórias inesquecíveis.
            </p>
          </div>
        </div>
      </section>

      {/* Seção Pré-Wedding */}
      <section className="py-16">
        <div className="container-custom">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="section-title mb-0">Ensaios Pré-Wedding</h2>
            <div className="ml-auto">
              <label className="text-sm mr-2">Ordenar:</label>
              <select value={sortPre} onChange={e=>setSortPre(e.target.value as any)} className="border px-2 py-1 text-sm">
                <option value="default">Por defecto</option>
                <option value="asc">Preço: menor a maior</option>
                <option value="desc">Preço: maior a menor</option>
              </select>
            </div>
          </div>
          <p className="text-gray-700 mb-8 text-center max-w-3xl mx-auto">
            Capture a magia do seu amor antes do grande dia com nossos ensaios pré-wedding. 
            Momentos únicos e românticos que eternizam a expectativa e a alegria do casal.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[...preWeddingPackages]
              .sort((a:any,b:any)=>{
                if (sortPre==='default') return 0;
                const pa = parsePrice(a.price);
                const pb = parsePrice(b.price);
                return sortPre==='asc' ? pa - pb : pb - pa;
              })
              .map((pkg) => (
              <div key={pkg.id} className={`bg-accent/20 shadow-sm p-5 md:p-6 flex flex-col h-full relative max-h-screen lg:max-h-[85vh] overflow-x-hidden min-h-0 ${pkg.recommended ? 'ring-2 ring-secondary shadow-md' : ''}`}>
                {pkg.recommended && (<span className="absolute top-2 left-3 z-10 bg-secondary text-white text-xs px-2 py-1 rounded">Recomendado</span>)}
                {user && dbEvents && (
                  <button
                    className="absolute top-2 right-2 p-2 rounded-full bg-white shadow hover:bg-gray-50"
                    title="Editar"
                    onClick={() => {
                      const original = dbEvents.find(p => p.id === pkg.id);
                      if (original) { setEditingPkg(original); setEditorOpen(true); }
                    }}
                  >
                    <Eye size={18} className="text-gray-700" />
                  </button>
                )}
                <div className="h-48 md:h-56 overflow-hidden mb-4 relative">
                  <img loading="lazy"
                    src={pkg.image}
                    alt={pkg.title}
                    className="w-full h-full object-cover"
                  />
                  {(() => {
                    const original = dbEvents?.find(p => p.id === pkg.id);
                    const item = { id: pkg.id, type: (original?.type || 'events'), name: pkg.title, price: Number(original?.price || 0) } as any;
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
                  {pkg.features.map((feature, i) => (
                    <li key={i} className="flex items-start mb-2">
                      <ChevronRight size={16} className="text-secondary mt-1 mr-2 flex-shrink-0" />
                      <span className="text-xs md:text-sm text-gray-700 break-words">{feature}</span>
                    </li>
                  ))}
                {dbEvents && (() => {
                  const original = dbEvents.find(p => p.id === pkg.id);
                  const inc = original && Array.isArray((original as any).storeItemsIncluded) ? (original as any).storeItemsIncluded : [];
                  if (!inc.length) return null;
                  return (
                    <>
                      <li className="mt-2 text-xs text-gray-600">Productos incluidos</li>
                      {inc.map((it: any, idx: number) => {
                        const isPkg = String(it.productId).startsWith('pkg:');
                        const pkgName = isPkg && dbEvents ? (dbEvents.find(p => `pkg:${p.id}` === String(it.productId))?.title) : undefined;
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
                  );
                })()}
                </ul>
                <button
                  onClick={() => openAddModal(pkg)}
                  className="btn-primary mt-auto touch-manipulation mobile-cart-btn"
                  onTouchStart={() => {

                  }}
                  onTouchEnd={(e) => {

                    e.preventDefault();
                    openAddModal(pkg);
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

      {/* Seção Casamentos */}
      <section className="py-16 bg-accent/10">
        <div className="container-custom">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="section-title mb-0">Pacotes para Casamentos</h2>
            <div className="ml-auto">
              <label className="text-sm mr-2">Ordenar:</label>
              <select value={sortWedding} onChange={e=>setSortWedding(e.target.value as any)} className="border px-2 py-1 text-sm">
                <option value="default">Por defecto</option>
                <option value="asc">Preço: menor a maior</option>
                <option value="desc">Preço: maior a menor</option>
              </select>
            </div>
          </div>
          <p className="text-gray-700 mb-8 text-center max-w-3xl mx-auto">
            Cobertura completa para o seu dia especial. Desde a preparação até a festa, 
            capturamos cada emoção e momento único do seu casamento.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[...weddingPackages]
              .sort((a:any,b:any)=>{
                if (sortWedding==='default') return 0;
                const pa = parsePrice(a.price);
                const pb = parsePrice(b.price);
                return sortWedding==='asc' ? pa - pb : pb - pa;
              })
              .slice(0,4)
              .map((pkg, idx) => (
              <div key={pkg.id} className={`card flex flex-col h-full relative max-h-screen lg:max-h-[85vh] overflow-x-hidden min-h-0 ${pkg.recommended ? 'ring-2 ring-secondary shadow-md' : ''}`}>
                {pkg.recommended && (<span className="absolute top-2 left-3 z-10 bg-secondary text-white text-xs px-2 py-1 rounded">Recomendado</span>)}
                {user && dbEvents && (
                  <button
                    className="absolute top-2 right-2 p-2 rounded-full bg-white shadow hover:bg-gray-50"
                    title="Editar"
                    onClick={() => {
                      const original = dbEvents.find(p => p.id === pkg.id);
                      if (original) { setEditingPkg(original); setEditorOpen(true); }
                    }}
                  >
                    <Eye size={18} className="text-gray-700" />
                  </button>
                )}
                <div className="h-48 md:h-56 overflow-hidden mb-4 relative">
                  <img loading="lazy"
                    src={pkg.image}
                    alt={pkg.title}
                    className="w-full h-full object-cover"
                  />
                  {(() => {
                    const original = dbEvents?.find(p => p.id === pkg.id);
                    const item = { id: pkg.id, type: (original?.type || 'events'), name: pkg.title, price: Number(original?.price || 0) } as any;
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
                  {pkg.features.map((feature, i) => (
                    <li key={i} className="flex items-start mb-2">
                      <ChevronRight size={16} className="text-secondary mt-1 mr-2 flex-shrink-0" />
                      <span className="text-xs md:text-sm text-gray-700 break-words">{feature}</span>
                    </li>
                  ))}
                {dbEvents && (() => {
                  const original = dbEvents.find(p => p.id === pkg.id);
                  const inc = original && Array.isArray((original as any).storeItemsIncluded) ? (original as any).storeItemsIncluded : [];
                  if (!inc.length) return null;
                  return (
                    <>
                      <li className="mt-2 text-xs text-gray-600">Productos incluidos</li>
                      {inc.map((it: any, idx: number) => {
                        const isPkg = String(it.productId).startsWith('pkg:');
                        const pkgName = isPkg && dbEvents ? (dbEvents.find(p => `pkg:${p.id}` === String(it.productId))?.title) : undefined;
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
                  );
                })()}
                </ul>
                <button
                  onClick={() => openAddModal(pkg)}
                  className="btn-primary mt-auto touch-manipulation mobile-cart-btn"
                  onTouchStart={() => {

                  }}
                  onTouchEnd={(e) => {

                    e.preventDefault();
                    openAddModal(pkg);
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

      {/* Seção Casamento Civil / Cartório */}
      <section className="py-16">
        <div className="container-custom">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {civilPackages.map((pkg) => (
              <div key={pkg.id} className={`card flex flex-col h-full relative max-h-screen lg:max-h-[85vh] overflow-x-hidden min-h-0 ${pkg.recommended ? 'ring-2 ring-secondary shadow-md' : ''}`}>
                {pkg.recommended && (<span className="absolute top-2 left-3 z-10 bg-secondary text-white text-xs px-2 py-1 rounded">Recomendado</span>)}
                <div className="h-48 md:h-56 overflow-hidden mb-4 relative">
                  <img loading="lazy"
                    src={pkg.image}
                    alt={pkg.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-lg md:text-xl font-playfair font-medium mb-2">{pkg.title}</h3>
                {/* descrição oculta no card */}
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
                <button
                  onClick={() => openAddModal(pkg)}
                  className="btn-primary mt-auto touch-manipulation mobile-cart-btn"
                  style={{ minHeight: '48px', minWidth: '48px', WebkitTapHighlightColor: 'rgba(212, 175, 55, 0.3)' }}
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
          setDbEvents(prev => (prev ? prev.map(p => (p.id === updated.id ? updated : p)) : prev));
        }}
      />

      {/* Galería de Eventos */}
      <section className="py-16">
        <div className="container-custom">
          <h2 className="section-title mb-8">Galeria de Eventos</h2>
          
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
            const pkgName = isPkg && dbEvents ? (dbEvents.find(p => `pkg:${p.id}` === String(it.productId))?.title) : undefined;
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
            type: (selectedPkg.__db?.type || 'events'),
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

export default EventsPage;
