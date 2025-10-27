import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../utils/firebaseClient';
import { addDoc, collection, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Plus, X, ExternalLink, MapPin, Phone, Calendar as IconCalendar, Clock, DollarSign, FileText, Download, Printer } from 'lucide-react';
import { parseDurationToMinutes } from '../../utils/calendar';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { WorkflowStatusButtons } from './WorkflowStatusButtons';

interface ContractItem {
  id: string;
  clientName: string;
  clientEmail: string;
  eventType?: string;
  eventDate?: string; // YYYY-MM-DD
  eventTime?: string; // HH:mm
  eventLocation?: string;
  packageDuration?: string;
  paymentMethod?: string;
  depositPaid?: boolean;
  finalPaymentPaid?: boolean;
  eventCompleted?: boolean;
  isEditing?: boolean;
  status?: 'pending' | 'booked' | 'delivered' | 'cancelled' | 'pending_payment' | 'confirmed' | 'pending_approval' | 'released';
  pdfUrl?: string | null;
  phone?: string;
  formSnapshot?: any;
  totalAmount?: number;
  travelFee?: number;
}

type StatusFilter = 'all' | 'pending' | 'booked' | 'delivered' | 'cancelled' | 'pending_payment' | 'pending_approval' | 'released';

const startOfMonth = (y: number, m: number) => new Date(y, m, 1);
const endOfMonth = (y: number, m: number) => new Date(y, m + 1, 0);
const toLocalDate = (s?: string) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

function getEventColor(c: ContractItem): string {
  if (c.status === 'cancelled') return 'bg-red-500 text-white hover:opacity-90';
  if (c.status === 'released') return 'bg-gray-200 text-gray-700 hover:opacity-90';
  if (c.status === 'delivered' || (c.eventCompleted && c.finalPaymentPaid)) return 'bg-green-600 text-white hover:opacity-90';
  if (c.status === 'pending_payment' || c.depositPaid === false) return 'bg-gray-400 text-white hover:opacity-90';
  if (c.status === 'pending_approval') return 'bg-orange-500 text-white hover:opacity-90';
  if (c.status === 'confirmed' || (c.depositPaid && !c.eventCompleted)) return 'bg-blue-600 text-white hover:opacity-90';
  return 'bg-yellow-500 text-black hover:opacity-90';
}

interface AdminCalendarProps {
  darkMode?: boolean;
}

