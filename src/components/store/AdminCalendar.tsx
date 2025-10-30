'use client';

import { db } from '../../utils/firebaseClient';
import { addDoc, collection, doc, getDocs, orderBy, query, updateDoc, deleteDoc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Plus, X, ExternalLink, MapPin, Phone, Calendar as IconCalendar, Clock, DollarSign, FileText, Download, Printer, RefreshCw, Trash2, Eye, EyeOff, Edit, Percent } from 'lucide-react';
import { parseDurationToMinutes } from '../../utils/calendar';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { WorkflowStatusButtons } from './WorkflowStatusButtons';
import { fetchPackages, DBPackage } from '../../utils/packagesService';
import { fetchCoupons, DBCoupon, isCouponActiveNow } from '../../utils/couponsService';
import { useState, useEffect, useMemo, useCallback } from 'react';

interface ContractItem {
  id: string;
  clientName: string;
  clientEmail: string;
  eventType?: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  packageDuration?: string;
  packageTitle?: string;
  paymentMethod?: string;
  depositPaid?: boolean;
  finalPaymentPaid?: boolean;
  eventCompleted?: boolean;
  isEditing?: boolean;
  status?: 'pending' | 'booked' | 'delivered' | 'cancelled' | 'pending_payment' | 'confirmed' | 'pending_approval' | 'released';
  pdfUrl?: string | null;
  phone?: string;
  clientPhone?: string;
  clientCPF?: string;
  clientRG?: string;
  clientAddress?: string;
  signatureTime?: string;
  formSnapshot?: any;
  totalAmount?: number;
  travelFee?: number;
  contractDate?: string;
  storeItems?: any[];
  services?: any[];
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

function getEventStatus(c: ContractItem): 'completed' | 'pending' {
  const status = (() => {
    if (c.status) return c.status;
    if (c.eventCompleted && c.finalPaymentPaid) return 'delivered' as const;
    if (c.depositPaid === false) return 'pending_payment' as const;
    return 'booked' as const;
  })();
  return (status === 'delivered' || status === 'released') ? 'completed' : 'pending';
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
  const [selectedEvent, setSelectedEvent] = useState<ContractItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<'deposit_pending' | 'editing' | 'completed' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [deleteConfirmEvent, setDeleteConfirmEvent] = useState<ContractItem | null>(null);
  const [editingEvent, setEditingEvent] = useState<ContractItem | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRevenue, setShowRevenue] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [packages, setPackages] = useState<DBPackage[]>([]);
  const [coupons, setCoupons] = useState<DBCoupon[]>([]);
  const [appliedCoupons, setAppliedCoupons] = useState<string[]>([]);
  const [showCouponModal, setShowCouponModal] = useState(false);

