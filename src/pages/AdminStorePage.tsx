import { useEffect, useState } from 'react';
import AdminStoreDashboard from '../components/store/AdminStoreDashboard';
import OrdersManagement from '../components/store/OrdersManagement';
import ContractsManagement from '../components/store/ContractsManagement';
import PhotoPackagesManagement from '../components/store/PhotoPackagesManagement';
import StoreSettings from '../components/store/StoreSettings';
import CouponsManagement from '../components/store/CouponsManagement';
import InvestmentsManagement from '../components/store/InvestmentsManagement';
import ProductEditorModal from '../components/store/ProductEditorModal';
import DressEditorModal from '../components/store/DressEditorModal';
import { db, storage } from '../utils/firebaseClient';
import { collection, getDocs, deleteDoc, doc, updateDoc, orderBy, query, addDoc } from 'firebase/firestore';
import { Trash2 } from 'lucide-react';
import AdminCalendar from '../components/store/AdminCalendar';
import { useCart } from '../contexts/CartContext';

const AdminStorePage: React.FC = () => {
  const { setIsCartOpen } = useCart();

  // Close cart when entering admin page
  useEffect(() => {
    setIsCartOpen(false);
  }, [setIsCartOpen]);

  const [adminView, setAdminView] = useState<'dashboard' | 'products' | 'orders' | 'contracts' | 'packages' | 'coupons' | 'settings' | 'calendar' | 'investments'>(() => {
    try { return (localStorage.getItem('admin_view') as any) || 'dashboard'; } catch { return 'dashboard'; }
  });
  const [adminFullscreen, setAdminFullscreen] = useState<boolean>(() => {
    try { return localStorage.getItem('admin_fullscreen') === '1'; } catch { return false; }
  });
  const [adminDark, setAdminDark] = useState<boolean>(() => {
    try { return localStorage.getItem('admin_dark') === '1'; } catch { return false; }
  });
  const [openContractId, setOpenContractId] = useState<string | null>(null);

  // products state copied from StorePage
  const [products, setProducts] = useState<any[]>([]);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDress, setEditingDress] = useState<any | null>(null);
  const [dressEditorOpen, setDressEditorOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [productFilter, setProductFilter] = useState<'products' | 'dresses'>('products');
  const showNotice = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotice({ text, type });
    setTimeout(() => setNotice(null), 2500);
  };
  const isDressCategory = (cat?: string) => {
    const c = String(cat || '').toLowerCase();
    return c.includes('vestid') || c.includes('dress');
  };
  const getFiltered = () => {
    if (productFilter === 'dresses') return products.filter(p => isDressCategory(p.category));
    return products.filter(p => !isDressCategory(p.category));
  };

  const seedDefaultDresses = async () => {
    try {
      const defaults = [
        { name: 'Vestido Azul Royal', color: 'Azul', image_url: 'https://images.pexels.com/photos/291759/pexels-photo-291759.jpeg?auto=compress&cs=tinysrgb&w=1600' },
        { name: 'Vestido Branco', color: 'Branco', image_url: 'https://images.pexels.com/photos/1631181/pexels-photo-1631181.jpeg?auto=compress&cs=tinysrgb&w=1600' },
        { name: 'Vestido Rosa', color: 'Rosa', image_url: 'https://images.pexels.com/photos/1755385/pexels-photo-1755385.jpeg?auto=compress&cs=tinysrgb&w=1600' },
        { name: 'Vestido Verde', color: 'Verde', image_url: 'https://images.pexels.com/photos/1375736/pexels-photo-1375736.jpeg?auto=compress&cs=tinysrgb&w=1600' },
        { name: 'Vestido Vermelho', color: 'Vermelho', image_url: 'https://images.pexels.com/photos/1755428/pexels-photo-1755428.jpeg?auto=compress&cs=tinysrgb&w=1600' },
        { name: 'Vestido Dourado', color: 'Dourado', image_url: 'https://images.pexels.com/photos/1755433/pexels-photo-1755433.jpeg?auto=compress&cs=tinysrgb&w=1600' },
        { name: 'Vestido Preto', color: 'Preto', image_url: 'https://images.pexels.com/photos/1755432/pexels-photo-1755432.jpeg?auto=compress&cs=tinysrgb&w=1600' },
        { name: 'Vestido Prata', color: 'Prata', image_url: 'https://images.pexels.com/photos/1755429/pexels-photo-1755429.jpeg?auto=compress&cs=tinysrgb&w=1600' },
      ];
      const snap = await getDocs(collection(db, 'products'));
      const existing = new Set(snap.docs.map(d => String((d.data() as any).name || '').trim().toLowerCase()));
      let created = 0;
      for (const d of defaults) {
        if (existing.has(d.name.trim().toLowerCase())) continue;
        await addDoc(collection(db, 'products'), {
          name: d.name,
          image_url: d.image_url,
          category: 'vestidos',
          tags: d.color ? [d.color] : [],
          price: 0,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        created++;
      }
      showNotice(created > 0 ? `Se importaron ${created} vestidos` : 'Nada para importar', 'success');
      fetchProducts();
    } catch (e) {
      console.error('seedDefaultDresses error', e);
      showNotice('Error al importar vestidos', 'error');
    }
  };

  const fetchProducts = async () => {
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) { setProducts([]); return; }
      const col = collection(db, 'products');
      let q: any = col;
      try { q = query(col, orderBy('created_at', 'desc')); } catch (_) { q = col; }
      const snap = await getDocs(q);
      const raw = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      // unique by name/price/category
      const seen = new Set<string>();
      const unique: any[] = [];
      for (const p of raw) {
        const key = `${String(p.name||'').trim().toLowerCase()}|${Number(p.price)||0}|${String(p.category||'').trim().toLowerCase()}`;
        if (!seen.has(key)) { seen.add(key); unique.push(p); }
      }
      setProducts(unique);
    } catch (error) {
      console.warn('Não foi possível carregar produtos no momento.');
      setProducts([]);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail || {};
      if (detail && detail.message) showNotice(detail.message, detail.type || 'success');
      if (detail && detail.refresh) fetchProducts();
    };
    window.addEventListener('adminToast', handler as EventListener);
    return () => window.removeEventListener('adminToast', handler as EventListener);
  }, []);

  useEffect(() => {
    const openHandler = (e: any) => {
      const id = String(e?.detail?.id || '');
      if (!id) return;
      setAdminView('contracts');
      setOpenContractId(id);
    };
    window.addEventListener('adminOpenContract', openHandler as EventListener);
    return () => window.removeEventListener('adminOpenContract', openHandler as EventListener);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('admin_view', adminView); } catch {}
  }, [adminView]);

  useEffect(() => {
    try { adminFullscreen ? localStorage.setItem('admin_fullscreen', '1') : localStorage.removeItem('admin_fullscreen'); } catch {}
  }, [adminFullscreen]);
  useEffect(() => {
    try { adminDark ? localStorage.setItem('admin_dark', '1') : localStorage.removeItem('admin_dark'); } catch {}
  }, [adminDark]);

  const handleDeactivate = async (productId: string, activate: boolean) => {
    try {
      await updateDoc(doc(db, 'products', productId), { active: activate, updated_at: new Date().toISOString() });
      await fetchProducts();
      showNotice('Estado actualizado', 'success');
    } catch (e) {
      console.error('Erro ao atualizar status do produto:', e);
      showNotice('No se pudo actualizar el estado', 'error');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await deleteDoc(doc(db, 'products', productId));
      showNotice('Producto eliminado', 'success');
      fetchProducts();
    } catch (error) {
      console.error('Erro ao excluir produto:', error);
      setNotice({ text: 'No se pudo eliminar el producto', type: 'error' });
      setTimeout(() => setNotice(null), 3000);
    }
  };

  const safeImageSrc = (u?: string) => {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('gs://')) {
      try {
        const bucket = ((storage as any)?.app?.options?.storageBucket) || '';
        const withoutScheme = u.slice(5);
        const firstSlash = withoutScheme.indexOf('/');
        const path = firstSlash >= 0 ? withoutScheme.slice(firstSlash + 1) : withoutScheme;
        const encoded = encodeURIComponent(path);
        if (bucket) return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media`;
      } catch {}
    }
    return u;
  };

  return (
    <section className={`overflow-hidden ${adminView === 'calendar' ? 'h-screen w-screen' : 'md:pt-4 p-0 md:pb-0 h-screen md:h-auto'} ${adminDark ? 'admin-dark' : ''}`}>
      {/* Calendar Full Screen View */}
      {adminView === 'calendar' && !adminFullscreen && (
        <div className="w-full h-full p-[2%] flex flex-col overflow-hidden">
          <div className="bg-white rounded-lg shadow-lg flex flex-col h-full overflow-hidden">
            {/* Calendar Header Bar */}
            <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h1 className="text-xl font-semibold text-black">Calendario</h1>
              <div className="flex items-center gap-2">
                <button onClick={() => setAdminDark(v => !v)} className="px-3 py-1 rounded-none border border-black text-black hover:bg-black hover:text-white text-sm transition-colors">{adminDark ? 'Modo claro' : 'Modo oscuro'}</button>
                <button onClick={() => setAdminView('dashboard')} className="px-3 py-1 rounded-none border border-black text-black hover:bg-black hover:text-white text-sm transition-colors">Volver</button>
              </div>
            </div>
            {/* Admin Tabs */}
          <div className="hidden md:flex flex-wrap items-center gap-1 md:gap-2 admin-tabs px-4 py-2 border-b border-gray-200">
            <button onClick={() => setAdminView('dashboard')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='dashboard' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Panel</button>
            <button onClick={() => setAdminView('products')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='products' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Productos</button>
            <button onClick={() => setAdminView('orders')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='orders' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Órdenes</button>
            <button onClick={() => setAdminView('contracts')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='contracts' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Contratos</button>
            <button onClick={() => setAdminView('calendar')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='calendar' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Calendario</button>
            <button onClick={() => setAdminView('packages')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='packages' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Paquetes</button>
            <button onClick={() => setAdminView('coupons')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='coupons' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Cupones</button>
            <button onClick={() => setAdminView('settings')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='settings' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Ajustes</button>
            <button onClick={() => setAdminView('investments')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='investments' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Inversiones</button>
            <div className="ml-auto flex items-center gap-2" />
          </div>

          {/* Calendar Component */}
          <div className="flex-1 overflow-hidden">
            <AdminCalendar darkMode={adminDark} />
          </div>
          </div>
        </div>
      )}

      {/* Mobile Dropdown */}
      {adminView !== 'calendar' && (
        <div className="md:hidden px-2 md:px-4 lg:hidden">
          <select
            value={adminView}
            onChange={(e) => setAdminView(e.target.value as any)}
            className="w-full px-3 py-2 text-sm border-2 border-black rounded-none bg-black text-white cursor-pointer"
          >
            <option value="dashboard">Panel</option>
            <option value="products">Productos</option>
            <option value="orders">Órdenes</option>
            <option value="contracts">Contratos</option>
            <option value="calendar">Calendario</option>
            <option value="packages">Paquetes</option>
            <option value="coupons">Cupones</option>
            <option value="settings">Ajustes</option>
            <option value="investments">Inversiones</option>
          </select>
        </div>
      )}

      <div className={`${adminView === 'calendar' ? 'hidden' : 'container-custom px-2 md:px-4 h-full flex flex-col'}`}>
        <div className="mb-2 space-y-2">
          {/* Desktop Tabs */}
          <div className="hidden md:flex flex-wrap items-center gap-1 md:gap-2 admin-tabs">
            <button onClick={() => setAdminView('dashboard')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='dashboard' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Panel</button>
            <button onClick={() => setAdminView('products')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='products' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Productos</button>
            <button onClick={() => setAdminView('orders')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='orders' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Órdenes</button>
            <button onClick={() => setAdminView('contracts')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='contracts' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Contratos</button>
            <button onClick={() => setAdminView('calendar')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='calendar' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Calendario</button>
            <button onClick={() => setAdminView('packages')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='packages' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Paquetes</button>
            <button onClick={() => setAdminView('coupons')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='coupons' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Cupones</button>
            <button onClick={() => setAdminView('settings')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='settings' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Ajustes</button>
            <button onClick={() => setAdminView('investments')} className={`px-4 py-2 rounded-none border-2 text-sm ${adminView==='investments' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Inversiones</button>
            <div className="ml-auto flex items-center gap-2" />
          </div>

          {adminView === 'dashboard' && (
            <AdminStoreDashboard onNavigate={(v) => setAdminView(v)} />
          )}

          {adminView === 'products' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="section-title">Gestión de Productos</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => setProductFilter('products')} className={`px-3 py-2 rounded-none border ${productFilter==='products' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Productos</button>
                  <button onClick={() => setProductFilter('dresses')} className={`px-3 py-2 rounded-none border ${productFilter==='dresses' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Vestidos</button>
                  {productFilter==='dresses' && (
                    <button onClick={seedDefaultDresses} className="px-3 py-2 rounded-none border border-black text-black hover:bg-black hover:text-white">Importar vestidos base</button>
                  )}
                  <button onClick={() => { if (productFilter==='dresses') { setEditingDress(null); setDressEditorOpen(true); } else { setEditingProduct(null); setEditorOpen(true); } }} className="px-4 py-2 rounded-none border-2 border-black text-black hover:bg-black hover:text-white transition-colors">+ Agregar {productFilter==='dresses' ? 'Vestido' : 'Producto'}</button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {getFiltered().map(product => (
                  <div key={product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden h-full flex flex-col">
                    <div className={`relative ${isDressCategory(product.category) ? 'aspect-[9/16]' : ''} w-full`}>
                      <img loading="lazy" src={safeImageSrc(product.image_url)} alt={product.name} className={`${isDressCategory(product.category) ? 'absolute inset-0 w-full h-full' : 'w-full h-44'} object-cover`} />
                      {(product as any).active === false && (
                        <span className="absolute top-2 left-2 text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">inactivo</span>
                      )}
                    </div>
                    <div className="p-4 flex flex-col h-full">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold">{product.name}</h3>
                        {isDressCategory(product.category) ? (
                          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">Color: {Array.isArray((product as any).tags) && (product as any).tags.length ? String((product as any).tags[0]) : '-'}</span>
                        ) : (
                          <span className="text-primary font-bold">${Number(product.price).toFixed(0)}</span>
                        )}
                      </div>
                      <p className="text-gray-600 text-sm mt-1 line-clamp-2">{product.description}</p>
                      <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                        <span className="px-2 py-1 bg-gray-100 rounded">{product.category || 'General'}</span>
                      </div>
                      <div className="mt-4 flex items-center gap-2 mt-auto">
                        <button onClick={() => { if (isDressCategory(product.category)) { setEditingDress(product); setDressEditorOpen(true); } else { setEditingProduct(product); setEditorOpen(true); } }} className="flex-1 border-2 border-black text-black px-3 py-2 rounded-none hover:bg-black hover:text-white">Editar</button>
                        <button onClick={() => handleDeactivate(product.id, (product as any).active === false ? true : false)} className={`flex-1 border-2 border-black px-3 py-2 rounded-none ${(product as any).active === false ? 'bg-white text-black hover:bg-black hover:text-white' : 'bg-black text-white hover:opacity-90'}`}>{(product as any).active === false ? 'Activar' : 'Desactivar'}</button>
                        <button onClick={() => handleDeleteProduct(product.id)} className="border-2 border-black text-black px-3 py-2 rounded hover:bg-black hover:text-white"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {productFilter==='dresses' ? (
                <DressEditorModal open={dressEditorOpen} onClose={() => setDressEditorOpen(false)} dress={editingDress as any} onSaved={fetchProducts} />
              ) : (
                <ProductEditorModal open={editorOpen} onClose={() => setEditorOpen(false)} product={editingProduct as any} onSaved={fetchProducts} />
              )}
            </div>
          )}

          {adminView === 'orders' && <OrdersManagement />}
          {adminView === 'contracts' && <ContractsManagement openContractId={openContractId} onOpened={() => setOpenContractId(null)} />}
          {adminView === 'packages' && <PhotoPackagesManagement />}
          {adminView === 'coupons' && <CouponsManagement />}
          {adminView === 'investments' && <InvestmentsManagement />}
          {adminView === 'settings' && <StoreSettings />}
        </div>

        {notice && (
          <div className={`mb-4 p-3 rounded border text-sm ${notice.type==='success' ? 'border-green-200 bg-green-50 text-green-700' : notice.type==='error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
            {notice.text}
          </div>
        )}

        {adminFullscreen && (
          <div className="fixed inset-0 z-50 bg-white overflow-auto p-6">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-2 mb-3 admin-tabs">
                <button onClick={() => setAdminView('dashboard')} className={`px-4 py-2 rounded-none border-2 ${adminView==='dashboard' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Panel</button>
                <button onClick={() => setAdminView('products')} className={`px-4 py-2 rounded-none border-2 ${adminView==='products' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Productos</button>
                <button onClick={() => setAdminView('orders')} className={`px-4 py-2 rounded-none border-2 ${adminView==='orders' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Órdenes</button>
                <button onClick={() => setAdminView('contracts')} className={`px-4 py-2 rounded-none border-2 ${adminView==='contracts' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Contratos</button>
            <button onClick={() => setAdminView('calendar')} className={`px-4 py-2 rounded-none border-2 ${adminView==='calendar' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Calendario</button>
            <button onClick={() => setAdminView('packages')} className={`px-4 py-2 rounded-none border-2 ${adminView==='packages' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Paquetes</button>
            <button onClick={() => setAdminView('coupons')} className={`px-4 py-2 rounded-none border-2 ${adminView==='coupons' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Cupones</button>
            <button onClick={() => setAdminView('settings')} className={`px-4 py-2 rounded-none border-2 ${adminView==='settings' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Ajustes</button>
            <button onClick={() => setAdminView('investments')} className={`px-4 py-2 rounded-none border-2 ${adminView==='investments' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Inversiones</button>
            <div className="ml-auto">
                  <button onClick={() => setAdminFullscreen(false)} className="px-4 py-2 rounded-none border-2 border-black text-black hover:bg-black hover:text-white">Cerrar pantalla completa</button>
                </div>
              </div>

              {adminView === 'dashboard' && <AdminStoreDashboard onNavigate={v => setAdminView(v)} />}
              {adminView === 'products' && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                <h2 className="section-title">Gestión de Productos</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => setProductFilter('products')} className={`px-3 py-2 rounded-none border ${productFilter==='products' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Productos</button>
                  <button onClick={() => setProductFilter('dresses')} className={`px-3 py-2 rounded-none border ${productFilter==='dresses' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Vestidos</button>
                  {productFilter==='dresses' && (
                    <button onClick={seedDefaultDresses} className="px-3 py-2 rounded-none border border-black text-black hover:bg-black hover:text-white">Importar vestidos base</button>
                  )}
                  <button onClick={() => { if (productFilter==='dresses') { setEditingDress(null); setDressEditorOpen(true); } else { setEditingProduct(null); setEditorOpen(true); } }} className="px-4 py-2 rounded-none border-2 border-black text-black hover:bg-black hover:text-white transition-colors">+ Agregar {productFilter==='dresses' ? 'Vestido' : 'Producto'}</button>
                </div>
              </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {getFiltered().map(product => (
                      <div key={product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden h-full flex flex-col">
                        <div className={`relative ${isDressCategory(product.category) ? 'aspect-[9/16]' : ''} w-full`}>
                      <img loading="lazy" src={safeImageSrc(product.image_url)} alt={product.name} className={`${isDressCategory(product.category) ? 'absolute inset-0 w-full h-full' : 'w-full h-44'} object-cover`} />
                      {(product as any).active === false && (
                        <span className="absolute top-2 left-2 text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">inactivo</span>
                      )}
                    </div>
                        <div className="p-4 flex flex-col h-full">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="font-semibold">{product.name}</h3>
                            {isDressCategory(product.category) ? (
                          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">Color: {Array.isArray((product as any).tags) && (product as any).tags.length ? String((product as any).tags[0]) : '-'}</span>
                        ) : (
                          <span className="text-primary font-bold">${Number(product.price).toFixed(0)}</span>
                        )}
                          </div>
                          <p className="text-gray-600 text-sm mt-1 line-clamp-2">{product.description}</p>
                          <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                            <span className="px-2 py-1 bg-gray-100 rounded">{product.category || 'General'}</span>
                          </div>
                          <div className="mt-4 flex items-center gap-2 mt-auto">
                            <button onClick={() => { if (isDressCategory(product.category)) { setEditingDress(product); setDressEditorOpen(true); } else { setEditingProduct(product); setEditorOpen(true); } }} className="flex-1 border-2 border-black text-black px-3 py-2 rounded-none hover:bg-black hover:text-white">Editar</button>
                            <button onClick={() => handleDeactivate(product.id, (product as any).active === false ? true : false)} className={`flex-1 border-2 border-black px-3 py-2 rounded-none ${(product as any).active === false ? 'bg-white text-black hover:bg-black hover:text-white' : 'bg-black text-white hover:opacity-90'}`}>{(product as any).active === false ? 'Activar' : 'Desactivar'}</button>
                            <button onClick={() => handleDeleteProduct(product.id)} className="border-2 border-black text-black px-3 py-2 rounded hover:bg-black hover:text-white"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {productFilter==='dresses' ? (
                    <DressEditorModal open={dressEditorOpen} onClose={() => setDressEditorOpen(false)} dress={editingDress as any} onSaved={fetchProducts} />
                  ) : (
                    <ProductEditorModal open={editorOpen} onClose={() => setEditorOpen(false)} product={editingProduct as any} onSaved={fetchProducts} />
                  )}
                </div>
              )}

              {adminView === 'orders' && <OrdersManagement />}
              {adminView === 'contracts' && <ContractsManagement openContractId={openContractId} onOpened={() => setOpenContractId(null)} />}
              {adminView === 'packages' && <PhotoPackagesManagement />}
           {adminView === 'coupons' && <CouponsManagement />}
           {adminView === 'investments' && <InvestmentsManagement />}
           {adminView === 'settings' && <StoreSettings />}
        </div>
          </div>
        )}

      </div>
      <style>{`
        /* Compact admin tabs */
        .admin-tabs button { padding: 0.25rem 0.5rem; border-width: 1px; font-size: 0.875rem; line-height: 1.2; }
        .admin-tabs { gap: 0.25rem !important; }

        .admin-dark { background-color: #0b0b0b; color: #e5e5e5; }
        .admin-dark .bg-white { background-color: #121212 !important; color: #e5e5e5; }
        .admin-dark .text-gray-600 { color: #c7c7c7 !important; }
        .admin-dark .text-gray-700 { color: #d1d1d1 !important; }
        .admin-dark .text-gray-500 { color: #a7a7a7 !important; }
        .admin-dark .border-gray-200 { border-color: #2a2a2a !important; }
        .admin-dark .bg-gray-50 { background-color: #111111 !important; }
        .admin-dark .bg-gray-100 { background-color: #1a1a1a !important; }
        .admin-dark input, .admin-dark select, .admin-dark textarea { background-color: #0e0e0e; color: #e5e5e5; border-color: #303030; }
        /* Buttons: active (selected) => white bg, black text */
        .admin-dark .bg-black { background-color: #000000 !important; }
        .admin-dark .text-white { color: #ffffff !important; }
        /* Buttons: inactive => white border, no bg, white text */
        .admin-dark .border-black { border-color: #ffffff !important; }
        .admin-dark .text-black { color: #ffffff !important; }
        /* Hover behavior: gray bg with black text */
        .admin-dark .hover\:bg-black:hover,
        .admin-dark .hover\:bg-white:hover,
        .admin-dark .hover\:bg-gray-50:hover { background-color: #000000 !important; color: #ffffff !important; border-color: #ffffff !important; }
        .admin-dark .hover\:text-white:hover { color: #ffffff !important; }
      `}</style>
    </section>
  );
};

export default AdminStorePage;
