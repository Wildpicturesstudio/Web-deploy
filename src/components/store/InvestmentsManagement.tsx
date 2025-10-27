import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../utils/firebaseClient';
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc } from 'firebase/firestore';
import { Calendar as CalendarIcon, Tag, FileText, Link as LinkIcon, Image as ImageIcon, CreditCard, Hash } from 'lucide-react';

interface Investment {
  id: string;
  date: string; // ISO date (yyyy-mm-dd)
  category: string;
  description: string;
  totalValue: number; // in R$
  installmentsCount: number;
  installmentValue: number;
  paymentMethod: string;
  productUrl?: string;
  productImageUrl?: string;
  createdAt?: string;
}

interface Installment {
  id: string;
  investmentId: string;
  installmentNumber: number; // 1..n
  amount: number;
  dueDate: string; // ISO date
  status: 'pendiente' | 'pagado';
  paidAt?: string | null;
}

const baseCategories: string[] = ['publicidad', 'equipo', 'software', 'otros'];

const InvestmentsManagement: React.FC = () => {
  const [items, setItems] = useState<Investment[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [categories, setCategories] = useState<string[]>(baseCategories.slice());

  const fetchAll = async () => {
    setLoading(true);
    try {
      const invSnap = await getDocs(query(collection(db, 'investments')));
      const inv = invSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Investment[];
      const instSnap = await getDocs(query(collection(db, 'investment_installments')));
      const inst = instSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Installment[];
      setItems(inv);
      setInstallments(inst);
      const catSet = new Set<string>(baseCategories);
      inv.forEach(v => { const c = String(v.category || '').trim(); if (c) catSet.add(c); });
      setCategories(Array.from(catSet));
    } catch {
      setItems([]);
      setInstallments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const createInstallments = async (investmentId: string, startDate: string, totalAmount: number, installmentsCount: number) => {
    const c = Math.max(1, installmentsCount);
    const base = Math.floor((totalAmount / c) * 100) / 100;
    const remainder = Math.round(totalAmount * 100) - Math.round(base * 100) * c; // cents remainder
    const start = new Date(startDate);

    const batch: Promise<any>[] = [];
    for (let i = 0; i < c; i++) {
      const due = new Date(start.getFullYear(), start.getMonth() + i, start.getDate());
      const extraCent = i < remainder ? 0.01 : 0; // distribute remainder to earliest installments
      const amount = Math.round((base + extraCent) * 100) / 100;
      batch.push(addDoc(collection(db, 'investment_installments'), {
        investmentId,
        installmentNumber: i + 1,
        amount,
        dueDate: due.toISOString().slice(0, 10),
        status: 'pendiente',
        createdAt: new Date().toISOString(),
      }));
    }
    await Promise.all(batch);
  };

  const getStatus = (investmentId: string) => {
    const list = installments.filter(i => i.investmentId === investmentId);
    if (!list.length) return 'pendiente';
    return list.every(i => i.status === 'pagado') ? 'pagado' : 'pendiente';
  };

  const markPaid = async (installmentId: string, paid: boolean) => {
    try {
      await updateDoc(doc(db, 'investment_installments', installmentId), { status: paid ? 'pagado' : 'pendiente', paidAt: paid ? new Date().toISOString() : null });
      await fetchAll();
      window.dispatchEvent(new Event('investmentsUpdated'));
    } catch {}
  };

  const handleDeleteInvestment = async (inv: Investment) => {
    const ok = confirm('¿Borrar esta inversión y todas sus cuotas?');
    if (!ok) return;
    try {
      const list = installments.filter(i => i.investmentId === inv.id);
      await Promise.all(list.map(i => deleteDoc(doc(db, 'investment_installments', i.id))));
      await deleteDoc(doc(db, 'investments', inv.id));
      await fetchAll();
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Inversión eliminada', type: 'success' } }));
      window.dispatchEvent(new Event('investmentsUpdated'));
    } catch {
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'No se pudo eliminar', type: 'error' } }));
    }
  };

  const groupedByInvestment = useMemo(() => {
    const map = new Map<string, Installment[]>();
    for (const i of installments) {
      if (!map.has(i.investmentId)) map.set(i.investmentId, []);
      map.get(i.investmentId)!.push(i);
    }
    return map;
  }, [installments]);

  const [details, setDetails] = useState<{ open: boolean; inv: Investment | null }>({ open: false, inv: null });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Inversiones</h2>
        <button onClick={() => { setEditing(null); setModalOpen(true); }} className="px-4 py-2 rounded-none border-2 border-black text-black hover:bg-black hover:text-white">Agregar</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Producto / Descripción</th>
              <th className="px-4 py-2">Valor total</th>
              <th className="px-4 py-2">No de cuotas</th>
              <th className="px-4 py-2">Valor por cuota</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-gray-500" colSpan={10}>Sin inversiones</td>
              </tr>
            )}
            {items.map(inv => {
              return (
                <tr key={inv.id} className="border-t">
                  <td className="px-4 py-2 whitespace-nowrap">{inv.date}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => setDetails({ open: true, inv })} className="w-full text-left">
                      <div className="flex items-center gap-2">
                        {inv.productImageUrl && (
                          <img src={inv.productImageUrl} alt="Producto" className="w-10 h-10 object-cover rounded border" />
                        )}
                        <span className="max-w-[360px] truncate block" title={inv.description}>{inv.description}</span>
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">R$ {Number(inv.totalValue || 0).toFixed(2)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{inv.installmentsCount}</td>
                  <td className="px-4 py-2 whitespace-nowrap">R$ {Number(inv.installmentValue || 0).toFixed(2)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditing(inv); setModalOpen(true); }} className="px-2 py-1 border rounded-none hover:bg-gray-50">Editar</button>
                      <button onClick={() => handleDeleteInvestment(inv)} className="px-2 py-1 border border-red-600 text-red-600 rounded-none hover:bg-red-50">Borrar</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <InvestmentModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          categories={categories}
          onAddCategory={(c: string) => setCategories(prev => Array.from(new Set([...prev, c])))}
          initial={editing}
          onSaved={async (payload) => {
            try {
              setLoading(true);
              if (!payload.id) {
                const t = Number(payload.totalValue);
                const c = Math.max(1, Number(payload.installmentsCount));
                const invRef = await addDoc(collection(db, 'investments'), {
                  date: payload.date,
                  category: payload.category,
                  description: payload.description,
                  totalValue: t,
                  installmentsCount: c,
                  installmentValue: Math.round((t / c) * 100) / 100,
                  paymentMethod: payload.paymentMethod,
                  productUrl: payload.productUrl || '',
                  productImageUrl: payload.productImageUrl || '',
                  createdAt: new Date().toISOString(),
                });
                await createInstallments(invRef.id, String(payload.date), t, c);
              } else {
                const invId = payload.id;
                const before = items.find(i => i.id === invId);
                const t = Number(payload.totalValue);
                const c = Math.max(1, Number(payload.installmentsCount));
                await updateDoc(doc(db, 'investments', invId), {
                  date: payload.date,
                  category: payload.category,
                  description: payload.description,
                  totalValue: t,
                  installmentsCount: c,
                  installmentValue: Math.round((t / c) * 100) / 100,
                  paymentMethod: payload.paymentMethod,
                  productUrl: payload.productUrl || '',
                  productImageUrl: payload.productImageUrl || '',
                });
                if (!before || before.date !== payload.date || Number(before.totalValue) !== t || Number(before.installmentsCount) !== c) {
                  const list = installments.filter(i => i.investmentId === invId);
                  await Promise.all(list.map(i => deleteDoc(doc(db, 'investment_installments', i.id))));
                  await createInstallments(invId, String(payload.date), t, c);
                }
              }
              await fetchAll();
              setModalOpen(false);
              setEditing(null);
              window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Datos guardados', type: 'success' } }));
              window.dispatchEvent(new Event('investmentsUpdated'));
            } catch {
              window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'No se pudo guardar', type: 'error' } }));
            } finally {
              setLoading(false);
            }
          }}
        />
      )}

      {details.open && details.inv && (
        <InvestmentDetailsModal
          open={details.open}
          onClose={() => setDetails({ open: false, inv: null })}
          investment={details.inv}
          installments={(groupedByInvestment.get(details.inv.id) || []).sort((a,b)=> a.installmentNumber - b.installmentNumber)}
          onTogglePaid={(instId: string, paid: boolean) => markPaid(instId, paid)}
        />
      )}
    </div>
  );
};

