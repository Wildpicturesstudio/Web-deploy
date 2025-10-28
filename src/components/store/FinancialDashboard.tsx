import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { db } from '../../utils/firebaseClient';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import { DollarSign, Package, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
const ChartPerformance = lazy(() => import('./ChartPerformance'));

interface Contract {
  id: string;
  eventDate?: string;
  contractDate?: string;
  createdAt?: string;
  totalAmount?: number;
  eventCompleted?: boolean;
  services?: any[];
  formSnapshot?: { cartItems?: any[] };
  storeItems?: any[];
  travelFee?: number;
  clientName?: string;
}

interface Order {
  id: string;
  customer_name?: string;
  total?: number;
  created_at?: string;
  status?: string;
  items?: any[];
}

interface Invoice {
  id: string;
  clientName: string;
  dueDate: string;
  amount: number;
  status: 'Vencido' | 'Pendiente';
}

interface TopClient {
  clientName: string;
  totalValue: number;
}

interface FinancialMetrics {
  currentMonthRevenue: number;
  currentMonthExpenses: number;
  currentMonthNetProfit: number;
  profitMargin: number;
  currentCashBalance: number;
  monthlyData: any[];
  expensesByCategory: any[];
  outstandingInvoices: Invoice[];
  topClients: TopClient[];
}

interface FinancialDashboardProps {
  onNavigate?: (view: string) => void;
  darkMode?: boolean;
}

const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ onNavigate, darkMode = false }) => {
  const [period, setPeriod] = useState<{ type: 'all' | 'year' | 'month' | 'custom'; start?: string; end?: string }>({ type: 'month' });
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [investmentInstallments, setInvestmentInstallments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;

        const contractsSnap = await getDocs(collection(db, 'contracts'));
        const contractsList = contractsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Contract[];
        setContracts(contractsList);

        const ordersSnap = await getDocs(collection(db, 'orders'));
        const ordersList = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Order[];
        setOrders(ordersList);

        const instSnap = await getDocs(collection(db, 'investment_installments'));
        const instList = instSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setInvestmentInstallments(instList);
      } catch (error) {
        console.error('Error loading financial data:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isInPeriod = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    if (period.type === 'all') return true;
    if (period.type === 'year') {
      const now = new Date();
      return d.getFullYear() === now.getFullYear();
    }
    if (period.type === 'month') {
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (period.type === 'custom') {
      const start = period.start ? new Date(period.start) : null;
      const end = period.end ? new Date(period.end) : null;
      if (start && d < start) return false;
      if (end) {
        const ed = new Date(end);
        ed.setHours(23, 59, 59, 999);
        if (d > ed) return false;
      }
      return true;
    }
    return true;
  };

  const contractAmounts = (c: Contract) => {
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
    return contracts.filter((c: Contract) => isInPeriod(c.contractDate || c.eventDate || c.createdAt));
  }, [contracts, period]);

  const metrics = useMemo(() => {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalRevenue = 0;
    let completedRevenue = 0;
    let futureRevenue = 0;
    let expenses = 0;
    let invoices: Invoice[] = [];
    const clientMap = new Map<string, number>();

    for (const c of filteredContracts) {
      const amount = contractAmounts(c).total;
      const dateStr = c.contractDate || c.eventDate || c.createdAt || '';
      const d = dateStr ? new Date(dateStr) : null;
      const isFuture = d && d.getTime() >= today.getTime();

      totalRevenue += amount;
      if (c.eventCompleted) {
        completedRevenue += amount;
      } else if (isFuture) {
        futureRevenue += amount;
        invoices.push({
          id: c.id,
          clientName: c.clientName || 'Cliente',
          dueDate: dateStr || new Date().toISOString().split('T')[0],
          amount,
          status: 'Pendiente'
        });
      }

      const client = c.clientName || 'Cliente';
      clientMap.set(client, (clientMap.get(client) || 0) + amount);
    }

    invoices.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    invoices = invoices.slice(0, 10);

    const topClients = Array.from(clientMap.entries())
      .map(([name, value]) => ({ clientName: name, totalValue: value }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5);

    for (const inst of investmentInstallments) {
      const dateStr = String(inst.dueDate || '');
      if (!dateStr || !isInPeriod(dateStr)) continue;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) continue;
      expenses += Number(inst.amount || 0);
    }

    const netProfit = completedRevenue - expenses;
    const profitMargin = completedRevenue > 0 ? ((netProfit / completedRevenue) * 100) : 0;
    const cashBalance = completedRevenue;

    const monthlyData = computeMonthlyData(filteredContracts, investmentInstallments, period);
    const expensesByCategory = [
      { category: 'Inversiones', amount: expenses },
      { category: 'Otros Gastos', amount: Math.max(0, completedRevenue * 0.1) }
    ].filter(e => e.amount > 0);

    return {
      currentMonthRevenue: completedRevenue,
      currentMonthExpenses: expenses,
      currentMonthNetProfit: netProfit,
      profitMargin: profitMargin,
      currentCashBalance: cashBalance,
      monthlyData,
      expensesByCategory,
      outstandingInvoices: invoices,
      topClients
    } as FinancialMetrics;
  }, [filteredContracts, investmentInstallments, period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-gray-600">Cargando datos financieros...</p>
      </div>
    );
  }

  const bgColor = darkMode ? 'bg-black' : 'bg-white';
  const textColor = darkMode ? 'text-gray-100' : 'text-gray-800';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const cardBg = darkMode ? 'bg-gray-950' : 'bg-white';
  const labelColor = darkMode ? 'text-gray-400' : 'text-gray-600';

  return (
    <div className={`space-y-6 ${darkMode ? 'bg-black' : ''}`}>
      {/* Period Filter */}
      <div className={`${cardBg} rounded-lg border ${borderColor} py-3 px-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 shadow-sm`}>
        <label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Período:</label>
        <select
          value={period.type}
          onChange={e => setPeriod({ type: e.target.value as any })}
          className={`px-3 py-2 border rounded-md text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
        >
          <option value="all">Global</option>
          <option value="year">Este año</option>
          <option value="month">Este mes</option>
          <option value="custom">Personalizado</option>
        </select>
        {period.type === 'custom' && (
          <>
            <input
              type="date"
              value={period.start || ''}
              onChange={e => setPeriod(p => ({ ...p, start: e.target.value }))}
              className={`px-3 py-2 border rounded-md text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
            />
            <input
              type="date"
              value={period.end || ''}
              onChange={e => setPeriod(p => ({ ...p, end: e.target.value }))}
              className={`px-3 py-2 border rounded-md text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
            />
          </>
        )}
      </div>

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* COLUMN 1: KPIs */}
        <div className="space-y-4">
          <h2 className={`text-lg font-semibold px-2 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>Indicadores Clave</h2>

          {/* Ingresos Totales */}
          <div className={`${cardBg} rounded-lg border ${borderColor} p-6 shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-medium ${labelColor}`}>Ingresos Totales</p>
                <p className="text-3xl font-bold text-green-600 mt-2">
                  R$ {metrics.currentMonthRevenue.toFixed(0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <DollarSign className="text-green-600" size={24} />
              </div>
            </div>
          </div>

          {/* Gastos del Mes */}
          <div className={`${cardBg} rounded-lg border ${borderColor} p-6 shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-medium ${labelColor}`}>Gastos del Mes</p>
                <p className="text-3xl font-bold text-orange-600 mt-2">
                  R$ {metrics.currentMonthExpenses.toFixed(0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                <ArrowDownLeft className="text-orange-600" size={24} />
              </div>
            </div>
          </div>

          {/* Utilidad Neta */}
          <div className={`rounded-lg border p-6 shadow-sm hover:shadow-md transition-shadow ${cardBg} ${borderColor}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-medium ${labelColor}`}>Utilidad Neta</p>
                <p className={`text-4xl font-bold mt-2 ${
                  metrics.currentMonthNetProfit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  R$ {metrics.currentMonthNetProfit.toFixed(0)}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                metrics.currentMonthNetProfit >= 0 
                  ? 'bg-green-100' 
                  : 'bg-red-100'
              }`}>
                {metrics.currentMonthNetProfit >= 0 ? (
                  <TrendingUp className={metrics.currentMonthNetProfit >= 0 ? 'text-green-600' : 'text-red-600'} size={24} />
                ) : (
                  <TrendingDown className="text-red-600" size={24} />
                )}
              </div>
            </div>
          </div>

          {/* Margen de Utilidad */}
          <div className={`${cardBg} rounded-lg border ${borderColor} p-6 shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-medium ${labelColor}`}>Margen de Utilidad</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">
                  {metrics.profitMargin.toFixed(1)}%
                </p>
                <div className="flex items-center gap-1 mt-2 text-sm">
                  <ArrowUpRight className="text-blue-600" size={16} />
                  <span className={labelColor}>Desde el período anterior</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Package className="text-blue-600" size={24} />
              </div>
            </div>
          </div>

          {/* Saldo de Caja Actual */}
          <div className={`${cardBg} rounded-lg border ${borderColor} p-6 shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-medium ${labelColor}`}>Saldo de Caja Actual</p>
                <p className="text-3xl font-bold text-indigo-600 mt-2">
                  R$ {metrics.currentCashBalance.toFixed(0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                <DollarSign className="text-indigo-600" size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 2: Visual Analytics */}
        <div className="space-y-4">
          <h2 className={`text-lg font-semibold px-2 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>Análisis Visual</h2>

          {/* Line Chart - Rentabilidad Mensual */}
          <div className={`${cardBg} rounded-lg border ${borderColor} p-6 shadow-sm`}>
            <h3 className={`font-semibold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>Rentabilidad Mensual</h3>
            <div className="h-64">
              <Suspense fallback={<div className={`h-64 flex items-center justify-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Cargando gráfico...</div>}>
                <ChartPerformance
                  data={metrics.monthlyData}
                  products={[]}
                  selectedProductId="all"
                  selectedProductIdB="none"
                  mode="financial"
                />
              </Suspense>
            </div>
          </div>

          {/* Pie Chart - Desglose de Gastos */}
          <div className={`${cardBg} rounded-lg border ${borderColor} p-6 shadow-sm`}>
            <h3 className={`font-semibold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>Desglose de Gastos</h3>
            <div className="space-y-3">
              {metrics.expensesByCategory.length > 0 ? (
                metrics.expensesByCategory.map((cat, idx) => {
                  const total = metrics.expensesByCategory.reduce((sum, c) => sum + c.amount, 0);
                  const percentage = total > 0 ? (cat.amount / total) * 100 : 0;
                  const colors = ['bg-orange-500', 'bg-red-500', 'bg-yellow-500'];
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full ${colors[idx % colors.length]}`}></div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{cat.category}</span>
                          <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>R$ {cat.amount.toFixed(0)}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${colors[idx % colors.length]}`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className={`text-sm text-center py-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Sin gastos en este período</p>
              )}
            </div>
          </div>
        </div>

        {/* COLUMN 3: Operational & Management Details */}
        <div className="space-y-4">
          <h2 className={`text-lg font-semibold px-2 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>Operaciones</h2>

          {/* Facturas por Cobrar */}
          <div className={`${cardBg} rounded-lg border ${borderColor} p-6 shadow-sm`}>
            <h3 className={`font-semibold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>Facturas por Cobrar</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {metrics.outstandingInvoices.length > 0 ? (
                metrics.outstandingInvoices.map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 text-sm truncate">{invoice.clientName}</p>
                      <p className="text-xs text-gray-600">Vencimiento: {new Date(invoice.dueDate).toLocaleDateString('es')}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <p className="font-semibold text-gray-900 whitespace-nowrap">R$ {invoice.amount.toFixed(0)}</p>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
                        invoice.status === 'Vencido' 
                          ? 'bg-red-100 text-red-700' 
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {invoice.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">Sin facturas pendientes</p>
              )}
            </div>
          </div>

          {/* Top 5 Clientes del Mes */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h3 className="font-semibold text-gray-800 mb-4">Top 5 Clientes del Período</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {metrics.topClients.length > 0 ? (
                metrics.topClients.map((client, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                    <div className="flex-1">
                      <p className="font-medium text-gray-800 text-sm">{client.clientName}</p>
                      <p className="text-xs text-gray-600">Valor contratado</p>
                    </div>
                    <p className="font-semibold text-gray-900">R$ {client.totalValue.toFixed(0)}</p>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">Sin datos de clientes</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function computeMonthlyData(contracts: Contract[], investmentInstallments: any[], period: any) {
  const now = new Date();
  const months = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(now.getFullYear(), i, 1);
    const label = d.toLocaleString('es', { month: 'short' });
    return { key: i, month: label.charAt(0).toUpperCase() + label.slice(1), income: 0, expenses: 0, profit: 0, earned: 0, forecast: 0 } as any;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isInPeriod = (dateStr: string | undefined) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    if (period.type === 'all') return true;
    if (period.type === 'year') {
      const now = new Date();
      return d.getFullYear() === now.getFullYear();
    }
    if (period.type === 'month') {
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (period.type === 'custom') {
      const start = period.start ? new Date(period.start) : null;
      const end = period.end ? new Date(period.end) : null;
      if (start && d < start) return false;
      if (end) {
        const ed = new Date(end);
        ed.setHours(23, 59, 59, 999);
        if (d > ed) return false;
      }
      return true;
    }
    return true;
  };

  const contractAmounts = (c: Contract) => {
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

  for (const c of contracts) {
    const dateStr = c.contractDate || c.eventDate || c.createdAt || '';
    if (!dateStr || !isInPeriod(dateStr)) continue;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;
    const m = d.getMonth();
    const amount = contractAmounts(c).total;

    months[m].income += amount;
    if (c.eventCompleted) {
      months[m].earned += amount;
      months[m].profit += amount;
    } else {
      const isFuture = d.getTime() >= today.getTime();
      if (isFuture) {
        months[m].forecast += amount;
      }
    }
  }

  for (const inst of investmentInstallments) {
    const dateStr = String(inst.dueDate || '');
    if (!dateStr || !isInPeriod(dateStr)) continue;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;
    const m = d.getMonth();
    const amount = Number(inst.amount || 0);
    months[m].expenses += amount;
    months[m].profit -= amount;
  }

  return months;
}

export default FinancialDashboard;
