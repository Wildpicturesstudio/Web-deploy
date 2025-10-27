import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { db } from '../../utils/firebaseClient';
import { collection, getCountFromServer, getDocs, limit, orderBy, query, addDoc, updateDoc, doc } from 'firebase/firestore';
import { DollarSign, Package, Users, ClipboardList, ArrowUpRight } from 'lucide-react';
const ChartPerformance = lazy(() => import('./ChartPerformance'));
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';

interface OrderLineItem {
  productId?: string;
  product_id?: string;
  name?: string;
  price?: number;
  qty?: number;
  quantity?: number;
  total?: number;
}

interface OrderItem {
  id: string;
  customer_name?: string;
  total?: number;
  created_at?: string;
  status?: 'pendiente' | 'procesando' | 'completado' | string;
  items?: OrderLineItem[];
}

interface ProductLite { id: string; name: string }

interface AdminProps { onNavigate?: (view: 'dashboard' | 'products' | 'orders' | 'contracts' | 'calendar') => void }
const AdminStoreDashboard: React.FC<AdminProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState({ products: 0, orders: 0, income: 0, customers: 0 });
  const [recentOrders, setRecentOrders] = useState<OrderItem[]>([]);
  const [allOrders, setAllOrders] = useState<OrderItem[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [investmentInstallments, setInvestmentInstallments] = useState<any[]>([]);
  const [period, setPeriod] = useState<{ type: 'all' | 'year' | 'month' | 'custom'; start?: string; end?: string }>({ type: 'all' });
  const [metric, setMetric] = useState<'revenue' | 'contracts'>('revenue');
  const { flags, setPageEnabled } = useFeatureFlags();

  useEffect(() => {
    (async () => {
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setStats({ products: 0, orders: 0, income: 0, customers: 0 });
          setRecentOrders([]);
          setAllOrders([]);
          setProducts([]);
          return;
        }
        // counts
        const productsSnap = await getCountFromServer(collection(db, 'products'));
        const ordersSnap = await getCountFromServer(collection(db, 'orders'));
        const customersSnap = await getCountFromServer(collection(db, 'customers'));
        setStats(s => ({
          ...s,
          products: productsSnap.data().count || 0,
          orders: ordersSnap.data().count || 0,
          customers: customersSnap.data().count || 0,
        }));
      } catch (_) {}

      // seed demo orders if empty
      try {
        const emptyCheck = await getDocs(collection(db, 'orders'));
        if (emptyCheck.empty && !localStorage.getItem('seeded_orders')) {
          const base = Date.now();
          const demo = [
            { customer_name: 'gabriel', total: 44, status: 'completado', created_at: new Date(base - 4*24*60*60*1000).toISOString() },
            { customer_name: 'Upgradix', total: 68, status: 'procesando', created_at: new Date(base - 3*24*60*60*1000).toISOString() },
            { customer_name: 'Pepe', total: 80, status: 'pendiente', created_at: new Date(base - 2*24*60*60*1000).toISOString() },
            { customer_name: 'Osvaldo', total: 340, status: 'completado', created_at: new Date(base - 1*24*60*60*1000).toISOString() },
            { customer_name: 'Laura', total: 100, status: 'pendiente', created_at: new Date(base).toISOString() },
          ];
          await Promise.all(demo.map(d => addDoc(collection(db, 'orders'), d)));
          localStorage.setItem('seeded_orders', '1');
        }
      } catch (_) {}

      // recent orders + income
      try {
        let q: any = query(collection(db, 'orders'), orderBy('created_at', 'desc'), limit(5));
        const snap = await getDocs(q);
        const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as OrderItem[];
        setRecentOrders(items);
      } catch {
        try {
          const snap = await getDocs(collection(db, 'orders'));
          const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as OrderItem[];
          const items = all.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 5);
          setRecentOrders(items);
        } catch {
          setRecentOrders([]);
        }
      }

      // all orders for performance + income
      let all: OrderItem[] = [];
      try {
        const snap = await getDocs(collection(db, 'orders'));
        all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as OrderItem[];
        setAllOrders(all);
        setStats(s => ({ ...s, income: all.reduce((sum, o) => sum + Number(o.total || 0), 0) }));
      } catch {
        all = [];
        setAllOrders([]);
      }

      // fetch contracts to include services in performance chart
      try {
        const cs = await getDocs(collection(db, 'contracts'));
        const list = cs.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setContracts(list);
      } catch {
        setContracts([]);
      }

      // load products for filter
      let psList: ProductLite[] = [];
      try {
        const ps = await getDocs(collection(db, 'products'));
        psList = ps.docs.map(d => ({ id: d.id, name: (d.data() as any).name || 'Producto' }));
        setProducts(psList);
      } catch {
        psList = [];
        setProducts([]);
      }

      // fetch investment installments for chart
      try {
        const instSnap = await getDocs(collection(db, 'investment_installments'));
        const inst = instSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setInvestmentInstallments(inst);
      } catch {
        setInvestmentInstallments([]);
      }

      // assign random product to orders missing items
      try {
        if (typeof navigator === 'undefined' || navigator.onLine) {
          const targets = all.filter(o => !Array.isArray(o.items) || (o.items as any[]).length === 0);
          if (psList.length && targets.length) {
            await Promise.all(targets.map(o => {
              const pick = psList[Math.floor(Math.random() * psList.length)];
              const amount = Number(o.total || 0) || 0;
              const item = { product_id: pick.id, name: pick.name, price: amount, qty: 1, total: amount } as any;
              return updateDoc(doc(db, 'orders', o.id), { items: [item] });
            }));
            const snap2 = await getDocs(collection(db, 'orders'));
            const all2 = snap2.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as OrderItem[];
            setAllOrders(all2);
          }
        }
      } catch {
        // ignore assignment failures
      }
    })();
  }, []);

  useEffect(() => {
    const handler = () => {
      (async () => {
        try {
          const cs = await getDocs(collection(db, 'contracts'));
          const list = cs.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          setContracts(list);
        } catch { setContracts([]); }
      })();
    };
    window.addEventListener('contractsUpdated', handler as EventListener);
    return () => window.removeEventListener('contractsUpdated', handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = () => {
      (async () => {
        try {
          const instSnap = await getDocs(collection(db, 'investment_installments'));
          const inst = instSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          setInvestmentInstallments(inst);
        } catch { setInvestmentInstallments([]); }
      })();
    };
    window.addEventListener('investmentsUpdated', handler as EventListener);
    return () => window.removeEventListener('investmentsUpdated', handler as EventListener);
  }, []);

  const isInPeriod = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    if (period.type === 'all') return true;
    if (period.type === 'year') { const now = new Date(); return d.getFullYear() === now.getFullYear(); }
    if (period.type === 'month') { const now = new Date(); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }
    if (period.type === 'custom') {
      const start = period.start ? new Date(period.start) : null;
      const end = period.end ? new Date(period.end) : null;
      if (start && d < start) return false;
      if (end) { const ed = new Date(end); ed.setHours(23,59,59,999); if (d > ed) return false; }
      return true;
    }
    return true;
  };

  const contractAmounts = (c: any) => {
    const svcList: any[] = Array.isArray(c.services) && c.services.length ? c.services : (Array.isArray(c.formSnapshot?.cartItems) ? c.formSnapshot.cartItems : []);
    const servicesTotalRaw = svcList.reduce((sum, it: any) => {
      const qty = Number(it?.quantity ?? 1);
      const price = Number(String(it?.price || '').replace(/[^0-9]/g, ''));
      return sum + (price * qty);
    }, 0);
    const storeTotal = (Array.isArray(c.storeItems) ? c.storeItems : []).reduce((sum: number, it: any) => sum + (Number(it.price) * Number(it.quantity || 1)), 0);
    const travel = Number(c.travelFee || 0);
    const totalFromDoc = Number(c.totalAmount || 0);
    const services = servicesTotalRaw > 0 ? servicesTotalRaw : Math.max(0, totalFromDoc - storeTotal - travel);
    const total = Math.round(services + storeTotal + travel);
    return { services, storeTotal, travel, total };
  };

  const filteredContracts = useMemo(() => {
    return (contracts || []).filter((c: any) => isInPeriod(c.contractDate || c.eventDate || c.createdAt));
  }, [contracts, period]);

  const salesTotals = useMemo(() => {
    const packages = filteredContracts.reduce((sum, c: any) => sum + contractAmounts(c).services, 0);
    const services = filteredContracts.reduce((sum, c: any) => sum + contractAmounts(c).storeTotal, 0);
    return { services, packages };
  }, [filteredContracts]);

  const statCards = useMemo(() => {
    const income = filteredContracts.reduce((sum, c: any) => sum + contractAmounts(c).total, 0);
    const customers = new Set(filteredContracts.map((c:any)=> c.clientEmail || c.clientName)).size;
    return ([
      { label: 'Ventas Serv. Adicionales', value: `R$ ${salesTotals.services.toFixed(0)}` , icon: <DollarSign className="text-amber-500" size={18} /> },
      { label: 'Ventas Paquetes Foto', value: `R$ ${salesTotals.packages.toFixed(0)}` , icon: <Package className="text-primary" size={18} /> },
      { label: 'Ingresos Totales', value: `R$ ${income.toFixed(0)}`, icon: <DollarSign className="text-amber-500" size={18} /> },
      { label: 'Nuevos Clientes', value: customers, icon: <Users className="text-fuchsia-500" size={18} /> },
    ]);
  }, [salesTotals, filteredContracts]);

  const nearestContracts = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const withDiff = (contracts || []).map((c: any) => {
      const d = c.eventDate ? new Date(c.eventDate) : (c.contractDate ? new Date(c.contractDate) : new Date());
      const time = isNaN(d.getTime()) ? Date.now() : d.getTime();
      const diff = Math.abs(time - Date.now());
      const future = time >= today.getTime();
      return { c, diff, future };
    });
    withDiff.sort((a, b) => a.diff - b.diff);
    return withDiff.slice(0, 5);
  }, [contracts]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="section-title text-2xl md:text-3xl">Panel de Administración</h1>
        <p className="text-gray-600 text-sm md:text-base">Gestiona tu tienda de productos personalizados</p>
      </div>

      {/* Period Filter at the top */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
        <label className="text-sm font-medium text-gray-700">Periodo:</label>
        <select value={period.type} onChange={e=> setPeriod({ type: e.target.value as any })} className="px-3 py-2 border rounded-none">
          <option value="all">Global</option>
          <option value="year">Este año</option>
          <option value="month">Este mes</option>
          <option value="custom">Personalizado</option>
        </select>
        {period.type === 'custom' && (
          <>
            <input type="date" value={period.start || ''} onChange={e=> setPeriod(p => ({ ...p, start: e.target.value }))} className="px-2 py-1 border rounded-none" />
            <input type="date" value={period.end || ''} onChange={e=> setPeriod(p => ({ ...p, end: e.target.value }))} className="px-2 py-1 border rounded-none" />
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-gray-500 text-sm">{s.label}</p>
              <p className="text-2xl font-semibold">{s.value}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
              {s.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-medium mb-4">Acciones Rápidas</h3>
          <div className="space-y-3">
            <button onClick={() => onNavigate?.('orders')} className="w-full border-2 border-black text-black px-4 py-3 rounded-none hover:bg-black hover:text-white flex items-center justify-center gap-2">
              Ver Órdenes
              <ArrowUpRight size={18} />
            </button>
            <button onClick={() => onNavigate?.('contracts')} className="w-full border-2 border-black text-black px-4 py-3 rounded-none hover:bg-black hover:text-white flex items-center justify-center gap-2">
              Ver Contratos
              <ArrowUpRight size={18} />
            </button>
            <button onClick={() => onNavigate?.('calendar')} className="w-full border-2 border-black text-black px-4 py-3 rounded-none hover:bg-black hover:text-white flex items-center justify-center gap-2">
              Ver Calendario
              <ArrowUpRight size={18} />
            </button>
            <button onClick={() => onNavigate?.('products')} className="w-full border-2 border-black text-black px-4 py-3 rounded-none hover:bg-black hover:text-white">
              Administrar Productos
            </button>
          </div>

        </div>

        {/* Nearest Contracts */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-medium mb-4">Contratos Cercanos</h3>
          <div className="divide-y">
            {nearestContracts.length === 0 && (
              <div className="text-gray-500 text-sm p-4 flex items-center justify-between">
                <span>No hay contratos próximos</span>
              </div>
            )}
            {nearestContracts.map(({ c, future }) => (
              <div key={c.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium lowercase first-letter:uppercase">{c.clientName || 'cliente'}</p>
                  <p className="text-xs text-gray-500">{c.eventDate ? new Date(c.eventDate).toLocaleDateString() : (c.contractDate ? new Date(c.contractDate).toLocaleDateString() : '')}</p>
                  <p className="text-xs text-gray-600">Evento: {c.eventType || '-'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">R$ {Number(c.totalAmount || 0).toFixed(0)}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${c.eventCompleted ? 'bg-green-100 text-green-700' : future ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                    {c.eventCompleted ? 'completado' : future ? 'pendiente' : 'pasado'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="pt-3">
            <button onClick={() => onNavigate?.('contracts')} className="w-full border-2 border-black text-black rounded-none py-2 hover:bg-black hover:text-white">Ver Todos los Contratos</button>
          </div>
        </div>
      </div>

      {/* Performance */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-medium">Rendimiento</h3>
          <select value={metric} onChange={e=> setMetric(e.target.value as any)} className="px-3 py-2 border rounded-none">
            <option value="revenue">Ventas Mensuales</option>
            <option value="contracts">Contratos firmados</option>
          </select>
        </div>
        <div className="h-64">
          <Suspense fallback={<div className="h-64 flex items-center justify-center">Cargando gráfico...</div>}>
            <ChartPerformance
              data={metric === 'revenue' ? computeMonthlyCompare(allOrders, filteredContracts as any, 'all', 'none', period, investmentInstallments) : computeContractsCountByMonth(filteredContracts as any, period)}
              products={products}
              selectedProductId="all"
              selectedProductIdB="none"
              mode={metric as any}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
};

function resolveName(products: ProductLite[], id: 'all' | 'none' | string) {
  if (id === 'all') return 'Todos';
  if (id === 'none') return '—';
  return products.find(p => p.id === id)?.name || 'Producto';
}

function inPeriod(dateStr: string | undefined, period: { type: 'all' | 'year' | 'month' | 'custom'; start?: string; end?: string }) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (period.type === 'all') return true;
  if (period.type === 'year') { const now = new Date(); return d.getFullYear() === now.getFullYear(); }
  if (period.type === 'month') { const now = new Date(); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }
  if (period.type === 'custom') {
    const start = period.start ? new Date(period.start) : null;
    const end = period.end ? new Date(period.end) : null;
    if (start && d < start) return false;
    if (end) { const ed = new Date(end); ed.setHours(23,59,59,999); if (d > ed) return false; }
    return true;
  }
  return true;
}

function computeMonthlyCompare(orders: OrderItem[], contracts: any[], aId: 'all' | string, bId: 'none' | string, period: { type: 'all' | 'year' | 'month' | 'custom'; start?: string; end?: string }, investmentInstallments: any[]) {
  const now = new Date();
  const today = new Date(); today.setHours(0,0,0,0);
  const months = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(now.getFullYear(), i, 1);
    const label = d.toLocaleString('es', { month: 'short' });
    return { key: i, month: label.charAt(0).toUpperCase() + label.slice(1), a: 0, b: 0, forecast: 0, investments: 0, earned: 0 } as any;
  });

  const getItemAmount = (it: OrderLineItem) => {
    const qty = Number(it.qty ?? it.quantity ?? 1);
    const total = it.total != null ? Number(it.total) : (it.price != null ? Number(it.price) * qty : 0);
    return isFinite(total) ? total : 0;
  };

  for (const o of orders) {
    if (!o.created_at) continue;
    if (period && !inPeriod(o.created_at, period)) continue;
    const d = new Date(o.created_at);
    if (isNaN(d.getTime())) continue;
    const m = d.getMonth();

    if (aId === 'all') {
      months[m].a += Number(o.total || 0) || 0;
    } else if (Array.isArray(o.items)) {
      months[m].a += o.items
        .filter(it => (it.productId === aId) || (it.product_id === aId))
        .reduce((sum, it) => sum + getItemAmount(it), 0);
    }

    if (bId !== 'none') {
      if (Array.isArray(o.items)) {
        months[m].b += o.items
          .filter(it => (it.productId === bId) || (it.product_id === bId))
          .reduce((sum, it) => sum + getItemAmount(it), 0);
      }
    }
  }

  if (aId === 'all') {
    for (const c of (contracts || [])) {
      const dateStr = (c.eventDate as string) || (c.contractDate as string) || (c.createdAt as string) || '';
      if (!dateStr) continue;
      if (!inPeriod(dateStr, period)) continue;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) continue;
      const m = d.getMonth();
      const amount = Number(c.totalAmount || 0) || 0;
      const completed = Boolean(c.eventCompleted);
      const isFuture = d.getTime() >= today.getTime();
      if (completed) {
        months[m].a += amount;
        months[m].earned += amount;
      } else if (isFuture) {
        months[m].forecast += amount;
      }
    }
  }

  // investments: sum installments by due month within period
  for (const inst of (investmentInstallments || [])) {
    const dateStr = String(inst.dueDate || '');
    if (!dateStr) continue;
    if (!inPeriod(dateStr, period)) continue;
    const d = new Date(dateStr); if (isNaN(d.getTime())) continue;
    const m = d.getMonth();
    const amount = Number(inst.amount || 0) || 0;
    months[m].investments += amount;
  }

  return months;
}

function computeContractsCountByMonth(contracts: any[], period: { type: 'all' | 'year' | 'month' | 'custom'; start?: string; end?: string }) {
  const now = new Date();
  const months = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(now.getFullYear(), i, 1);
    const label = d.toLocaleString('es', { month: 'short' });
    return { key: i, month: label.charAt(0).toUpperCase() + label.slice(1), a: 0 } as any;
  });
  for (const c of contracts) {
    const dateStr = (c.contractDate as string) || (c.createdAt as string) || '';
    if (!dateStr) continue;
    if (!inPeriod(dateStr, period)) continue;
    const d = new Date(dateStr); if (isNaN(d.getTime())) continue;
    const m = d.getMonth();
    months[m].a += 1;
  }
  return months;
}

export default AdminStoreDashboard;