const InvestmentModal: React.FC<{ open: boolean; onClose: () => void; categories: string[]; onAddCategory: (c: string) => void; initial: Investment | null; onSaved: (payload: Partial<Investment> & { id?: string }) => void; }> = ({ open, onClose, categories, onAddCategory, initial, onSaved }) => {
  const [date, setDate] = useState<string>(initial?.date || new Date().toISOString().slice(0,10));
  const [category, setCategory] = useState<string>(initial?.category || 'publicidad');
  const [description, setDescription] = useState(initial?.description || '');
  const [total, setTotal] = useState<string>(initial ? String(initial.totalValue || '') : '');
  const [count, setCount] = useState<string>(initial ? String(initial.installmentsCount || 1) : '1');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod || 'tarjeta');
  const [productUrl, setProductUrl] = useState<string>(initial?.productUrl || '');
  const [productImageUrl, setProductImageUrl] = useState<string>(initial?.productImageUrl || '');
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState('');

  useEffect(() => {
    if (!open) return;
    setDate(initial?.date || new Date().toISOString().slice(0,10));
    setCategory(initial?.category || 'publicidad');
    setDescription(initial?.description || '');
    setTotal(initial ? String(initial.totalValue || '') : '');
    setCount(initial ? String(initial.installmentsCount || 1) : '1');
    setPaymentMethod(initial?.paymentMethod || 'tarjeta');
    setProductUrl(initial?.productUrl || '');
    setProductImageUrl(initial?.productImageUrl || '');
    setShowNewCat(false);
    setNewCat('');
  }, [open, initial]);

  const parseCurrency = (s: string): number => {
    if (s == null) return 0;
    const raw = String(s).trim();
    if (!raw) return 0;
    if (raw.includes(',')) {
      const cleaned = raw.replace(/\./g, '').replace(/,/g, '.');
      const n = parseFloat(cleaned);
      return isFinite(n) ? n : 0;
    }
    if (raw.includes('.')) {
      const last = raw.lastIndexOf('.');
      const after = raw.slice(last + 1);
      if (after.length <= 2) {
        const n = parseFloat(raw);
        return isFinite(n) ? n : 0;
      }
      const n = parseFloat(raw.replace(/\./g, ''));
      return isFinite(n) ? n : 0;
    }
    const n = parseFloat(raw);
    return isFinite(n) ? n : 0;
  };

  const perInstallment = useMemo(() => {
    const t = parseCurrency(total);
    const c = Math.max(1, Number(count) || 1);
    const value = t / c;
    return Math.round(value * 100) / 100;
  }, [total, count]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] overflow-auto relative">
        <button onClick={onClose} className="absolute top-3 right-3 bg-white border rounded-full p-1 shadow hover:bg-gray-50" aria-label="Cerrar">✕</button>
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">{initial ? 'Editar inversión' : 'Nueva inversión'}</h3>
        </div>
        {productImageUrl && productImageUrl.startsWith('http') && (
          <div className="px-4 pt-4">
            <div className="rounded-lg overflow-hidden border">
              <img src={productImageUrl} alt="Producto" className="w-full max-h-64 object-contain bg-white" />
            </div>
          </div>
        )}
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 flex items-center gap-1"><CalendarIcon size={14}/> Fecha</label>
            <input type="date" value={date} onChange={e=> setDate(e.target.value)} className="px-3 py-2 border rounded-none" required />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 flex items-center gap-1"><Tag size={14}/> Categoría</label>
            <div className="flex gap-2">
              <select value={category} onChange={e=> setCategory(e.target.value)} className="px-3 py-2 border rounded-none flex-1">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" onClick={() => setShowNewCat(v=>!v)} className="px-2 py-2 border rounded-none">{showNewCat ? 'Cancelar' : 'Nueva'}</button>
            </div>
            {showNewCat && (
              <div className="mt-2 flex gap-2">
                <input type="text" value={newCat} onChange={e=> setNewCat(e.target.value)} className="px-3 py-2 border rounded-none flex-1" placeholder="Nueva categoría" />
                <button type="button" onClick={() => { const c = newCat.trim(); if (c) { onAddCategory(c); setCategory(c); setShowNewCat(false); setNewCat(''); } }} className="px-3 py-2 border rounded-none bg-black text-white">Agregar</button>
              </div>
            )}
          </div>
          <div className="flex flex-col md:col-span-2">
            <label className="text-xs text-gray-600 flex items-center gap-1"><FileText size={14}/> Producto / Descripción</label>
            <input type="text" value={description} onChange={e=> setDescription(e.target.value)} className="px-3 py-2 border rounded-none" placeholder="Ej: Lente 50mm 1.8" required />
          </div>
          <div className="flex flex-col lg:col-span-2">
            <label className="text-xs text-gray-600 flex items-center gap-1"><LinkIcon size={14}/> Link del producto (opcional)</label>
            <input type="url" value={productUrl} onChange={e=> setProductUrl(e.target.value)} className="px-3 py-2 border rounded-none" placeholder="https://..." />
          </div>
          <div className="flex flex-col lg:col-span-2">
            <label className="text-xs text-gray-600 flex items-center gap-1"><ImageIcon size={14}/> Imagen del producto (URL)</label>
            <input type="url" value={productImageUrl} onChange={e=> setProductImageUrl(e.target.value)} className="px-3 py-2 border rounded-none" placeholder="https://.../imagen.jpg" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 flex items-center gap-1">R$ Valor total</label>
            <input type="number" step="0.01" min="0" value={total} onChange={e=> setTotal(e.target.value)} className="px-3 py-2 border rounded-none" required />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 flex items-center gap-1"><Hash size={14}/> # de cuotas</label>
            <input type="number" min="1" value={count} onChange={e=> setCount(e.target.value)} className="px-3 py-2 border rounded-none" required />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 flex items-center gap-1">R$ Valor por cuota</label>
            <input type="text" value={perInstallment.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} readOnly className="px-3 py-2 border rounded-none bg-gray-50" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 flex items-center gap-1"><CreditCard size={14}/> Forma de pago</label>
            <input type="text" value={paymentMethod} onChange={e=> setPaymentMethod(e.target.value)} className="px-3 py-2 border rounded-none" placeholder="tarjeta, PIX, transferencia" />
          </div>
        </div>
        <div className="p-4 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-none border">Cancelar</button>
          <button onClick={() => onSaved({
            id: initial?.id,
            date,
            category,
            description,
            totalValue: parseCurrency(total),
            installmentsCount: Number(count),
            paymentMethod,
            productUrl,
            productImageUrl,
          })} className="px-4 py-2 rounded-none bg-black text-white hover:opacity-90">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