const AdminCalendar: React.FC<AdminCalendarProps> = ({ darkMode = false }) => {
  const today = new Date();
  const [current, setCurrent] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const [events, setEvents] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterMonth, setFilterMonth] = useState<number>(today.getMonth());
  const [filterYear, setFilterYear] = useState<number>(today.getFullYear());
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [filterPhone, setFilterPhone] = useState<string>('');
  const [selected, setSelected] = useState<ContractItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<any>({ clientName: '', eventType: '', eventDate: '', eventTime: '', eventLocation: '', paymentMethod: 'pix' });
  const [dressOptions, setDressOptions] = useState<{ id: string; name: string; image: string; color?: string }[]>([]);
  const [showDailyList, setShowDailyList] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const col = collection(db, 'contracts');
      let q: any = col;
      try { q = query(col, orderBy('createdAt', 'desc')); } catch (_) { q = col; }
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as ContractItem[];
      const expanded: ContractItem[] = list.flatMap((c: any) => {
        const fs = c.formSnapshot || {};
        const svc: any[] = Array.isArray(c.services) && c.services.length > 0
          ? c.services
          : (Array.isArray(fs.cartItems) ? fs.cartItems : []);
        if (svc && svc.length > 0) {
          return svc.map((it: any, index: number) => {
            const evDate = String(fs[`date_${index}`] || c.eventDate || '');
            const evTime = String(fs[`time_${index}`] || c.eventTime || '');
            const evLoc = String(fs[`eventLocation_${index}`] || c.eventLocation || '');
            const duration = String(it?.duration || c.packageDuration || '');
            const evType = String(it?.type || c.eventType || '');
            return {
              ...c,
              id: `${c.id}__${index}`,
              eventDate: evDate,
              eventTime: evTime,
              eventLocation: evLoc,
              packageDuration: duration,
              eventType: evType,
              clientName: `${c.clientName}${it?.name ? ` — ${it.name}` : ''}`
            } as ContractItem;
          });
        }
        return [c as ContractItem];
      });
      setEvents(expanded);
    } catch (e) {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener('contractsUpdated', handler as EventListener);
    return () => window.removeEventListener('contractsUpdated', handler as EventListener);
  }, []);

  useEffect(() => {
    const loadDresses = async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        const list = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter((p: any) => {
            const c = String((p as any).category || '').toLowerCase();
            return c.includes('vestid') || c.includes('dress');
          })
          .map((p: any) => ({
            id: p.id,
            name: p.name || 'Vestido',
            image: p.image_url || p.image || '',
            color: Array.isArray(p.tags) && p.tags.length ? String(p.tags[0]) : ''
          }));
        setDressOptions(list);
      } catch (e) {
        console.error('Error loading dresses:', e);
        setDressOptions([]);
      }
    };
    loadDresses();
  }, []);

  const monthDays = useMemo(() => {
    const first = startOfMonth(current.y, current.m);
    const last = endOfMonth(current.y, current.m);
    const startWeekday = first.getDay();
    const total = last.getDate();
    const cells: Array<{ date: Date | null } > = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
    for (let d = 1; d <= total; d++) cells.push({ date: new Date(current.y, current.m, d) });
    return cells;
  }, [current]);

  const miniMonthDays = useMemo(() => {
    const first = startOfMonth(current.y, current.m);
    const last = endOfMonth(current.y, current.m);
    const startWeekday = first.getDay();
    const total = last.getDate();
    const cells: Array<{ date: Date | null }> = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
    for (let d = 1; d <= total; d++) cells.push({ date: new Date(current.y, current.m, d) });
    return cells;
  }, [current]);

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      const d = toLocalDate(ev.eventDate);
      if (!d) return false;
      const monthMatch = d.getMonth() === filterMonth;
      const yearMatch = d.getFullYear() === filterYear;
      const status = (() => {
        if (ev.status) return ev.status;
        if (ev.eventCompleted && ev.finalPaymentPaid) return 'delivered' as const;
        if (ev.depositPaid === false) return 'pending_payment' as const;
        return 'booked' as const;
      })();
      const statusMatch = filterStatus === 'all' ? true : status === filterStatus;

      let phoneMatch = true;
      if (filterPhone.trim()) {
        const phoneSource = ev.phone || (ev as any).formSnapshot?.phone || '';
        const onlyDigits = (v: string) => String(v || '').replace(/\D/g, '');
        phoneMatch = onlyDigits(phoneSource).includes(onlyDigits(filterPhone));
      }

      return monthMatch && yearMatch && statusMatch && phoneMatch;
    });
  }, [events, filterMonth, filterYear, filterStatus, filterPhone]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ContractItem[]>();
    const toMinutes = (t?: string) => {
      if (!t) return 0;
      const [h, m] = t.split(':').map(Number);
      return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    };
    filteredEvents.forEach(ev => {
      if (!ev.eventDate) return;
      const key = ev.eventDate;
      map.set(key, [...(map.get(key) || []), ev]);
    });
    for (const [k, list] of Array.from(map.entries())) {
      list.sort((a, b) => {
        const ta = toMinutes(a.eventTime);
        const tb = toMinutes(b.eventTime);
        if (ta !== tb) return ta - tb;
        return String(a.clientName || '').localeCompare(String(b.clientName || ''));
      });
      map.set(k, list);
    }
    return map;
  }, [filteredEvents]);

  const goToday = () => { const t = new Date(); setCurrent({ y: t.getFullYear(), m: t.getMonth() }); setFilterMonth(t.getMonth()); setFilterYear(t.getFullYear()); };
  const prevMonth = () => setCurrent(c => { const y = c.m === 0 ? c.y - 1 : c.y; const m = c.m === 0 ? 11 : c.m - 1; return { y, m }; });
  const nextMonth = () => setCurrent(c => { const y = c.m === 11 ? c.y + 1 : c.y; const m = c.m === 11 ? 0 : c.m + 1; return { y, m }; });

  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString('es', { month: 'long' }));
  const years = Array.from({ length: 7 }, (_, i) => today.getFullYear() - 3 + i);

  const computeAmounts = (c: ContractItem) => {
    const svcList: any[] = Array.isArray((c as any).services) && (c as any).services.length > 0 ? (c as any).services : (Array.isArray((c as any).formSnapshot?.cartItems) ? (c as any).formSnapshot.cartItems : []);
    const servicesTotalRaw = svcList.reduce((sum, it: any) => {
      const qty = Number(it?.quantity ?? 1);
      const price = Number(String(it?.price || '').replace(/[^0-9]/g, ''));
      return sum + (price * qty);
    }, 0);
    const storeTotal = (Array.isArray((c as any).storeItems) ? (c as any).storeItems : []).reduce((sum: number, it: any) => sum + (Number(it.price) * Number(it.quantity || 1)), 0);
    const travel = Number((c as any).travelFee || 0);
    const totalFromDoc = Number((c as any).totalAmount || 0);
    const servicesEstimated = servicesTotalRaw > 0 ? servicesTotalRaw : Math.max(0, totalFromDoc - storeTotal - travel);
    const totalAmount = Math.round(servicesEstimated + storeTotal + travel);
    const depositAmount = servicesEstimated <= 0 && storeTotal > 0 ? Math.ceil((storeTotal + travel) * 0.5) : Math.ceil(servicesEstimated * 0.2 + storeTotal * 0.5);
    const remainingAmount = Math.max(0, Math.round(totalAmount - depositAmount));
    return { servicesTotal: servicesEstimated, storeTotal, travel, totalAmount, depositAmount, remainingAmount };
  };

  const handleSaveStatus = async (id: string, status: ContractItem['status']) => {
    await updateDoc(doc(db, 'contracts', id), { status } as any);
    await load();
  };

  const handleAddEvent = async () => {
    if (!addForm.clientName || !addForm.eventDate) return;
    const payload: any = {
      clientName: addForm.clientName,
      clientEmail: addForm.clientEmail || '',
      eventType: addForm.eventType || 'Evento',
      eventDate: addForm.eventDate,
      eventTime: addForm.eventTime || '00:00',
      eventLocation: addForm.eventLocation || '',
      paymentMethod: addForm.paymentMethod || 'pix',
      depositPaid: false,
      finalPaymentPaid: false,
      eventCompleted: false,
      isEditing: false,
      createdAt: new Date().toISOString(),
      totalAmount: Number(addForm.totalAmount || 0) || 0,
      travelFee: Number(addForm.travelFee || 0) || 0,
      status: 'booked' as const,
    };
    await addDoc(collection(db, 'contracts'), payload);
    setAdding(false);
    setAddForm({ clientName: '', eventType: '', eventDate: '', eventTime: '', eventLocation: '', paymentMethod: 'pix' });
    await load();
  };

  const openContractPreview = (c: ContractItem) => {
    const baseId = String(c.id || '').split('__')[0] || c.id;
    try {
      window.dispatchEvent(new CustomEvent('adminOpenContract', { detail: { id: baseId } }));
    } catch {}
    setSelected(null);
  };

  return (
    <div className="flex h-full w-full bg-white">
      {/* Left Sidebar - Mini Calendar */}
      <div className={`w-64 border-r p-4 flex flex-col overflow-y-auto flex-shrink-0 transition-colors ${darkMode ? 'bg-black border-gray-800' : 'bg-white border-gray-200'}`}>
        {/* Mini Calendar */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <button onClick={prevMonth} className={`p-2 rounded-full transition-colors flex-shrink-0 ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}><ChevronLeft size={16}/></button>
            <div className={`text-sm font-semibold text-center flex-1 transition-colors ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {new Date(current.y, current.m, 1).toLocaleString('es', { month: 'short', year: '2-digit' })}
            </div>
            <button onClick={nextMonth} className={`p-2 rounded-full transition-colors flex-shrink-0 ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}><ChevronRight size={16}/></button>
          </div>
          <div className={`grid grid-cols-7 gap-px p-2 rounded lg:rounded max-lg:rounded transition-colors ${darkMode ? 'bg-gray-900 max-lg:bg-black' : 'bg-gray-100 max-lg:bg-white'}`}>
            {['D','L','M','X','J','V','S'].map(d => <div key={d} className={`text-center text-xs font-medium py-1 transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>{d}</div>)}
            {miniMonthDays.map((cell, idx) => {
              const isToday = cell.date && new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate()).getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
              const key = cell.date ? `${cell.date.getFullYear()}-${String(cell.date.getMonth()+1).padStart(2,'0')}-${String(cell.date.getDate()).padStart(2,'0')}` : `empty-${idx}`;
              const hasEvents = cell.date ? (eventsByDay.get(key) || []).length > 0 : false;
              return (
                <button key={key} className={`text-center text-xs py-1 rounded transition-colors font-medium ${isToday ? 'bg-secondary text-black' : hasEvents ? (darkMode ? 'bg-blue-600 text-white' : 'bg-blue-200 text-blue-800') : (darkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-200')}`}>
                  {cell.date ? cell.date.getDate() : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* Phone Filter */}
        <div className="space-y-2 mb-4">
          <label className={`text-xs block transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>Filtrar por teléfono</label>
          <input
            type="text"
            value={filterPhone}
            onChange={e => setFilterPhone(e.target.value)}
            placeholder="Ej: 1234567890"
            className={`w-full px-3 py-2 border rounded-lg text-sm transition-colors ${darkMode ? 'border-gray-700 bg-gray-900 text-gray-300 placeholder-gray-600' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'}`}
          />
        </div>
      </div>

      {/* Right Calendar Area */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-colors ${darkMode ? 'bg-black' : 'bg-white'}`}>
        {/* Calendar header with month display */}
        <div className={`px-4 py-0 border-b flex items-center justify-between flex-shrink-0 transition-colors ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className={`text-lg font-semibold transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>
            {new Date(filterYear, filterMonth, 1).toLocaleString('es', { month: 'long', year: 'numeric' })}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={goToday} className="px-4 py-0.5 rounded-full bg-gray-600 text-white font-medium hover:opacity-90 transition-opacity mt-0.5">Hoy</button>
            <button onClick={()=> setAdding(true)} className="p-2 rounded-full bg-green-600 text-white hover:bg-green-700 transition-colors" title="Añadir evento"><Plus size={18}/></button>
          </div>
        </div>

        {/* Calendar grid */}
        <div className={`flex-1 overflow-hidden flex flex-col transition-colors ${darkMode ? 'bg-black' : 'bg-white'}`}>
          <div className={`grid grid-cols-7 text-center text-xs py-0 px-1 border-b flex-shrink-0 transition-colors ${darkMode ? 'border-gray-800 bg-gray-950 lg:bg-gray-950 max-lg:bg-black text-gray-400' : 'border-gray-200 bg-gray-50 lg:bg-gray-50 max-lg:bg-white text-gray-600'}`}>
            {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map((d)=> <div key={d} className="py-1 font-medium">{d}</div>)}
          </div>
          <div className={`grid grid-cols-7 gap-px flex-1 auto-rows-fr overflow-hidden w-full h-full transition-colors ${darkMode ? 'bg-gray-900 lg:bg-gray-900 max-lg:bg-black' : 'bg-gray-100 lg:bg-gray-100 max-lg:bg-white'}`}>
            {monthDays.map((cell, idx)=>{
              const isToday = cell.date && new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate()).getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
              const key = cell.date ? `${cell.date.getFullYear()}-${String(cell.date.getMonth()+1).padStart(2,'0')}-${String(cell.date.getDate()).padStart(2,'0')}` : `empty-${idx}`;
              const dayEvents = cell.date ? (eventsByDay.get(key) || []) : [];
              return (
                <button key={key} onClick={() => cell.date && setExpandedDay(key)} className={`p-2 relative overflow-hidden flex flex-col border transition-colors text-left cursor-pointer group ${darkMode ? 'bg-gray-900 lg:bg-gray-900 max-lg:bg-black border-gray-800 hover:bg-gray-800' : 'bg-white lg:bg-white max-lg:bg-white border-gray-200 hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between gap-1 mb-1 flex-shrink-0">
                    <div className={`text-sm font-medium transition-colors ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {cell.date ? (isToday ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-black text-xs font-bold">
                          {cell.date.getDate()}
                        </span>
                      ) : (
                        <span>{cell.date.getDate()}</span>
                      )) : ''}
                    </div>
                    {cell.date && (eventsByDay.get(key) || []).length > 0 && (
                      <span className="text-xs bg-secondary text-black px-1.5 py-0.5 rounded-full font-semibold">
                        {(eventsByDay.get(key) || []).length}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5 flex-1 overflow-hidden">
                    {dayEvents.slice(0, 3).map(ev => {
                      const label = `${(ev.eventTime || '00:00')}`;
                      return (
                        <div key={ev.id} className={`w-full text-left px-1 py-0.5 rounded text-xs ${getEventColor(ev)} truncate opacity-90 group-hover:opacity-100`}>
                          {label}
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div className={`text-xs px-1 transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        +{dayEvents.length - 3} más
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Expanded Day Modal */}
      {expandedDay && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-colors ${darkMode ? 'bg-black/80' : 'bg-white/80'}`} onClick={()=> setExpandedDay(null)}>
          <div className={`rounded-lg w-full max-w-3xl max-h-[80vh] overflow-y-auto p-6 border transition-colors ${darkMode ? 'bg-black border-gray-800' : 'bg-white border-gray-200'}`} onClick={e=> e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className={`text-2xl font-bold transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>
                {new Date(expandedDay).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
              <button onClick={()=> setExpandedDay(null)} className={`text-2xl transition-colors ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}>✕</button>
            </div>

            {(eventsByDay.get(expandedDay) || []).length > 0 ? (
              <div className="space-y-4">
                {(eventsByDay.get(expandedDay) || []).map((ev, idx) => (
                  <div key={ev.id} className={`border rounded-lg p-4 transition-colors ${darkMode ? 'bg-black border-gray-700' : 'bg-transparent border-gray-300'}`}>
                    <div className={`font-semibold text-lg transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{idx + 1}. {ev.clientName || 'Evento sin nombre'}</div>
                    <div className="grid grid-cols-2 gap-3 text-sm mt-3">
                      <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Hora:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{ev.eventTime || '-'}</span></div>
                      <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tipo:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{ev.eventType || '-'}</span></div>
                      <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Teléfono:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{ev.phone || (ev as any).formSnapshot?.phone || '-'}</span></div>
                      <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Duración:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{ev.packageDuration || '-'}</span></div>
                      <div className="col-span-2"><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Ubicación:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{ev.eventLocation || '-'}</span></div>
                    </div>

                    {Array.isArray((ev as any).formSnapshot?.selectedDresses) && (ev as any).formSnapshot.selectedDresses.length > 0 ? (
                      <div className={`mt-4 pt-4 border-t transition-colors ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}>
                        <div className={`text-sm font-medium mb-3 transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>Vestidos:</div>
                        <div className="grid grid-cols-3 gap-3">
                          {(ev as any).formSnapshot.selectedDresses
                            .map((id: string) => dressOptions.find(d => d.id === id))
                            .filter(Boolean)
                            .map((dress: any) => (
                              <div key={(dress as any).id} className="flex flex-col items-center">
                                <div className={`w-20 h-24 rounded overflow-hidden mb-2 border transition-colors ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-200 border-gray-300'}`}>
                                  {(dress as any).image ? (
                                    <img src={(dress as any).image} alt={(dress as any).name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className={`w-full h-full flex items-center justify-center text-xs transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Sin foto</div>
                                  )}
                                </div>
                                <span className={`text-xs text-center truncate w-full transition-colors ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{(dress as any).name}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : null}

                    <div className={`mt-4 pt-4 border-t transition-colors ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}>
                      <div className={`text-sm font-medium mb-2 transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>Resumen de Pago:</div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total:</span>
                          <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>R$ {Number(ev.totalAmount || 0).toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Entrada (20%):</span>
                          <span className={`font-medium ${ev.depositPaid ? (darkMode ? 'text-green-400' : 'text-green-600') : (darkMode ? 'text-red-400' : 'text-red-600')}`}>R$ {(Number(ev.totalAmount || 0) * 0.2).toFixed(0)} {ev.depositPaid ? '✓' : ''}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Restante:</span>
                          <span className={`font-medium ${ev.finalPaymentPaid ? (darkMode ? 'text-green-400' : 'text-green-600') : (darkMode ? 'text-red-400' : 'text-red-600')}`}>R$ {(Number(ev.totalAmount || 0) * 0.8).toFixed(0)} {ev.finalPaymentPaid ? '✓' : ''}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex gap-2 mt-6">
                  <button onClick={() => {
                    const content = document.querySelector('.daily-list-print');
                    if (!content) return;
                    const printWindow = window.open('', '', 'width=800,height=600');
                    if (printWindow) {
                      printWindow.document.write(content.innerHTML);
                      printWindow.document.close();
                      printWindow.print();
                    }
                  }} className={`flex-1 border-2 px-4 py-2 rounded-lg inline-flex items-center justify-center gap-2 transition-colors ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-400 text-gray-700 hover:bg-gray-100'}`}>
                    <Printer size={18} /> Imprimir
                  </button>
                  <button onClick={async () => {
                    try {
                      const events = eventsByDay.get(expandedDay) || [];
                      const pdf = new jsPDF('p', 'mm', 'a4');
                      const pageHeight = pdf.internal.pageSize.getHeight();
                      const pageWidth = pdf.internal.pageSize.getWidth();
                      const margin = 15;
                      const contentWidth = pageWidth - 2 * margin;
                      let yPosition = margin;

                      const dateStr = new Date(expandedDay).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                      pdf.setFontSize(16);
                      pdf.setFont(undefined, 'bold');
                      pdf.text('Eventos del día', margin, yPosition);
                      yPosition += 10;

                      pdf.setFontSize(12);
                      pdf.setFont(undefined, 'normal');
                      pdf.text(dateStr, margin, yPosition);
                      yPosition += 12;

                      const loadImageAsBase64 = (url: string): Promise<string | null> => {
                        return new Promise((resolve) => {
                          const img = new Image();
                          img.crossOrigin = 'anonymous';
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                              ctx.drawImage(img, 0, 0);
                              resolve(canvas.toDataURL('image/jpeg', 0.7));
                            } else {
                              resolve(null);
                            }
                          };
                          img.onerror = () => resolve(null);
                          img.src = url;
                        });
                      };

                      for (const ev of events) {
                        if (yPosition > pageHeight - 30) {
                          pdf.addPage();
                          yPosition = margin;
                        }

                        pdf.setFontSize(11);
                        pdf.setFont(undefined, 'bold');
                        pdf.text(`${events.indexOf(ev) + 1}. ${ev.clientName || 'Evento sin nombre'}`, margin, yPosition);
                        yPosition += 7;

                        pdf.setFontSize(9);
                        pdf.setFont(undefined, 'normal');

                        const details = [
                          `Hora: ${ev.eventTime || '-'}`,
                          `Tipo: ${ev.eventType || '-'}`,
                          `Teléfono: ${ev.phone || (ev as any).formSnapshot?.phone || '-'}`,
                          `Duración: ${ev.packageDuration || '-'}`,
                          `Ubicación: ${ev.eventLocation || '-'}`
                        ];

                        details.forEach(detail => {
                          pdf.text(detail, margin + 3, yPosition);
                          yPosition += 5;
                        });

                        if (Array.isArray((ev as any).formSnapshot?.selectedDresses) && (ev as any).formSnapshot.selectedDresses.length > 0) {
                          yPosition += 3;
                          pdf.setFont(undefined, 'bold');
                          pdf.text('Vestidos:', margin + 3, yPosition);
                          yPosition += 8;

                          const selectedDressIds = (ev as any).formSnapshot.selectedDresses;
                          const selectedDressObjects = selectedDressIds
                            .map((id: string) => dressOptions.find(d => d.id === id))
                            .filter(Boolean);

                          const dressImagesPerRow = 3;
                          const dressWidth = (contentWidth - 6) / dressImagesPerRow - 2;
                          const dressHeight = dressWidth * 1.3;

                          let xOffset = margin + 3;
                          let dressCount = 0;

                          for (const dress of selectedDressObjects) {
                            if (yPosition + dressHeight > pageHeight - 20) {
                              pdf.addPage();
                              yPosition = margin;
                              xOffset = margin + 3;
                              dressCount = 0;
                            }

                            if (dressCount > 0 && dressCount % dressImagesPerRow === 0) {
                              xOffset = margin + 3;
                              yPosition += dressHeight + 5;
                            }

                            try {
                              if ((dress as any).image) {
                                const imageBase64 = await loadImageAsBase64((dress as any).image);
                                if (imageBase64) {
                                  pdf.addImage(imageBase64, 'JPEG', xOffset, yPosition, dressWidth, dressHeight);
                                }
                              }
                            } catch (e) {
                              console.warn('Error loading dress image:', e);
                            }

                            pdf.setFontSize(8);
                            pdf.setFont(undefined, 'normal');
                            const dressName = (dress as any).name || 'Vestido';
                            const wrappedName = pdf.splitTextToSize(dressName, dressWidth - 1);
                            let nameY = yPosition + dressHeight + 1;
                            wrappedName.forEach((line: string) => {
                              pdf.text(line, xOffset, nameY, { maxWidth: dressWidth - 1 });
                              nameY += 3;
                            });

                            xOffset += dressWidth + 2;
                            dressCount++;
                          }

                          yPosition += dressHeight + 12;
                        }

                        pdf.setFontSize(9);
                        pdf.setFont(undefined, 'bold');
                        pdf.text('Resumen de Pago:', margin + 3, yPosition);
                        yPosition += 5;

                        pdf.setFont(undefined, 'normal');
                        const paymentLines = [
                          `Total: R$ ${Number(ev.totalAmount || 0).toFixed(0)}`,
                          `Entrada (20%): R$ ${(Number(ev.totalAmount || 0) * 0.2).toFixed(0)} ${ev.depositPaid ? '✓ Pago' : 'Pendiente'}`,
                          `Restante: R$ ${(Number(ev.totalAmount || 0) * 0.8).toFixed(0)} ${ev.finalPaymentPaid ? '✓ Pago' : 'Pendiente'}`
                        ];

                        paymentLines.forEach(line => {
                          pdf.text(line, margin + 3, yPosition);
                          yPosition += 5;
                        });

                        yPosition += 8;
                      }

                      const dateKey = new Date(expandedDay).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
                      pdf.save(`eventos_${dateKey}.pdf`);
                    } catch (error) {
                      console.error('Error generating PDF:', error);
                      alert('Error al generar PDF. Intenta con Imprimir en su lugar.');
                    }
                  }} className={`flex-1 border-2 px-4 py-2 rounded-lg inline-flex items-center justify-center gap-2 transition-colors ${darkMode ? 'border-green-600 text-green-400 hover:bg-green-900 hover:bg-opacity-20' : 'border-green-500 text-green-600 hover:bg-green-100'}`}>
                    <Download size={18} /> PDF
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg">No hay eventos este día</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Event modal */}
      {selected && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-colors ${darkMode ? 'bg-black/50' : 'bg-white/50'}`} onClick={()=> setSelected(null)}>
          <div className={`rounded-xl w-full max-w-xl p-4 transition-colors ${darkMode ? 'bg-gray-900' : 'bg-white'}`} onClick={e=> e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className={`text-lg font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{selected.clientName}</div>
              <button onClick={()=> setSelected(null)} className={`transition-colors ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-900'}`}><X/></button>
            </div>
            <div className={`text-sm space-y-2 transition-colors ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <div className="flex items-center gap-2"><FileText size={16}/> <span>Tipo:</span> <strong>{selected.eventType || '-'}</strong></div>
              <div className="flex items-center gap-2"><IconCalendar size={16}/> <span>Fecha:</span> <strong>{selected.eventDate}</strong> <Clock size={16}/> <span>Hora:</span> <strong>{selected.eventTime || '-'}</strong></div>
              <div className="flex items-center gap-2"><MapPin size={16}/> <span>Ubicación:</span> <strong>{selected.eventLocation || '-'}</strong></div>
              <div className="flex items-center gap-2"><Phone size={16}/> <span>Tel.:</span> <strong>{selected.formSnapshot?.phone || '-'}</strong></div>
              {(() => { const calc = computeAmounts(selected); return (
                <div className="flex items-center gap-2"><DollarSign size={16}/> <span>Pago:</span> <strong>{selected.paymentMethod || '-'}</strong> • <span>Depósito:</span> <strong>{selected.depositPaid ? 'Pago' : `Pendiente (R$ ${calc.depositAmount.toFixed(0)})`}</strong> • <span>Saldo:</span> <strong>{selected.finalPaymentPaid ? 'Pago' : `Pendiente (R$ ${calc.remainingAmount.toFixed(0)})`}</strong></div>
              ); })()}

              {Array.isArray(selected.formSnapshot?.selectedDresses) && selected.formSnapshot!.selectedDresses.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">Vestidos seleccionados</div>
                  <div className="grid grid-cols-2 gap-2">
                    {selected.formSnapshot!.selectedDresses
                      .map((id: string) => dressOptions.find(d => d.id === id))
                      .filter(Boolean)
                      .map((dress: any) => (
                        <div key={(dress as any).id} className="flex items-center gap-2">
                          <div className="w-10 h-16 rounded overflow-hidden bg-gray-100 relative">
                            {(dress as any).image && <img src={(dress as any).image} alt={(dress as any).name} className="absolute inset-0 w-full h-full object-cover" />}
                          </div>
                          <div className="text-xs">
                            <div className="font-medium text-gray-800">{(dress as any).name}</div>
                            {(dress as any).color && <div className="text-[10px] text-gray-500">{(dress as any).color}</div>}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2"><span>Estado:</span>
                <select value={selected.status || (selected.eventCompleted && selected.finalPaymentPaid ? 'delivered' : (selected.depositPaid === false ? 'pending_payment' : 'booked'))} onChange={async e=>{ const st = e.target.value as ContractItem['status']; await handleSaveStatus(selected.id, st); setSelected(s=> s ? ({ ...s, status: st }) : s); }} className="px-2 py-1 border rounded-none text-sm">
                  <option value="pending_approval">Pendiente de aprobación</option>
                  <option value="booked">Contratado</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="pending_payment">Pendiente de pago</option>
                  <option value="delivered">Entregado</option>
                  <option value="cancelled">Cancelado</option>
                  <option value="released">Liberado</option>
                </select>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t">
              <div className="text-sm font-medium mb-3">Progreso del evento</div>
              <WorkflowStatusButtons
                depositPaid={selected.depositPaid}
                finalPaymentPaid={selected.finalPaymentPaid}
                isEditing={selected.isEditing}
                eventCompleted={selected.eventCompleted}
                onUpdate={async (updates) => {
                  try {
                    const baseId = selected.id.includes('__') ? selected.id.split('__')[0] : selected.id;
                    await updateDoc(doc(db, 'contracts', baseId), updates as any);
                    setSelected(s => s ? { ...s, ...updates } : s);
                    window.dispatchEvent(new CustomEvent('contractsUpdated'));
                    window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Estado actualizado', type: 'success' } }));
                  } catch (e) {
                    console.error('Error updating contract status:', e);
                    window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Error al actualizar', type: 'error' } }));
                  }
                }}
              />
            </div>

            <div className="mt-4 flex justify-end">
              <button onClick={()=> openContractPreview(selected)} className="px-4 py-2 rounded-md bg-blue-600 text-white inline-flex items-center gap-2 hover:bg-blue-700"><ExternalLink size={16}/> Ver Contrato</button>
            </div>
          </div>
        </div>
      )}

      {/* Add modal */}
      {adding && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-colors ${darkMode ? 'bg-black/50' : 'bg-white/50'}`} onClick={()=> setAdding(false)}>
          <div className={`rounded-xl w-full max-w-xl p-4 transition-colors ${darkMode ? 'bg-gray-900' : 'bg-white'}`} onClick={e=> e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className={`text-lg font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>Añadir evento</div>
              <button onClick={()=> setAdding(false)} className={`transition-colors ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-900'}`}><X/></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={`text-xs transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Cliente</label>
                <input value={addForm.clientName} onChange={e=> setAddForm((f:any)=> ({ ...f, clientName: e.target.value }))} className={`w-full px-3 py-2 border rounded-none transition-colors ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-300 text-gray-900'}`} />
              </div>
              <div>
                <label className={`text-xs transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tipo de evento</label>
                <input value={addForm.eventType} onChange={e=> setAddForm((f:any)=> ({ ...f, eventType: e.target.value }))} className={`w-full px-3 py-2 border rounded-none transition-colors ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-300 text-gray-900'}`} />
              </div>
              <div>
                <label className={`text-xs transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Fecha</label>
                <input type="date" value={addForm.eventDate} onChange={e=> setAddForm((f:any)=> ({ ...f, eventDate: e.target.value }))} className={`w-full px-3 py-2 border rounded-none transition-colors ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-300 text-gray-900'}`} />
              </div>
              <div>
                <label className={`text-xs transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Hora</label>
                <input type="time" value={addForm.eventTime} onChange={e=> setAddForm((f:any)=> ({ ...f, eventTime: e.target.value }))} className={`w-full px-3 py-2 border rounded-none transition-colors ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-300 text-gray-900'}`} />
              </div>
              <div className="md:col-span-2">
                <label className={`text-xs transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Ubicación</label>
                <input value={addForm.eventLocation} onChange={e=> setAddForm((f:any)=> ({ ...f, eventLocation: e.target.value }))} className={`w-full px-3 py-2 border rounded-none transition-colors ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-300 text-gray-900'}`} />
              </div>
              <div>
                <label className={`text-xs transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Método de pago</label>
                <select value={addForm.paymentMethod} onChange={e=> setAddForm((f:any)=> ({ ...f, paymentMethod: e.target.value }))} className={`w-full px-3 py-2 border rounded-none transition-colors ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-300 text-gray-900'}`}>
                  <option value="pix">PIX</option>
                  <option value="credit">Crédito</option>
                  <option value="cash">Efectivo</option>
                </select>
              </div>
              <div>
                <label className={`text-xs transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Desplazamiento (R$)</label>
                <input type="number" value={addForm.travelFee || 0} onChange={e=> setAddForm((f:any)=> ({ ...f, travelFee: e.target.value }))} className={`w-full px-3 py-2 border rounded-none transition-colors ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-300 text-gray-900'}`} />
              </div>
              <div>
                <label className={`text-xs transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total (R$)</label>
                <input type="number" value={addForm.totalAmount || 0} onChange={e=> setAddForm((f:any)=> ({ ...f, totalAmount: e.target.value }))} className={`w-full px-3 py-2 border rounded-none transition-colors ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-300 text-gray-900'}`} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=> setAdding(false)} className={`px-3 py-2 border rounded-none transition-colors ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}>Cancelar</button>
              <button onClick={handleAddEvent} className={`px-3 py-2 border-2 rounded-none transition-colors ${darkMode ? 'border-gray-500 bg-gray-800 text-white hover:bg-gray-700' : 'border-black bg-black text-white hover:bg-gray-900'}`}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Daily List modal */}
      {showDailyList && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-colors ${darkMode ? 'bg-black/50' : 'bg-white/50'}`} onClick={()=> setShowDailyList(null)}>
          <div className={`rounded-xl w-full max-w-2xl p-4 max-h-[80vh] overflow-y-auto transition-colors ${darkMode ? 'bg-gray-900' : 'bg-white'}`} onClick={e=> e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className={`text-lg font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>Eventos - {new Date(showDailyList).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
              <button onClick={()=> setShowDailyList(null)} className={`transition-colors ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-900'}`}>✕</button>
            </div>

            <div className="space-y-4">
              {(eventsByDay.get(showDailyList) || []).map((ev, idx) => (
                <div key={ev.id} className={`border rounded-lg p-4 ${getEventColor(ev).split(' ')[0]} bg-opacity-10`}>
                  <div className="font-semibold text-lg">{(idx + 1)}. {ev.clientName || 'Evento sin nombre'}</div>
                  <div className="grid grid-cols-2 gap-3 text-sm mt-2">
                    <div><span className="text-gray-600">Hora:</span> <span className="font-medium">{ev.eventTime || '-'}</span></div>
                    <div><span className="text-gray-600">Tipo:</span> <span className="font-medium">{ev.eventType || '-'}</span></div>
                    <div><span className="text-gray-600">Teléfono:</span> <span className="font-medium">{ev.phone || (ev as any).formSnapshot?.phone || '-'}</span></div>
                    <div><span className="text-gray-600">Duración:</span> <span className="font-medium">{ev.packageDuration || '-'}</span></div>
                    <div className="col-span-2"><span className="text-gray-600">Ubicación:</span> <span className="font-medium">{ev.eventLocation || '-'}</span></div>
                  </div>

                  {Array.isArray((ev as any).formSnapshot?.selectedDresses) && (ev as any).formSnapshot.selectedDresses.length > 0 ? (
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-sm font-medium mb-2">Vestidos:</div>
                      <div className="grid grid-cols-3 gap-2">
                        {(ev as any).formSnapshot.selectedDresses
                          .map((id: string) => {
                            const found = dressOptions.find(d => d.id === id);
                            return found;
                          })
                          .filter(Boolean)
                          .map((dress: any) => (
                            <div key={(dress as any).id} className="flex flex-col items-center">
                              <div className="w-16 h-20 rounded overflow-hidden bg-gray-100 mb-1 border border-gray-300">
                                {(dress as any).image ? (
                                  <img src={(dress as any).image} alt={(dress as any).name} className="w-full h-full object-cover" onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                  }} />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Sin foto</div>
                                )}
                              </div>
                              <span className="text-xs text-gray-700 text-center truncate w-full">{(dress as any).name}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 pt-3 border-t">
                    <div className="text-sm font-medium mb-2">Resumen de Pago:</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total:</span>
                        <span className="font-medium">R$ {Number(ev.totalAmount || 0).toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Entrada (20%):</span>
                        <span className={`font-medium ${ev.depositPaid ? 'text-green-600' : 'text-red-600'}`}>R$ {(Number(ev.totalAmount || 0) * 0.2).toFixed(0)} {ev.depositPaid ? '✓ Pago' : 'Pendiente'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Restante:</span>
                        <span className={`font-medium ${ev.finalPaymentPaid ? 'text-green-600' : 'text-red-600'}`}>R$ {(Number(ev.totalAmount || 0) * 0.8).toFixed(0)} {ev.finalPaymentPaid ? '✓ Pago' : 'Pendiente'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => {
                const dateStr = new Date(showDailyList).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                const content = document.querySelector('.daily-list-print');
                if (!content) return;
                const printWindow = window.open('', '', 'width=800,height=600');
                if (printWindow) {
                  printWindow.document.write(content.innerHTML);
                  printWindow.document.close();
                  printWindow.print();
                }
              }} className="border-2 border-black text-black px-4 py-2 rounded-none hover:bg-black hover:text-white inline-flex items-center gap-2">
                <Printer size={16} /> Imprimir
              </button>
              <button onClick={async () => {
                try {
                  const events = eventsByDay.get(showDailyList) || [];
                  const pdf = new jsPDF('p', 'mm', 'a4');

                  const pageHeight = pdf.internal.pageSize.getHeight();
                  const pageWidth = pdf.internal.pageSize.getWidth();
                  const margin = 15;
                  const contentWidth = pageWidth - 2 * margin;
                  let yPosition = margin;

                  const dateStr = new Date(showDailyList).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                  pdf.setFontSize(16);
                  pdf.setFont(undefined, 'bold');
                  pdf.text('Eventos del día', margin, yPosition);
                  yPosition += 10;

                  pdf.setFontSize(12);
                  pdf.setFont(undefined, 'normal');
                  pdf.text(dateStr, margin, yPosition);
                  yPosition += 12;

                  const loadImageAsBase64 = (url: string): Promise<string | null> => {
                    return new Promise((resolve) => {
                      const img = new Image();
                      img.crossOrigin = 'anonymous';
                      img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                          ctx.drawImage(img, 0, 0);
                          resolve(canvas.toDataURL('image/jpeg', 0.7));
                        } else {
                          resolve(null);
                        }
                      };
                      img.onerror = () => resolve(null);
                      img.src = url;
                    });
                  };

                  for (const ev of events) {
                    if (yPosition > pageHeight - 30) {
                      pdf.addPage();
                      yPosition = margin;
                    }

                    pdf.setFontSize(11);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(`${events.indexOf(ev) + 1}. ${ev.clientName || 'Evento sin nombre'}`, margin, yPosition);
                    yPosition += 7;

                    pdf.setFontSize(9);
                    pdf.setFont(undefined, 'normal');

                    const details = [
                      `Hora: ${ev.eventTime || '-'}`,
                      `Tipo: ${ev.eventType || '-'}`,
                      `Teléfono: ${ev.phone || (ev as any).formSnapshot?.phone || '-'}`,
                      `Duración: ${ev.packageDuration || '-'}`,
                      `Ubicación: ${ev.eventLocation || '-'}`
                    ];

                    details.forEach(detail => {
                      pdf.text(detail, margin + 3, yPosition);
                      yPosition += 5;
                    });

                    if (Array.isArray((ev as any).formSnapshot?.selectedDresses) && (ev as any).formSnapshot.selectedDresses.length > 0) {
                      yPosition += 3;
                      pdf.setFont(undefined, 'bold');
                      pdf.text('Vestidos:', margin + 3, yPosition);
                      yPosition += 8;

                      const selectedDressIds = (ev as any).formSnapshot.selectedDresses;
                      const selectedDressObjects = selectedDressIds
                        .map((id: string) => dressOptions.find(d => d.id === id))
                        .filter(Boolean);

                      const dressImagesPerRow = 3;
                      const dressWidth = (contentWidth - 6) / dressImagesPerRow - 2;
                      const dressHeight = dressWidth * 1.3;

                      let xOffset = margin + 3;
                      let dressCount = 0;

                      for (const dress of selectedDressObjects) {
                        if (yPosition + dressHeight > pageHeight - 20) {
                          pdf.addPage();
                          yPosition = margin;
                          xOffset = margin + 3;
                          dressCount = 0;
                        }

                        if (dressCount > 0 && dressCount % dressImagesPerRow === 0) {
                          xOffset = margin + 3;
                          yPosition += dressHeight + 5;
                        }

                        try {
                          if ((dress as any).image) {
                            const imageBase64 = await loadImageAsBase64((dress as any).image);
                            if (imageBase64) {
                              pdf.addImage(imageBase64, 'JPEG', xOffset, yPosition, dressWidth, dressHeight);
                            }
                          }
                        } catch (e) {
                          console.warn('Error loading dress image:', e);
                        }

                        pdf.setFontSize(8);
                        pdf.setFont(undefined, 'normal');
                        const dressName = (dress as any).name || 'Vestido';
                        const wrappedName = pdf.splitTextToSize(dressName, dressWidth - 1);
                        let nameY = yPosition + dressHeight + 1;
                        wrappedName.forEach((line: string) => {
                          pdf.text(line, xOffset, nameY, { maxWidth: dressWidth - 1 });
                          nameY += 3;
                        });

                        xOffset += dressWidth + 2;
                        dressCount++;
                      }

                      yPosition += dressHeight + 12;
                    }

                    pdf.setFontSize(9);
                    pdf.setFont(undefined, 'bold');
                    pdf.text('Resumen de Pago:', margin + 3, yPosition);
                    yPosition += 5;

                    pdf.setFont(undefined, 'normal');
                    const paymentLines = [
                      `Total: R$ ${Number(ev.totalAmount || 0).toFixed(0)}`,
                      `Entrada (20%): R$ ${(Number(ev.totalAmount || 0) * 0.2).toFixed(0)} ${ev.depositPaid ? '✓ Pago' : 'Pendiente'}`,
                      `Restante: R$ ${(Number(ev.totalAmount || 0) * 0.8).toFixed(0)} ${ev.finalPaymentPaid ? '✓ Pago' : 'Pendiente'}`
                    ];

                    paymentLines.forEach(line => {
                      pdf.text(line, margin + 3, yPosition);
                      yPosition += 5;
                    });

                    yPosition += 8;
                  }

                  const dateKey = new Date(showDailyList).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
                  pdf.save(`eventos_${dateKey}.pdf`);
                } catch (error) {
                  console.error('Error generating PDF:', error);
                  alert('Error al generar PDF. Intenta con Imprimir en su lugar.');
                }
              }} className="border-2 border-green-600 text-green-600 px-4 py-2 rounded-none hover:bg-green-600 hover:text-white inline-flex items-center gap-2">
                <Download size={16} /> PDF
              </button>
            </div>

            <div className="daily-list-print hidden">
              <h1 style={{ textAlign: 'center', marginBottom: '20px' }}>Eventos del día</h1>
              <p style={{ textAlign: 'center', marginBottom: '20px' }}>{new Date(showDailyList).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #000' }}>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #000' }}>Hora</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #000' }}>Cliente</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #000' }}>Tipo</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #000' }}>Teléfono</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #000' }}>Ubicación</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #000' }}>Vestidos</th>
                  </tr>
                </thead>
                <tbody>
                  {(eventsByDay.get(showDailyList) || []).map((ev) => (
                    <tr key={ev.id} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '8px' }}>{ev.eventTime || '-'}</td>
                      <td style={{ padding: '8px' }}>{ev.clientName || '-'}</td>
                      <td style={{ padding: '8px' }}>{ev.eventType || '-'}</td>
                      <td style={{ padding: '8px' }}>{ev.phone || (ev as any).formSnapshot?.phone || '-'}</td>
                      <td style={{ padding: '8px' }}>{ev.eventLocation || '-'}</td>
                      <td style={{ padding: '8px' }}>
                        {Array.isArray((ev as any).formSnapshot?.selectedDresses) && (ev as any).formSnapshot.selectedDresses.length > 0
                          ? (ev as any).formSnapshot.selectedDresses
                              .map((id: string) => dressOptions.find(d => d.id === id))
                              .filter(Boolean)
                              .map((d: any) => (d as any).name)
                              .join(', ')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="daily-list-pdf hidden" style={{ padding: '20px', backgroundColor: '#fff' }}>
              <h1 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '24px', fontWeight: 'bold' }}>Eventos del día</h1>
              <p style={{ textAlign: 'center', marginBottom: '20px', fontSize: '14px', color: '#666' }}>{new Date(showDailyList).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

              {(eventsByDay.get(showDailyList) || []).map((ev, idx) => (
                <div key={ev.id} style={{ marginBottom: '30px', pageBreakInside: 'avoid', borderTop: '1px solid #ddd', paddingTop: '15px' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
                    {idx + 1}. {ev.clientName || 'Evento sin nombre'}
                  </h2>

                  <table style={{ width: '100%', marginBottom: '15px', fontSize: '12px' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '4px', paddingRight: '20px' }}><strong>Hora:</strong> {ev.eventTime || '-'}</td>
                        <td style={{ padding: '4px' }}><strong>Tipo:</strong> {ev.eventType || '-'}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px', paddingRight: '20px' }}><strong>Teléfono:</strong> {ev.phone || (ev as any).formSnapshot?.phone || '-'}</td>
                        <td style={{ padding: '4px' }}><strong>Duración:</strong> {ev.packageDuration || '-'}</td>
                      </tr>
                      <tr>
                        <td colSpan={2} style={{ padding: '4px' }}><strong>Ubicación:</strong> {ev.eventLocation || '-'}</td>
                      </tr>
                    </tbody>
                  </table>

                  {Array.isArray((ev as any).formSnapshot?.selectedDresses) && (ev as any).formSnapshot.selectedDresses.length > 0 && (
                    <div style={{ marginBottom: '15px' }}>
                      <h3 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>Vestidos:</h3>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {(ev as any).formSnapshot.selectedDresses
                          .map((id: string) => {
                            const found = dressOptions.find(d => d.id === id);
                            return found;
                          })
                          .filter(Boolean)
                          .map((dress: any) => (
                            <div key={(dress as any).id} style={{ textAlign: 'center' }}>
                              {(dress as any).image ? (
                                <img src={(dress as any).image} alt={(dress as any).name} style={{ width: '60px', height: '80px', objectFit: 'cover', marginBottom: '4px', border: '1px solid #ccc' }} />
                              ) : (
                                <div style={{ width: '60px', height: '80px', backgroundColor: '#f0f0f0', marginBottom: '4px', border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#999' }}>Sin foto</div>
                              )}
                              <div style={{ fontSize: '10px', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(dress as any).name}</div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: '10px', fontSize: '12px', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                    <h3 style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>Resumen de Pago:</h3>
                    <table style={{ width: '100%' }}>
                      <tbody>
                        <tr>
                          <td style={{ padding: '2px' }}>Total:</td>
                          <td style={{ textAlign: 'right', padding: '2px', fontWeight: 'bold' }}>R$ {Number(ev.totalAmount || 0).toFixed(0)}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '2px' }}>Entrada (20%):</td>
                          <td style={{ textAlign: 'right', padding: '2px', fontWeight: 'bold', color: ev.depositPaid ? 'green' : 'red' }}>R$ {(Number(ev.totalAmount || 0) * 0.2).toFixed(0)} {ev.depositPaid ? '✓ Pago' : 'Pendiente'}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '2px' }}>Restante:</td>
                          <td style={{ textAlign: 'right', padding: '2px', fontWeight: 'bold', color: ev.finalPaymentPaid ? 'green' : 'red' }}>R$ {(Number(ev.totalAmount || 0) * 0.8).toFixed(0)} {ev.finalPaymentPaid ? '✓ Pago' : 'Pendiente'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-gray-500">Cargando���</div>}
    </div>
  );
};

export default AdminCalendar;