  // Add / Create flow states
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [contactForm, setContactForm] = useState<{ name: string; email: string; phone: string }>({ name: '', email: '', phone: '' });

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
            };
          });
        }
        return [c];
      });
      setEvents(expanded);
    } catch (e) {
      console.error('Error loading contracts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const updateHandler = () => load();
    const deleteHandler = (event: any) => {
      const contractId = event.detail?.contractId;
      if (contractId) {
        setEvents(prev => prev.filter(e => {
          const id = String(e.id || '').split('__')[0];
          return id !== contractId;
        }));
      }
    };

    window.addEventListener('contractsUpdated', updateHandler as EventListener);
    window.addEventListener('contractDeleted', deleteHandler as EventListener);

    return () => {
      window.removeEventListener('contractsUpdated', updateHandler as EventListener);
      window.removeEventListener('contractDeleted', deleteHandler as EventListener);
    };
  }, []);

  useEffect(() => {
    const loadPackagesAndCoupons = async () => {
      try {
        const pkgs = await fetchPackages();
        setPackages(pkgs);
      } catch (e) {
        console.error('Error loading packages:', e);
      }
      try {
        const cps = await fetchCoupons();
        setCoupons(cps.filter(c => isCouponActiveNow(c)));
      } catch (e) {
        console.error('Error loading coupons:', e);
      }
    };
    loadPackagesAndCoupons();
  }, []);

  const calculateTotalWithDiscount = () => {
    if (!selectedEvent) return 0;
    let total = Number(selectedEvent.totalAmount || 0);
    appliedCoupons.forEach(couponId => {
      const coupon = coupons.find(c => c.id === couponId);
      if (coupon) {
        switch (coupon.discountType) {
          case 'percentage':
            total -= total * ((coupon.discountValue || 0) / 100);
            break;
          case 'fixed':
            total -= (coupon.discountValue || 0);
            break;
          case 'full':
            total = 0;
            break;
        }
      }
    });
    return Math.max(0, total);
  };

  const calculateDepositWithDiscount = () => {
    const total = calculateTotalWithDiscount();
    return total * 0.2;
  };

  const calculateRemainingWithDiscount = () => {
    const total = calculateTotalWithDiscount();
    return total * 0.8;
  };

  // Helpers to compute totals from a base amount (used for add modal)
  const computeTotalFromBase = (baseAmount: number) => {
    let total = Number(baseAmount || 0);
    appliedCoupons.forEach(couponId => {
      const coupon = coupons.find(c => c.id === couponId);
      if (coupon) {
        switch (coupon.discountType) {
          case 'percentage':
            total -= total * ((coupon.discountValue || 0) / 100);
            break;
          case 'fixed':
            total -= (coupon.discountValue || 0);
            break;
          case 'full':
            total = 0;
            break;
        }
      }
    });
    return Math.max(0, total);
  };

  const computeDepositFromBase = (base: number) => computeTotalFromBase(base) * 0.2;
  const computeRemainingFromBase = (base: number) => computeTotalFromBase(base) * 0.8;

  const searchResults = useMemo(() => {
    if (!filterPhone.trim()) return [];
    return events.filter(ev => {
      const d = toLocalDate(ev.eventDate);
      if (!d) return false;

      let phoneMatch = false;
      let nameMatch = false;
      const phoneSource = ev.phone || (ev as any).formSnapshot?.phone || '';
      const onlyDigits = (v: string) => String(v || '').replace(/\D/g, '');
      phoneMatch = onlyDigits(phoneSource).includes(onlyDigits(filterPhone));
      const clientName = ev.clientName || '';
      nameMatch = clientName.toLowerCase().includes(filterPhone.toLowerCase());

      return phoneMatch || nameMatch;
    }).slice(0, 8);
  }, [events, filterPhone]);

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
      let nameMatch = true;
      if (filterPhone.trim()) {
        const phoneSource = ev.phone || (ev as any).formSnapshot?.phone || '';
        const onlyDigits = (v: string) => String(v || '').replace(/\D/g, '');
        phoneMatch = onlyDigits(phoneSource).includes(onlyDigits(filterPhone));
        const clientName = ev.clientName || '';
        nameMatch = clientName.toLowerCase().includes(filterPhone.toLowerCase());
      }

      return monthMatch && yearMatch && statusMatch && (phoneMatch || nameMatch);
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
      list.sort((a, b) => toMinutes(a.eventTime) - toMinutes(b.eventTime));
    }
    return map;
  }, [filteredEvents]);

  const miniMonthDays = useMemo(() => {
    const y = current.y;
    const m = current.m;
    const start = startOfMonth(y, m);
    const end = endOfMonth(y, m);
    const days = [];
    for (let i = 0; i < start.getDay(); i++) days.push({ date: null });
    for (let d = 1; d <= end.getDate(); d++) days.push({ date: new Date(y, m, d) });
    return days;
  }, [current]);

  const monthDays = useMemo(() => {
    const y = filterYear;
    const m = filterMonth;
    const start = startOfMonth(y, m);
    const end = endOfMonth(y, m);
    const days = [];
    for (let i = 0; i < start.getDay(); i++) days.push({ date: null });
    for (let d = 1; d <= end.getDate(); d++) days.push({ date: new Date(y, m, d) });
    return days;
  }, [filterYear, filterMonth]);

  const eventSummary = useMemo(() => {
    const pending = filteredEvents.filter(e => e.depositPaid !== true).length;
    const editing = filteredEvents.filter(e => e.depositPaid === true && e.finalPaymentPaid === true && e.eventCompleted !== true).length;
    const completed = filteredEvents.filter(e => e.depositPaid === true && e.finalPaymentPaid === true && e.eventCompleted === true).length;
    const allTotal = filteredEvents.length;
    const totalRevenue = filteredEvents
      .filter(e => e.depositPaid === true && e.finalPaymentPaid === true && e.eventCompleted === true)
      .reduce((sum, e) => sum + (Number(e.totalAmount || 0)), 0);
    return { pending, editing, completed, allTotal, totalRevenue };
  }, [filteredEvents]);

  const prevMonth = () => setCurrent(c => ({
    ...c,
    m: c.m === 0 ? 11 : c.m - 1,
    y: c.m === 0 ? c.y - 1 : c.y
  }));

  const nextMonth = () => setCurrent(c => ({
    ...c,
    m: c.m === 11 ? 0 : c.m + 1,
    y: c.m === 11 ? c.y + 1 : c.y
  }));

  const goToday = () => {
    const now = new Date();
    setFilterMonth(now.getMonth());
    setFilterYear(now.getFullYear());
    setCurrent({ y: now.getFullYear(), m: now.getMonth() });
  };

  const updateEventProgress = async (field: 'depositPaid' | 'finalPaymentPaid' | 'eventCompleted', value: boolean) => {
    if (!selectedEvent) return;

    try {
      const baseId = String(selectedEvent.id || '').split('__')[0] || selectedEvent.id;
      const updates: any = { [field]: value };

      await updateDoc(doc(db, 'contracts', baseId), updates);

      const updatedEvent = { ...selectedEvent, [field]: value };
      setSelectedEvent(updatedEvent);
      setEvents(prev => prev.map(e => {
        const eId = String(e.id || '').split('__')[0];
        return eId === baseId ? { ...e, [field]: value } : e;
      }));

      window.dispatchEvent(new CustomEvent('contractsUpdated'));

      window.dispatchEvent(new CustomEvent('adminToast', {
        detail: { message: 'Progreso actualizado correctamente', type: 'success' }
      }));
    } catch (e) {
      console.error('Error updating event progress:', e);
      window.dispatchEvent(new CustomEvent('adminToast', {
        detail: { message: 'Error al actualizar el progreso', type: 'error' }
      }));
    }
  };

  const deleteEvent = (ev: ContractItem) => {
    setDeleteConfirmEvent(ev);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmEvent) return;

    setIsDeleting(true);
    try {
      const baseId = String(deleteConfirmEvent.id || '').split('__')[0] || deleteConfirmEvent.id;
      await deleteDoc(doc(db, 'contracts', baseId));

      setEvents(prev => prev.filter(e => {
        const id = String(e.id || '').split('__')[0];
        return id !== baseId;
      }));

      setDeleteConfirmEvent(null);
      setSelectedEvent(null);

      try {
        window.dispatchEvent(new CustomEvent('contractDeleted', { detail: { contractId: baseId } }));
        window.dispatchEvent(new CustomEvent('contractsUpdated'));
      } catch {}

      window.dispatchEvent(new CustomEvent('adminToast', {
        detail: { message: 'Evento eliminado correctamente', type: 'success' }
      }));
    } catch (e) {
      console.error('Error deleting event:', e);
      window.dispatchEvent(new CustomEvent('adminToast', {
        detail: { message: 'Error al eliminar el evento', type: 'error' }
      }));
    } finally {
      setIsDeleting(false);
    }
  };

  const saveEventChanges = async () => {
    if (!editingEvent) return;

    try {
      const baseId = String(editingEvent.id || '').split('__')[0] || editingEvent.id;
      const updates = {
        clientName: editForm.clientName || editingEvent.clientName,
        clientEmail: editForm.clientEmail || editingEvent.clientEmail,
        phone: editForm.phone || editingEvent.phone,
        eventType: editForm.eventType || editingEvent.eventType,
        eventDate: editForm.eventDate || editingEvent.eventDate,
        eventTime: editForm.eventTime || editingEvent.eventTime,
        eventLocation: editForm.eventLocation || editingEvent.eventLocation,
        totalAmount: editForm.totalAmount ? Number(editForm.totalAmount) : editingEvent.totalAmount,
        travelFee: editForm.travelFee ? Number(editForm.travelFee) : editingEvent.travelFee,
        paymentMethod: editForm.paymentMethod || editingEvent.paymentMethod,
        packageTitle: editForm.packageTitle || editingEvent.packageTitle,
      };

      await updateDoc(doc(db, 'contracts', baseId), updates);

      const updated = { ...editingEvent, ...updates };
      setEvents(prev => prev.map(e => e.id === editingEvent.id ? updated : e));
      setSelectedEvent(updated);
      setEditingEvent(null);
      setEditForm({});
      setAppliedCoupons([]);

      window.dispatchEvent(new CustomEvent('contractsUpdated'));
      window.dispatchEvent(new CustomEvent('adminToast', {
        detail: { message: 'Evento actualizado correctamente', type: 'success' }
      }));
    } catch (e) {
      console.error('Error updating event:', e);
      window.dispatchEvent(new CustomEvent('adminToast', {
        detail: { message: 'Error al actualizar el evento', type: 'error' }
      }));
    }
  };

  // Save a newly created event (contract) from the add-event modal
  const saveNewEvent = async () => {
    try {
      // determine package price
      let baseAmount = Number(addForm.totalAmount || 0);
      if (addForm.packageId) {
        const pkg = packages.find(p => p.id === addForm.packageId);
        if (pkg) baseAmount = Number(pkg.price || baseAmount);
      }

      const totalWithDiscount = computeTotalFromBase(baseAmount);

      const payload: any = {
        clientName: addForm.clientName || 'Sin nombre',
        clientEmail: addForm.clientEmail || '',
        eventType: addForm.eventType || 'Evento',
        eventDate: addForm.eventDate || '',
        eventTime: addForm.eventTime || '00:00',
        eventLocation: addForm.eventLocation || '',
        phone: addForm.phone || '',
        paymentMethod: addForm.paymentMethod || 'pix',
        depositPaid: false,
        finalPaymentPaid: false,
        eventCompleted: false,
        isEditing: false,
        createdAt: new Date().toISOString(),
        totalAmount: Number(totalWithDiscount) || 0,
        travelFee: Number(addForm.travelFee || 0) || 0,
        status: 'booked' as const,
        packageId: addForm.packageId || null,
        packageTitle: addForm.packageTitle || '',
        appliedCoupons: appliedCoupons.slice(),
      };

      const ref = await addDoc(collection(db, 'contracts'), payload);

      // reload events and reset states
      await load();
      setShowAddEventModal(false);
      setAdding(false);
      setAddForm({ clientName: '', eventType: '', eventDate: '', eventTime: '', eventLocation: '', paymentMethod: 'pix' });
      setAppliedCoupons([]);

      window.dispatchEvent(new CustomEvent('contractsUpdated'));
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Evento creado correctamente', type: 'success' } }));
    } catch (e) {
      console.error('Error creating event:', e);
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Error al crear el evento', type: 'error' } }));
    }
  };

  // Save a newly created contact
  const saveNewContact = async () => {
    try {
      const payload = {
        name: contactForm.name || 'Sin nombre',
        email: contactForm.email || '',
        phone: contactForm.phone || '',
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'contacts'), payload);
      setShowAddContactModal(false);
      setContactForm({ name: '', email: '', phone: '' });
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Contacto creado correctamente', type: 'success' } }));
    } catch (e) {
      console.error('Error creating contact:', e);
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Error al crear el contacto', type: 'error' } }));
    }
  };

  const syncCalendarWithContracts = async () => {
    setSyncing(true);
    try {
      const collectionNames = ['bookings', 'meetings', 'events'];
      let createdCount = 0;

      const contractsSnap = await getDocs(collection(db, 'contracts'));
      const existingContracts = contractsSnap.docs.map(d => d.id);

      for (const collectionName of collectionNames) {
        try {
          const snap = await getDocs(collection(db, collectionName));
          const eventsList = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

          for (const event of eventsList) {
            const contractExists = existingContracts.some(cId => {
              const contractData = contractsSnap.docs.find(d => d.id === cId)?.data();
              return contractData?.eventId === event.id || contractData?.originalEventId === event.id || contractData?.bookingId === event.id;
            });

            if (!contractExists && event.clientName && event.eventDate) {
              const payload: any = {
                clientName: event.clientName,
                clientEmail: event.clientEmail || '',
                eventType: event.eventType || 'Evento',
                eventDate: event.eventDate,
                eventTime: event.eventTime || '00:00',
                eventLocation: event.eventLocation || '',
                phone: event.phone || '',
                paymentMethod: event.paymentMethod || 'pix',
                depositPaid: false,
                finalPaymentPaid: false,
                eventCompleted: false,
                isEditing: false,
                createdAt: new Date().toISOString(),
                totalAmount: Number(event.totalAmount || 0) || 0,
                travelFee: Number(event.travelFee || 0) || 0,
                status: 'booked' as const,
                bookingId: event.id,
                originalEventId: event.id,
              };

              await addDoc(collection(db, 'contracts'), payload);
              createdCount++;
            }
          }
        } catch (e) {
          continue;
        }
      }

      if (createdCount > 0) {
        window.dispatchEvent(new CustomEvent('adminToast', {
          detail: { message: `${createdCount} contrato(s) creado(s)`, type: 'success' }
        }));
        await load();
      } else {
        window.dispatchEvent(new CustomEvent('adminToast', {
          detail: { message: 'No hay eventos sin contrato', type: 'info' }
        }));
      }
    } catch (e) {
      console.error('Error syncing calendar:', e);
      window.dispatchEvent(new CustomEvent('adminToast', {
        detail: { message: 'Error al sincronizar', type: 'error' }
      }));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={`flex h-full w-full transition-colors relative ${darkMode ? 'bg-black' : 'bg-white'}`}>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-10 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <div className={`fixed md:static md:w-64 h-full z-20 border-r p-4 flex flex-col overflow-y-auto flex-shrink-0 transition-all duration-300 transform ${
        sidebarOpen ? 'translate-x-0' : 'max-md:-translate-x-full'
      } w-64 ${darkMode ? 'bg-black border-gray-800' : 'bg-white border-gray-200'}`}>
        <div className="mb-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <button onClick={prevMonth} className={`p-2 rounded-full transition-colors flex-shrink-0 ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}><ChevronLeft size={16}/></button>
            <div className={`text-sm font-semibold text-center flex-1 transition-colors ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {new Date(current.y, current.m, 1).toLocaleString('es', { month: 'short', year: '2-digit' })}
            </div>
            <button onClick={nextMonth} className={`p-2 rounded-full transition-colors flex-shrink-0 ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}><ChevronRight size={16}/></button>
          </div>
          <div className={`grid grid-cols-7 gap-px p-2 rounded lg:rounded max-lg:rounded transition-colors ${darkMode ? 'bg-black' : 'bg-gray-100 max-lg:bg-white'}`}>
            {['D','L','M','X','J','V','S'].map(d => <div key={d} className={`text-center text-xs font-medium py-1 transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>{d}</div>)}
            {miniMonthDays.map((cell, idx) => {
              const isToday = cell.date && new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate()).getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
              const key = cell.date ? `${cell.date.getFullYear()}-${String(cell.date.getMonth()+1).padStart(2,'0')}-${String(cell.date.getDate()).padStart(2,'0')}` : `empty-${idx}`;
              const hasEvents = cell.date ? (eventsByDay.get(key) || []).length > 0 : false;
              return (
                <button key={key} onClick={() => { if (cell.date) { setFilterMonth(cell.date.getMonth()); setFilterYear(cell.date.getFullYear()); setSidebarOpen(false); } }} className={`text-center text-xs py-1 rounded transition-colors font-medium ${isToday ? 'bg-secondary text-black' : hasEvents ? (darkMode ? 'bg-blue-600 text-white' : 'bg-blue-200 text-blue-800') : (darkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-200')}`}>
                  {cell.date ? cell.date.getDate() : ''}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setStatusFilter('deposit_pending'); setSidebarOpen(false); }} className={`p-3 rounded-lg border transition-colors cursor-pointer hover:shadow-md ${darkMode ? 'bg-gray-900 border-gray-800 hover:bg-gray-800' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
              <div className={`text-xs transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>Pendientes Depósito</div>
              <div className={`text-2xl font-bold transition-colors ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{eventSummary.pending}</div>
            </button>
            <button onClick={() => { setStatusFilter('editing'); setSidebarOpen(false); }} className={`p-3 rounded-lg border transition-colors cursor-pointer hover:shadow-md ${darkMode ? 'bg-gray-900 border-gray-800 hover:bg-gray-800' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
              <div className={`text-xs transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>Por editar</div>
              <div className={`text-2xl font-bold transition-colors ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>{eventSummary.editing}</div>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setStatusFilter('completed'); setSidebarOpen(false); }} className={`p-3 rounded-lg border transition-colors cursor-pointer hover:shadow-md ${darkMode ? 'bg-gray-900 border-gray-800 hover:bg-gray-800' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
              <div className={`text-xs transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>Eventos Finalizados</div>
              <div className={`text-2xl font-bold transition-colors ${darkMode ? 'text-green-400' : 'text-green-600'}`}>{eventSummary.completed}</div>
            </button>
            <div className={`p-3 rounded-lg border transition-colors flex flex-col ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
              <div className={`text-xs transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>Eventos Totales</div>
              <div className={`text-2xl font-bold transition-colors mx-auto ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>{eventSummary.allTotal}</div>
            </div>
          </div>
          <div className={`p-4 rounded-lg border transition-colors flex items-center justify-between ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex-1">
              <div className={`text-xs transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>Ingresos del Mes</div>
              <div className={`text-3xl font-bold transition-colors ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                {showRevenue ? `R$ ${eventSummary.totalRevenue.toFixed(0)}` : '****'}
              </div>
            </div>
            <button
              onClick={() => setShowRevenue(!showRevenue)}
              className={`p-2 rounded-full transition-colors ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}
              title={showRevenue ? 'Ocultar monto' : 'Mostrar monto'}
            >
              {showRevenue ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          </div>
        </div>
      </div>

      <div className={`flex-1 flex flex-col overflow-hidden transition-colors ${darkMode ? 'bg-black' : 'bg-white'}`}>
        <div className={`px-4 py-[3px] border-b flex items-center justify-between flex-shrink-0 transition-colors ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`md:hidden p-2 rounded-full transition-colors ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}
              title="Mostrar calendario"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
            <button onClick={() => {
              if (filterMonth === 0) {
                setFilterYear(y => y - 1);
                setFilterMonth(11);
              } else {
                setFilterMonth(m => m - 1);
              }
              setCurrent(c => { const y = c.m === 0 ? c.y - 1 : c.y; const m = c.m === 0 ? 11 : c.m - 1; return { y, m }; });
            }} className={`p-2 rounded-full transition-colors flex-shrink-0 ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}><ChevronLeft size={18}/></button>
            <div className={`text-base md:text-lg font-semibold transition-colors whitespace-nowrap ${darkMode ? 'text-white' : 'text-black'}`}>
              {new Date(filterYear, filterMonth, 1).toLocaleString('es', { month: 'long', year: 'numeric' })}
            </div>
            <button onClick={() => {
              if (filterMonth === 11) {
                setFilterYear(y => y + 1);
                setFilterMonth(0);
              } else {
                setFilterMonth(m => m + 1);
              }
              setCurrent(c => { const y = c.m === 11 ? c.y + 1 : c.y; const m = c.m === 11 ? 0 : c.m + 1; return { y, m }; });
            }} className={`p-2 rounded-full transition-colors flex-shrink-0 ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}><ChevronRight size={18}/></button>
          </div>
          <div className="flex items-center gap-2 relative">
            <div className="relative flex-shrink-0">
              <input
                type="text"
                value={filterPhone}
                onChange={e => setFilterPhone(e.target.value)}
                placeholder="Filtrar por"
                className={`px-3 py-1.5 border rounded-lg text-sm transition-colors min-w-[200px] ${darkMode ? 'border-gray-700 bg-gray-800 text-gray-300 placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'}`}
              />
              {searchResults.length > 0 && (
                <div className={`absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg z-50 max-h-64 overflow-y-auto transition-colors ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}>
                  {searchResults.map((ev) => {
                    const eventDate = new Date(ev.eventDate + 'T00:00:00');
                    const dateStr = eventDate.toLocaleDateString('es', { month: 'short', day: 'numeric', year: '2-digit' });
                    return (
                      <button
                        key={ev.id}
                        onClick={() => {
                          const d = toLocalDate(ev.eventDate);
                          if (d) {
                            setFilterMonth(d.getMonth());
                            setFilterYear(d.getFullYear());
                            setCurrent({ y: d.getFullYear(), m: d.getMonth() });
                          }
                          setSelectedEvent(ev);
                          setFilterPhone('');
                        }}
                        className={`w-full text-left px-3 py-2 transition-colors border-b last:border-b-0 ${darkMode ? 'hover:bg-gray-800 text-gray-200' : 'hover:bg-gray-50 text-gray-900'}`}
                      >
                        <div className="font-medium text-sm">{ev.clientName}</div>
                        <div className={`text-xs mt-0.5 transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {dateStr} {ev.eventTime ? `- ${ev.eventTime}` : ''}
                        </div>
                        {ev.eventLocation && (
                          <div className={`text-xs mt-0.5 transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            {ev.eventLocation}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button onClick={goToday} className="px-4 py-0.5 rounded-full bg-gray-600 text-white font-medium hover:opacity-90 transition-opacity mt-0.5">Hoy</button>
            <button onClick={()=> setAdding(true)} className="p-2 rounded-full bg-green-600 text-white hover:bg-green-700 transition-colors" title="Añadir evento"><Plus size={18}/></button>
            <button onClick={syncCalendarWithContracts} disabled={syncing} className={`p-2 rounded-full transition-colors ${syncing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'} bg-blue-600 text-white`} title="Sincronizar eventos sin contrato"><RefreshCw size={18} className={syncing ? 'animate-spin' : ''}/></button>
          </div>
        </div>

        <div className={`flex-1 overflow-hidden flex flex-col transition-colors ${darkMode ? 'bg-black' : 'bg-white'}`}>
          <div className={`grid grid-cols-7 text-center text-xs py-0 px-1 border-b flex-shrink-0 transition-colors ${darkMode ? 'border-gray-800 bg-black text-gray-400' : 'border-gray-200 bg-gray-50 lg:bg-gray-50 max-lg:bg-white text-gray-600'}`}>
            {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map((d)=> <div key={d} className="py-1 font-medium">{d}</div>)}
          </div>
          <div className={`grid grid-cols-7 gap-px flex-1 auto-rows-fr overflow-hidden w-full h-full transition-colors ${darkMode ? 'bg-black' : 'bg-gray-100 lg:bg-gray-100 max-lg:bg-white'}`}>
            {monthDays.map((cell, idx)=>{
              const isToday = cell.date && new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate()).getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
              const key = cell.date ? `${cell.date.getFullYear()}-${String(cell.date.getMonth()+1).padStart(2,'0')}-${String(cell.date.getDate()).padStart(2,'0')}` : `empty-${idx}`;
              const dayEvents = cell.date ? (eventsByDay.get(key) || []) : [];
              return (
                <button key={key} onClick={() => cell.date && setExpandedDay(key)} className={`p-2 relative overflow-hidden flex flex-col border transition-colors text-left cursor-pointer group ${darkMode ? 'bg-black border-gray-800 hover:bg-gray-900' : 'bg-white lg:bg-white max-lg:bg-white border-gray-200 hover:bg-gray-50'}`}>
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
                    {dayEvents.length > 0 && (
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded transition-colors ${darkMode ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>
                        {dayEvents.length}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-0.5 flex-1 pointer-events-none">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div key={ev.id} onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }} className={`text-xs px-1 py-0.5 rounded text-white truncate transition-colors cursor-pointer pointer-events-auto ${getEventColor(ev)}`}>
                        {ev.clientName?.split('—')[0].trim()}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className={`text-xs px-1 py-0.5 transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>+{dayEvents.length - 3}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {expandedDay && (
        <div className={`fixed inset-0 z-[50] flex items-center justify-center p-4 transition-colors ${darkMode ? 'bg-black/70' : 'bg-black/50'}`} onClick={() => setExpandedDay(null)}>
          <div className={`rounded-xl w-full max-w-2xl p-6 transition-colors overflow-hidden max-h-[80vh] overflow-y-auto ${darkMode ? 'bg-black border border-gray-800' : 'bg-white border border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between mb-6 pb-4 border-b transition-colors ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
              <h3 className={`text-lg font-semibold transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>
                {new Date(expandedDay).toLocaleDateString('es', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <button onClick={() => setExpandedDay(null)} className={`text-2xl transition-colors ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}>✕</button>
            </div>
            <div className="space-y-2 mb-6">
              {(eventsByDay.get(expandedDay) || []).map(ev => (
                <div key={ev.id} className={`w-full text-left p-4 rounded-lg border transition-colors ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
                    <button onClick={() => { setSelectedEvent(ev); setExpandedDay(null); }} className="text-left flex-1 hover:opacity-80 transition-opacity">
                      <div className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{ev.clientName}</div>
                      <div className={`text-sm mt-1 transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {ev.eventTime ? `${ev.eventTime} · ` : ''}{ev.eventType || ''}
                      </div>
                      <div className={`text-sm mt-1 transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {ev.eventLocation || ''}
                      </div>
                    </button>
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('adminOpenContract', { detail: { id: ev.id } }))}
                    className="w-full md:w-auto px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <ExternalLink size={14} />
                    Ir al contrato
                  </button>
                </div>
              ))}
            </div>

            <div className={`flex gap-2 pt-4 border-t transition-colors ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
              <button onClick={() => {
                const dateStr = new Date(expandedDay).toLocaleDateString('es', { weekday: 'long', month: 'long', day: 'numeric' });
                const events = eventsByDay.get(expandedDay) || [];
                const html = `<h2>${dateStr}</h2><ul>${events.map(ev => `<li><strong>${ev.clientName}</strong><br/>${ev.eventTime || ''} ${ev.eventType || ''}<br/>${ev.eventLocation || ''}</li>`).join('')}</ul>`;
                const printWindow = window.open('', '', 'width=800,height=600');
                if (printWindow) {
                  printWindow.document.write(html);
                  printWindow.document.close();
                  printWindow.print();
                }
              }} className="border-2 border-black text-black px-4 py-2 rounded-none hover:bg-black hover:text-white inline-flex items-center gap-2">
                <Printer size={16} /> Imprimir
              </button>
              <button onClick={async () => {
                try {
                  const events = eventsByDay.get(expandedDay) || [];
                  const pdf = new jsPDF('p', 'mm', 'a4');

                  const pageHeight = pdf.internal.pageSize.getHeight();
                  const pageWidth = pdf.internal.pageSize.getWidth();
                  const margin = 15;
                  let yPosition = margin;

                  const dateStr = new Date(expandedDay).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                  pdf.setFontSize(16);
                  pdf.setFont('', 'bold');
                  pdf.text('Eventos del día', margin, yPosition);
                  yPosition += 10;

                  pdf.setFontSize(12);
                  pdf.setFont('', 'normal');
                  pdf.text(dateStr, margin, yPosition);
                  yPosition += 12;

                  for (const event of events) {
                    if (yPosition > pageHeight - 30) {
                      pdf.addPage();
                      yPosition = margin;
                    }

                    pdf.setFontSize(11);
                    pdf.setFont('', 'bold');
                    pdf.text(event.clientName || 'Sin nombre', margin, yPosition);
                    yPosition += 7;

                    pdf.setFontSize(9);
                    pdf.setFont('', 'normal');
                    const details = [
                      event.eventTime ? `Hora: ${event.eventTime}` : '',
                      event.eventType ? `Tipo: ${event.eventType}` : '',
                      event.eventLocation ? `Ubicación: ${event.eventLocation}` : '',
                      event.phone ? `Teléfono: ${event.phone}` : '',
                    ].filter(Boolean);

                    for (const detail of details) {
                      pdf.text(detail, margin + 3, yPosition);
                      yPosition += 5;
                    }

                    yPosition += 5;
                  }

                  pdf.save(`eventos-${expandedDay}.pdf`);
                } catch (e) {
                  console.error('Error generating PDF:', e);
                }
              }} className="border-2 border-black text-black px-4 py-2 rounded-none hover:bg-black hover:text-white inline-flex items-center gap-2">
                <Download size={16} /> PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {statusFilter && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-colors ${darkMode ? 'bg-black/70' : 'bg-white/70'}`} onClick={() => setStatusFilter(null)}>
          <div className={`rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 border transition-colors ${darkMode ? 'bg-black border-gray-800' : 'bg-white border-gray-200'}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className={`text-2xl font-bold transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>
                {statusFilter === 'deposit_pending' && 'Pendientes Depósito'}
                {statusFilter === 'editing' && 'Por editar'}
                {statusFilter === 'completed' && 'Eventos Finalizados'}
              </div>
              <button onClick={() => setStatusFilter(null)} className={`text-2xl transition-colors ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}>✕</button>
            </div>

            {(() => {
              const filtered = filteredEvents.filter(ev => {
                if (statusFilter === 'deposit_pending') {
                  return ev.depositPaid !== true;
                } else if (statusFilter === 'editing') {
                  return ev.depositPaid === true && ev.finalPaymentPaid === true && ev.eventCompleted !== true;
                } else if (statusFilter === 'completed') {
                  return ev.depositPaid === true && ev.finalPaymentPaid === true && ev.eventCompleted === true;
                }
                return false;
              });

              return filtered.length > 0 ? (
                <div className="space-y-2">
                  {filtered.map((ev, idx) => (
                    <div
                      key={ev.id}
                      className={`w-full text-left p-4 rounded-lg border transition-colors ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-3">
                        <button
                          onClick={() => setSelectedEvent(ev)}
                          className="text-left flex-1 hover:opacity-80 transition-opacity"
                        >
                          <div className={`font-semibold transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>
                            {idx + 1}. {ev.clientName || 'Evento sin nombre'}
                          </div>
                          <div className={`text-sm mt-1 transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {ev.eventDate} {ev.eventTime ? `· ${ev.eventTime}` : ''} {ev.eventType ? `· ${ev.eventType}` : ''}
                          </div>
                        </button>
                        <div className={`text-xs px-2 py-1 rounded whitespace-nowrap ${darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>
                          R$ {Number(ev.totalAmount || 0).toFixed(0)}
                        </div>
                        <button
                          onClick={() => window.dispatchEvent(new CustomEvent('adminOpenContract', { detail: { id: ev.id } }))}
                          className="w-full md:w-auto px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <ExternalLink size={16} />
                          Ir al contrato
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`text-center py-8 transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  No hay eventos en esta categoría
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {showCouponModal && (
        <div className={`fixed inset-0 z-[52] flex items-center justify-center p-4 transition-colors ${darkMode ? 'bg-black/70' : 'bg-black/50'}`} onClick={() => setShowCouponModal(false)}>
          <div className={`rounded-xl w-full max-w-2xl p-6 overflow-y-auto max-h-[80vh] transition-colors ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-bold transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>
                Aplicar Cupones de Descuento
              </h3>
              <button onClick={() => setShowCouponModal(false)} className={`p-1 rounded transition-colors ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                <X size={20} className={darkMode ? 'text-gray-400' : 'text-gray-600'} />
              </button>
            </div>

            {coupons.length === 0 ? (
              <p className={`text-sm transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                No hay cupones disponibles en este momento.
              </p>
            ) : (
              <div className="space-y-3">
                {coupons.map(coupon => {
                  const isApplied = appliedCoupons.includes(coupon.id);
                  const discountAmount = (() => {
                    const baseAmount = Number(editingEvent?.totalAmount || selectedEvent?.totalAmount || addForm.totalAmount || 0);
                    if (coupon.discountType === 'percentage') {
                      return baseAmount * ((coupon.discountValue || 0) / 100);
                    } else if (coupon.discountType === 'fixed') {
                      return coupon.discountValue || 0;
                    } else if (coupon.discountType === 'full') {
                      return baseAmount;
                    }
                    return 0;
                  })();

                  return (
                    <label key={coupon.id} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      isApplied
                        ? darkMode
                          ? 'bg-amber-900/20 border-amber-700'
                          : 'bg-amber-50 border-amber-300'
                        : darkMode
                        ? 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isApplied}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAppliedCoupons([...appliedCoupons, coupon.id]);
                          } else {
                            setAppliedCoupons(appliedCoupons.filter(id => id !== coupon.id));
                          }
                        }}
                        className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>
                              {coupon.code}
                            </p>
                            {coupon.description && (
                              <p className={`text-sm transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                {coupon.description}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className={`font-medium transition-colors ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                              {coupon.discountType === 'percentage' && `${coupon.discountValue}%`}
                              {coupon.discountType === 'fixed' && `R$ ${coupon.discountValue}`}
                              {coupon.discountType === 'full' && '100%'}
                            </p>
                            <p className={`text-xs transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              Ahorro: R$ {discountAmount.toFixed(0)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}</div>
            )}

            <div className={`mt-6 p-4 rounded-lg border transition-colors ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Monto original:</span>
                  <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>
                    R$ {Number(editingEvent?.totalAmount || selectedEvent?.totalAmount || addForm.totalAmount || 0).toFixed(0)}
                  </span>
                </div>
                {appliedCoupons.length > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Descuento total:</span>
                      <span className={`font-medium transition-colors ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                        -R$ {(Number(editingEvent?.totalAmount || selectedEvent?.totalAmount || addForm.totalAmount || 0) - computeTotalFromBase(Number(editingEvent?.totalAmount || selectedEvent?.totalAmount || addForm.totalAmount || 0))).toFixed(0)}
                      </span>
                    </div>
                    <div className="border-t border-gray-400/20 pt-2 flex justify-between">
                      <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>Total con descuento:</span>
                      <span className={`font-bold transition-colors ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                        R$ {(editingEvent || selectedEvent ? calculateTotalWithDiscount() : computeTotalFromBase(Number(addForm.totalAmount || 0))).toFixed(0)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCouponModal(false);
                }}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  darkMode
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                Aceptar
              </button>
              <button
                onClick={() => {
                  setAppliedCoupons([]);
                  setShowCouponModal(false);
                }}
                className={`flex-1 px-4 py-2 rounded-lg font-medium border transition-colors ${
                  darkMode
                    ? 'border-gray-700 text-gray-300 hover:bg-gray-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className={`fixed inset-0 z-[51] flex items-center justify-center p-2 sm:p-4 transition-colors ${darkMode ? 'bg-black/70' : 'bg-white/70'}`} onClick={() => setSelectedEvent(null)}>
          <div className={`rounded-xl w-full max-w-5xl p-4 md:p-6 overflow-hidden max-h-[90vh] overflow-y-auto transition-colors ${darkMode ? 'bg-black border border-gray-800' : 'bg-white border border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3">
              <div>
                <div className={`text-lg font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{selectedEvent.clientName} — {selectedEvent.eventType || 'Trabajo'}</div>
                <div className={`text-xs transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Fecha principal: {selectedEvent.eventDate || '-'} | Hora: {selectedEvent.eventTime || '-'}</div>
              </div>
              <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => deleteEvent(selectedEvent)} className={`p-2 rounded-full transition-colors ${darkMode ? 'text-red-400 hover:bg-red-900/20' : 'text-red-600 hover:bg-red-100'}`} title="Eliminar evento" />
                </div>
                <div className="flex flex-col md:flex-row items-center gap-2">
                  <button
                    onClick={() => { setEditingEvent(selectedEvent); setEditForm({}); setAppliedCoupons([]); }}
                    className="hidden md:flex px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors items-center gap-2"
                    title="Editar evento"
                  >
                    <Edit size={16} />
                    Editar
                  </button>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('adminOpenContract', { detail: { id: selectedEvent.id } }))}
                    className="hidden md:flex px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors items-center gap-2"
                    title="Ir al contrato"
                  >
                    <ExternalLink size={16} />
                    Ir al contrato
                  </button>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    data-loc="src/components/store/AdminCalendar.tsx:1072:226"
                    style={{ display: 'block', height: '20px', width: '20px', stroke: 'rgb(248, 113, 113)' }}
                  >
                    <path d="M3 6h18" data-loc="src/components/store/AdminCalendar.tsx:1072:226" fill="none" stroke="rgb(248, 113, 113)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" data-loc="src/components/store/AdminCalendar.tsx:1072:226" fill="none" stroke="rgb(248, 113, 113)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" data-loc="src/components/store/AdminCalendar.tsx:1072:226" fill="none" stroke="rgb(248, 113, 113)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="10" x2="10" y1="11" y2="17" data-loc="src/components/store/AdminCalendar.tsx:1072:226" stroke="rgb(248, 113, 113)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="14" x2="14" y1="11" y2="17" data-loc="src/components/store/AdminCalendar.tsx:1072:226" stroke="rgb(248, 113, 113)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <button onClick={() => setSelectedEvent(null)} className={`text-2xl transition-colors ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}>✕</button>
                </div>
              </div>
            </div>
            {!editingEvent && (
              <div className="flex md:hidden gap-2 mb-4">
                <button
                  onClick={() => { setEditingEvent(selectedEvent); setEditForm({}); setAppliedCoupons([]); }}
                  className="flex-1 p-2 bg-green-600 text-white rounded transition-colors hover:bg-green-700 flex items-center justify-center"
                  title="Editar evento"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('adminOpenContract', { detail: { id: selectedEvent.id } }))}
                  className="flex-1 p-2 bg-blue-600 text-white rounded transition-colors hover:bg-blue-700 flex items-center justify-center"
                  title="Ir al contrato"
                >
                  <ExternalLink size={16} />
                </button>
              </div>
            )}

            {editingEvent && (
              <div className={`p-4 rounded-lg border mb-4 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`font-semibold mb-3 ${darkMode ? 'text-white' : 'text-black'}`}>Editar Evento</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="text" placeholder="Nombre" value={editForm.clientName || editingEvent.clientName} onChange={(e) => setEditForm({...editForm, clientName: e.target.value})} className={`px-3 py-2 border rounded text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                  <input type="email" placeholder="Email" value={editForm.clientEmail || editingEvent.clientEmail} onChange={(e) => setEditForm({...editForm, clientEmail: e.target.value})} className={`px-3 py-2 border rounded text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                  <input type="tel" placeholder="Teléfono" value={editForm.phone || editingEvent.phone || ''} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} className={`px-3 py-2 border rounded text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                  <input type="text" placeholder="Tipo de evento" value={editForm.eventType || editingEvent.eventType} onChange={(e) => setEditForm({...editForm, eventType: e.target.value})} className={`px-3 py-2 border rounded text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                  <input type="date" placeholder="Fecha evento" value={editForm.eventDate || editingEvent.eventDate} onChange={(e) => setEditForm({...editForm, eventDate: e.target.value})} className={`px-3 py-2 border rounded text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                  <input type="time" placeholder="Hora" value={editForm.eventTime || editingEvent.eventTime} onChange={(e) => setEditForm({...editForm, eventTime: e.target.value})} className={`px-3 py-2 border rounded text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                  <input type="text" placeholder="Ubicación" value={editForm.eventLocation || editingEvent.eventLocation} onChange={(e) => setEditForm({...editForm, eventLocation: e.target.value})} className={`px-3 py-2 border rounded text-sm md:col-span-2 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                  <select value={editForm.packageTitle || editingEvent.packageTitle || ''} onChange={(e) => setEditForm({...editForm, packageTitle: e.target.value, totalAmount: packages.find(p => p.title === e.target.value)?.price || editForm.totalAmount})} className={`px-3 py-2 border rounded text-sm md:col-span-2 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
                    <option value="">Seleccionar paquete</option>
                    {packages.map(pkg => (
                      <option key={pkg.id} value={pkg.title}>
                        {pkg.title} - R$ {pkg.price}
                      </option>
                    ))}
                  </select>
                  <input type="number" placeholder="Monto total" value={editForm.totalAmount || editingEvent.totalAmount} onChange={(e) => setEditForm({...editForm, totalAmount: e.target.value})} className={`px-3 py-2 border rounded text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                  <input type="number" placeholder="Deslocamiento" value={editForm.travelFee || editingEvent.travelFee || ''} onChange={(e) => setEditForm({...editForm, travelFee: e.target.value})} className={`px-3 py-2 border rounded text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                  <input type="text" placeholder="Método de pago" value={editForm.paymentMethod || editingEvent.paymentMethod} onChange={(e) => setEditForm({...editForm, paymentMethod: e.target.value})} className={`px-3 py-2 border rounded text-sm md:col-span-2 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                </div>
                <div className="flex gap-2 mt-3 flex-col">
                  <button onClick={() => setShowCouponModal(true)} className="flex-1 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors text-sm font-medium flex items-center justify-center gap-2">
                    <Percent size={16} />
                    Aplicar Cupones ({appliedCoupons.length})
                  </button>
                  <div className="flex gap-2">
                    <button onClick={saveEventChanges} className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium">Guardar</button>
                    <button onClick={() => { setEditingEvent(null); setEditForm({}); setAppliedCoupons([]); }} className={`flex-1 px-4 py-2 border rounded text-sm font-medium transition-colors ${darkMode ? 'border-gray-600 text-gray-400 hover:bg-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Nombre:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{selectedEvent.clientName}</span></div>
                <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Email:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{selectedEvent.clientEmail || '-'}</span></div>
                <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Teléfono:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{selectedEvent.phone || (selectedEvent as any).clientPhone || (selectedEvent as any).formSnapshot?.phone || '-'}</span></div>
                <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>CPF:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{(selectedEvent as any).clientCPF || '-'}</span></div>
                <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>RG:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{(selectedEvent as any).clientRG || '-'}</span></div>
                <div className="col-span-2"><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Endereço:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{(selectedEvent as any).clientAddress || '-'}</span></div>
                <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tipo de evento:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{selectedEvent.eventType || '-'}</span></div>
                <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Fecha contrato:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{selectedEvent.contractDate || '-'}</span></div>
                <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Hora firma:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{(selectedEvent as any).signatureTime || '-'}</span></div>
                <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>M��todo de pago:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{selectedEvent.paymentMethod || '-'}</span></div>
              </div>

              <div className={`border-t pt-4 transition-colors ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Fecha evento:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{selectedEvent.eventDate || '-'}</span></div>
                  <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Hora:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{selectedEvent.eventTime || '-'}</span></div>
                  <div className="col-span-2"><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Ubicación:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{selectedEvent.eventLocation || '-'}</span></div>
                  <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Paquete:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{(selectedEvent as any).packageTitle || '-'}</span></div>
                  <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Duración:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>{selectedEvent.packageDuration || '-'}</span></div>
                </div>
              </div>

              {(selectedEvent as any).formSnapshot?.selectedDresses && Array.isArray((selectedEvent as any).formSnapshot.selectedDresses) && (
                <div className={`border-t pt-4 transition-colors ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <div className="text-sm font-medium mb-3">Vestidos</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {(selectedEvent as any).formSnapshot.selectedDresses
                      .map((id: string) => dressOptions.find(d => d.id === id))
                      .filter((d: any) => d)
                      .map((dress: any) => (
                        <div key={dress.id} className="relative group">
                          <img src={dress.image} alt={dress.name} className="w-full h-32 object-cover rounded-lg border" />
                          <div className={`absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center`}>
                            <span className="text-white text-xs font-medium text-center px-2">{dress.name}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className={`border-t pt-4 transition-colors ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="text-sm font-medium mb-3">Información de Pago</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Depósito (20%):</span>
                    <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>R$ {calculateDepositWithDiscount().toFixed(0)}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${selectedEvent.depositPaid ? (darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700') : (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700')}`}>{selectedEvent.depositPaid ? 'Pagado' : 'No pagado'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Restante (80%):</span>
                    <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>R$ {calculateRemainingWithDiscount().toFixed(0)}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${selectedEvent.finalPaymentPaid ? (darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700') : (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700')}`}>{selectedEvent.finalPaymentPaid ? 'Pagado' : 'No pagado'}</span>
                  </div>
                  <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>R$ {calculateTotalWithDiscount().toFixed(0)}</span></div>
                  <div><span className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Deslocamiento:</span> <span className={`font-medium transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>R$ {(selectedEvent.travelFee ?? 0).toFixed(0)}</span></div>
                </div>
              </div>

              <div className={`border-t pt-4 transition-colors ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="text-sm font-medium mb-3">Progreso del evento</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => updateEventProgress('depositPaid', !selectedEvent.depositPaid)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors ${selectedEvent.depositPaid ? (darkMode ? 'bg-green-900/30 text-green-400 border border-green-900 hover:bg-green-900/50' : 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200') : (darkMode ? 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200')}`}
                  >
                    <span className="w-4 h-4 rounded-full border flex items-center justify-center text-xs">{selectedEvent.depositPaid ? '✓' : ''}</span>
                    Depósito Realizado
                  </button>
                  <button
                    onClick={() => updateEventProgress('finalPaymentPaid', !selectedEvent.finalPaymentPaid)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors ${selectedEvent.finalPaymentPaid ? (darkMode ? 'bg-green-900/30 text-green-400 border border-green-900 hover:bg-green-900/50' : 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200') : (darkMode ? 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200')}`}
                  >
                    <span className="w-4 h-4 rounded-full border flex items-center justify-center text-xs">{selectedEvent.finalPaymentPaid ? '✓' : ''}</span>
                    Pago Final
                  </button>
                  <button
                    onClick={() => updateEventProgress('eventCompleted', !selectedEvent.eventCompleted)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors ${selectedEvent.eventCompleted ? (darkMode ? 'bg-green-900/30 text-green-400 border border-green-900 hover:bg-green-900/50' : 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200') : (darkMode ? 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200')}`}
                  >
                    <span className="w-4 h-4 rounded-full border flex items-center justify-center text-xs">{selectedEvent.eventCompleted ? '✓' : ''}</span>
                    Evento Completado
                  </button>
                </div>
              </div>

              {(Array.isArray(selectedEvent.storeItems) && selectedEvent.storeItems.length > 0) && (
                <div className={`border-t pt-4 transition-colors ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <div className="text-sm font-medium mb-3">Items del contrato</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={`transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <th className="py-1 text-left">Item</th>
                          <th className="py-1 text-left">Cantidad</th>
                          <th className="py-1 text-left">Unitario</th>
                          <th className="py-1 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedEvent.storeItems.map((it: any, idx: number) => (
                          <tr key={idx} className={`border-t transition-colors ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                            <td className="py-2">{it.name}</td>
                            <td className="py-2">{it.quantity}</td>
                            <td className="py-2">R$ {Number(it.price || 0).toFixed(0)}</td>
                            <td className="py-2 text-right">R$ {(Number(it.price || 0) * Number(it.quantity || 0)).toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteConfirmEvent && (
        <div className={`fixed inset-0 z-[52] flex items-center justify-center p-4 transition-colors ${darkMode ? 'bg-black/70' : 'bg-black/50'}`} onClick={() => !isDeleting && setDeleteConfirmEvent(null)}>
          <div className={`rounded-xl w-full max-w-md p-6 transition-colors ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4 mb-4">
              <div className={`p-3 rounded-full ${darkMode ? 'bg-red-900/30' : 'bg-red-100'}`}>
                <Trash2 size={24} className={darkMode ? 'text-red-400' : 'text-red-600'} />
              </div>
              <div className="flex-1">
                <h3 className={`text-lg font-bold transition-colors ${darkMode ? 'text-white' : 'text-black'}`}>
                  ¿Eliminar evento?
                </h3>
                <p className={`text-sm mt-1 transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Se eliminará el evento <strong>{deleteConfirmEvent.clientName || 'sin nombre'}</strong> y su contrato asociado.
                </p>
                <p className={`text-xs mt-2 transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setDeleteConfirmEvent(null)}
                disabled={isDeleting}
                className={`flex-1 px-4 py-2 rounded-lg border transition-colors font-medium ${
                  darkMode
                    ? 'border-gray-700 text-gray-300 hover:bg-gray-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                } ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className={`flex-1 px-4 py-2 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2 ${
                  isDeleting
                    ? 'bg-red-700/50 cursor-not-allowed'
                    : darkMode
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 size={18} />
                    Eliminar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCalendar;
