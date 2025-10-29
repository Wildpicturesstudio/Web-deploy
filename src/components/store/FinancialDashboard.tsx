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
  depositPaid?: boolean;
  finalPaymentPaid?: boolean;
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
  const [period, setPeriod] = useState<{ type: 'all' | 'year' | 'month' | 'quincena' | 'custom'; start?: string; end?: string; quinceType?: '1' | '2' }>({ type: 'month' });
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
    if (period.type === 'quincena') {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const dateMonth = d.getMonth();
      const dateYear = d.getFullYear();
      if (dateYear !== currentYear || dateMonth !== currentMonth) return false;
      const dateDay = d.getDate();
      if (period.quinceType === '1') return dateDay <= 15;
      if (period.quinceType === '2') return dateDay > 15;
      return false;
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

  const calculatePaidAmount = (c: Contract) => {
    const { services, storeTotal, total } = contractAmounts(c);

    let paid = 0;

    if (c.depositPaid) {
      const servicesDeposit = Math.round(services * 0.2);
      const storeDeposit = Math.round(storeTotal * 0.5);
      paid += servicesDeposit + storeDeposit;
    }

    if (c.finalPaymentPaid) {
      const deposit = c.depositPaid ? (Math.round(services * 0.2) + Math.round(storeTotal * 0.5)) : 0;
      const remaining = Math.max(0, total - deposit);
      paid += remaining;
    }

    return paid;
  };

  const isShortPeriod = !!(period.type === 'quincena' || (period.type === 'custom' && period.start && period.end && (() => {
    const start = new Date(period.start);
    const end = new Date(period.end);
    return (end.getTime() - start.getTime()) <= (15 * 24 * 60 * 60 * 1000);
  })()));

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
    let pendingRevenue = 0;
    let expenses = 0;
    let invoices: Invoice[] = [];
    const clientMap = new Map<string, number>();

    for (const c of filteredContracts) {
      const amount = contractAmounts(c).total;
      const paidAmount = calculatePaidAmount(c);
      const dateStr = c.eventDate || c.contractDate || c.createdAt || '';
      const d = dateStr ? new Date(dateStr) : null;
      const isFuture = d && d.getTime() >= today.getTime();

      totalRevenue += amount;
      completedRevenue += paidAmount;

      const { services, storeTotal, total } = contractAmounts(c);
      const servicesDeposit = Math.round(services * 0.2);
      const storeDeposit = Math.round(storeTotal * 0.5);
      const depositAmount = servicesDeposit + storeDeposit;
      const remainingPayment = Math.max(0, total - depositAmount);

      let unpaidAmount = 0;
      if (!c.depositPaid) {
        unpaidAmount = total;
      } else if (!c.finalPaymentPaid) {
        unpaidAmount = remainingPayment;
      }

      if (unpaidAmount > 0) {
        pendingRevenue += unpaidAmount;
        if (isFuture) {
          futureRevenue += unpaidAmount;
        }
        invoices.push({
          id: c.id,
          clientName: c.clientName || 'Cliente',
          dueDate: dateStr || new Date().toISOString().split('T')[0],
          amount: unpaidAmount,
          status: 'Pendiente'
        });
      }

      const client = c.clientName || 'Cliente';
      clientMap.set(client, (clientMap.get(client) || 0) + paidAmount);
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
      currentCashBalance: pendingRevenue,
      monthlyData,
      expensesByCategory,
      outstandingInvoices: invoices,
      topClients
    } as FinancialMetrics;
  }, [filteredContracts, investmentInstallments, period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Cargando datos financieros...</p>
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
          <option value="quincena">Quincena</option>
          <option value="custom">Personalizado</option>
        </select>
        {period.type === 'quincena' && (
          <select
            value={period.quinceType || "1"}
            onChange={e => setPeriod(p => ({ ...p, quinceType: e.target.value as any }))}
            className={`px-3 py-2 border rounded-md text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
          >
            <option value="1">Primera Quincena (1-15)</option>
            <option value="2">Segunda Quincena (16-31)</option>
          </select>
        )}
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

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {/* Ingresos Totales */}
        <div className={`${cardBg} rounded border ${borderColor} p-2 shadow-sm hover:shadow-md transition-shadow`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-xs font-medium ${labelColor} truncate`}>Ingresos</p>
              <p className="text-base font-bold text-green-600 leading-tight">R$ {metrics.currentMonthRevenue.toFixed(0)}</p>
            </div>
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <DollarSign className="text-green-600" size={14} />
            </div>
          </div>
        </div>

        {/* Gastos del Mes */}
        <div className={`${cardBg} rounded border ${borderColor} p-2 shadow-sm hover:shadow-md transition-shadow`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-xs font-medium ${labelColor} truncate`}>Gastos</p>
              <p className="text-base font-bold text-orange-600 leading-tight">R$ {metrics.currentMonthExpenses.toFixed(0)}</p>
            </div>
            <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <ArrowDownLeft className="text-orange-600" size={14} />
            </div>
          </div>
        </div>

        {/* Utilidad Neta */}
        <div className={`rounded border p-2 shadow-sm hover:shadow-md transition-shadow ${cardBg} ${borderColor}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-xs font-medium ${labelColor} truncate`}>Utilidad</p>
              <p className={`text-base font-bold leading-tight ${metrics.currentMonthNetProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                R$ {metrics.currentMonthNetProfit.toFixed(0)}
              </p>
            </div>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${metrics.currentMonthNetProfit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              {metrics.currentMonthNetProfit >= 0 ? (
                <TrendingUp className={metrics.currentMonthNetProfit >= 0 ? 'text-green-600' : 'text-red-600'} size={14} />
              ) : (
                <TrendingDown className="text-red-600" size={14} />
              )}
            </div>
          </div>
        </div>

        {/* Margen de Utilidad */}
        <div className={`${cardBg} rounded border ${borderColor} p-2 shadow-sm hover:shadow-md transition-shadow`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-xs font-medium ${labelColor} truncate`}>Margen</p>
              <p className="text-base font-bold text-blue-600 leading-tight">{metrics.profitMargin.toFixed(1)}%</p>
            </div>
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Package className="text-blue-600" size={14} />
            </div>
          </div>
        </div>

        {/* Saldo - Ingreso Pendiente */}
        <div className={`${cardBg} rounded border ${borderColor} p-2 shadow-sm hover:shadow-md transition-shadow`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-xs font-medium ${labelColor} truncate`}>Saldo Pendiente</p>
              <p className="text-base font-bold text-indigo-600 leading-tight">R$ {metrics.currentCashBalance.toFixed(0)}</p>
            </div>
            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <DollarSign className="text-indigo-600" size={14} />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Line Chart - Rentabilidad Mensual/Semanal */}
        <div className={`${cardBg} rounded-lg border ${borderColor} p-6 shadow-sm lg:col-span-3`}>
          <h3 className={`font-semibold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>{isShortPeriod ? 'Rentabilidad Semanal' : 'Rentabilidad Mensual'}</h3>
          <div className="h-64">
            <Suspense fallback={<div className={`h-64 flex items-center justify-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Cargando gráfico...</div>}>
              <ChartPerformance
                data={metrics.monthlyData}
                products={[]}
                selectedProductId="all"
                selectedProductIdB="none"
                mode="financial"
                isWeekly={isShortPeriod}
                height={300}
              />
            </Suspense>
          </div>
        </div>

        {/* Pie Chart - Desglose de Gastos */}
        <div className={`${cardBg} rounded-lg border ${borderColor} p-6 shadow-sm lg:col-span-2`}>
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
    </div>
  );
};

function computeMonthlyData(contracts: Contract[], investmentInstallments: any[], period: any) {
  const now = new Date();

  const isShortPeriod = !!(period.type === 'quincena' || (period.type === 'custom' && period.start && period.end && (() => {
    const start = new Date(period.start);
    const end = new Date(period.end);
    return (end.getTime() - start.getTime()) <= (15 * 24 * 60 * 60 * 1000);
  })()));

  let dataPoints: any[] = [];

  if (isShortPeriod) {
    let startDate: Date;
    let endDate: Date;

    if (period.type === 'quincena') {
      startDate = new Date(now.getFullYear(), now.getMonth(), period.quinceType === '1' ? 1 : 16);
      endDate = new Date(now.getFullYear(), now.getMonth(), period.quinceType === '1' ? 15 : 31);
    } else {
      startDate = new Date(period.start);
      endDate = new Date(period.end);
    }

    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    for (let i = 0; i < daysDiff; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dayName = d.toLocaleString('es', { weekday: 'short' });
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      dataPoints.push({
        key: i,
        month: dayName.charAt(0).toUpperCase() + dayName.slice(1),
        date: dateStr,
        income: 0,
        expenses: 0,
        profit: 0,
        earned: 0,
        forecast: 0,
        netProfit: 0
      });
    }
  } else {
    const months = Array.from({ length: 12 }).map((_, i) => {
      const d = new Date(now.getFullYear(), i, 1);
      const label = d.toLocaleString('es', { month: 'short' });
      return { key: i, month: label.charAt(0).toUpperCase() + label.slice(1), income: 0, expenses: 0, profit: 0, earned: 0, forecast: 0, netProfit: 0 } as any;
    });
    dataPoints = months;
  }

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
    if (period.type === 'quincena') {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const dateMonth = d.getMonth();
      const dateYear = d.getFullYear();
      if (dateYear !== currentYear || dateMonth !== currentMonth) return false;
      const dateDay = d.getDate();
      if (period.quinceType === '1') return dateDay <= 15;
      if (period.quinceType === '2') return dateDay > 15;
      return false;
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

  const calculatePaidAmount = (c: Contract) => {
    const { services, storeTotal, total } = contractAmounts(c);

    let paid = 0;

    if (c.depositPaid) {
      const servicesDeposit = Math.round(services * 0.2);
      const storeDeposit = Math.round(storeTotal * 0.5);
      paid += servicesDeposit + storeDeposit;
    }

    if (c.finalPaymentPaid) {
      const deposit = c.depositPaid ? (Math.round(services * 0.2) + Math.round(storeTotal * 0.5)) : 0;
      const remaining = Math.max(0, total - deposit);
      paid += remaining;
    }

    return paid;
  };

  for (const c of contracts) {
    const dateStr = c.eventDate || c.contractDate || c.createdAt || '';
    if (!dateStr || !isInPeriod(dateStr)) continue;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;

    const amount = contractAmounts(c).total;
    const paidAmount = (() => {
      const { services, storeTotal, total } = contractAmounts(c);
      let paid = 0;
      if (c.depositPaid) {
        const servicesDeposit = Math.round(services * 0.2);
        const storeDeposit = Math.round(storeTotal * 0.5);
        paid += servicesDeposit + storeDeposit;
      }
      if (c.finalPaymentPaid) {
        const deposit = c.depositPaid ? (Math.round(services * 0.2) + Math.round(storeTotal * 0.5)) : 0;
        const remaining = Math.max(0, total - deposit);
        paid += remaining;
      }
      return paid;
    })();

    let dataPoint;
    if (isShortPeriod) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const contractDateStr = `${year}-${month}-${day}`;
      dataPoint = dataPoints.find(dp => dp.date === contractDateStr);
    } else {
      const m = d.getMonth();
      dataPoint = dataPoints[m];
    }

    if (dataPoint) {
      dataPoint.income += amount;
      if (c.depositPaid || c.finalPaymentPaid) {
        dataPoint.earned += paidAmount;
      } else {
        const isFuture = d.getTime() >= today.getTime();
        if (isFuture) {
          dataPoint.forecast += amount;
        }
      }
    }
  }

  for (const inst of investmentInstallments) {
    const dateStr = String(inst.dueDate || '');
    if (!dateStr || !isInPeriod(dateStr)) continue;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;
    const amount = Number(inst.amount || 0);

    let dataPoint;
    if (isShortPeriod) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const contractDateStr = `${year}-${month}-${day}`;
      dataPoint = dataPoints.find(dp => dp.date === contractDateStr);
    } else {
      const m = d.getMonth();
      dataPoint = dataPoints[m];
    }

    if (dataPoint) {
      dataPoint.expenses += amount;
    }
  }

  for (let i = 0; i < dataPoints.length; i++) {
    dataPoints[i].netProfit = dataPoints[i].earned - dataPoints[i].expenses;
    dataPoints[i].profit = dataPoints[i].netProfit;
  }

  return dataPoints;
}

export default FinancialDashboard;