const InvestmentDetailsModal: React.FC<{ open: boolean; onClose: () => void; investment: Investment; installments: Installment[]; onTogglePaid: (id: string, paid: boolean) => void; }> = ({ open, onClose, investment, installments, onTogglePaid }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] overflow-auto relative">
        <button onClick={onClose} className="absolute top-3 right-3 bg-white border rounded-full p-1 shadow hover:bg-gray-50" aria-label="Cerrar">✕</button>
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">{investment.description}</h3>
        </div>
        {investment.productImageUrl && (
          <div className="px-4 pt-4">
            <div className="rounded-lg overflow-hidden border">
              <img src={investment.productImageUrl} alt="Produto" className="w-full max-h-72 object-contain bg-white" />
            </div>
          </div>
        )}
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-sm text-gray-600">Fecha</div>
            <div className="font-medium">{investment.date}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Categoría</div>
            <div className="font-medium capitalize">{investment.category}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Valor total</div>
            <div className="font-medium">R$ {Number(investment.totalValue || 0).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600"># de cuotas</div>
            <div className="font-medium">{investment.installmentsCount} × R$ {Number(investment.installmentValue || 0).toFixed(2)}</div>
          </div>
          {investment.productUrl && (
            <div className="md:col-span-2">
              <a href={investment.productUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline text-sm">ver producto</a>
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="font-medium mb-2">Cuotas mensuales</div>
          <div className="space-y-2">
            {installments.map(inst => (
              <label key={inst.id} className="flex items-center gap-3 p-2 border rounded">
                <input type="checkbox" checked={inst.status === 'pagado'} onChange={e => onTogglePaid(inst.id, e.target.checked)} />
                <span className="text-sm flex-1">{inst.installmentNumber}/{investment.installmentsCount} • {inst.dueDate} • R$ {inst.amount.toFixed(2)}</span>
                {inst.status === 'pagado' && <span className="text-green-600 text-xs">pagado</span>}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvestmentsManagement;
