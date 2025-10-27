import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DBCoupon, fetchCoupons, createCoupon, updateCoupon, deleteCoupon } from '../../utils/couponsService';
import { DBPackage, fetchPackages as fetchAllPackages } from '../../utils/packagesService';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../utils/firebaseClient';

const discountTypeOptions = [
  { value: 'percentage', label: 'Porcentaje' },
  { value: 'fixed', label: 'Monto fijo' },
  { value: 'full', label: 'Total (FREE)' },
] as const;

const CouponsManagement: React.FC = () => {
  const [coupons, setCoupons] = useState<DBCoupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterType, setFilterType] = useState<'all' | 'percentage' | 'fixed' | 'full'>('all');
  const [filterApplies, setFilterApplies] = useState<string>('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DBCoupon | null>(null);

  const [form, setForm] = useState<Partial<DBCoupon>>({ code: '', discountType: 'fixed', combinable: false, status: true });
  const [allPackages, setAllPackages] = useState<DBPackage[]>([]);
  const [storeProducts, setStoreProducts] = useState<{ id: string; name: string; variants?: string[] }[]>([]);
  const [appliesOpen, setAppliesOpen] = useState(false);
  const appliesRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchCoupons();
      setCoupons(list);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los cupones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!appliesRef.current) return;
      if (!appliesRef.current.contains(e.target as Node)) setAppliesOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        const raw = snap.docs.map(d => {
          const data = d.data() as any;
          const varNames: string[] = Array.isArray(data?.variantes)
            ? data.variantes.map((v: any) => String(v?.name || v?.nombre || v?.nome || v?.label || '').trim()).filter(Boolean)
            : Array.isArray(data?.variants)
              ? data.variants.map((v: any) => String(v?.name || v?.nombre || v?.nome || v?.label || '').trim()).filter(Boolean)
              : [];
          return {
            id: d.id,
            name: String(data?.name || 'Producto'),
            price: Number(data?.price || 0),
            category: String(data?.category || '').toLowerCase().trim(),
            variants: varNames,
          } as any;
        });
        const seen = new Set<string>();
        const unique: { id: string; name: string; variants?: string[] }[] = [];
        for (const p of raw as any[]) {
          const key = `${p.name.trim().toLowerCase()}|${p.price}|${p.category}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push({ id: p.id, name: p.name, variants: (p.variants && p.variants.length ? p.variants : undefined) });
          }
        }
        // Ordenar alfabéticamente para mejor UX
        unique.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        setStoreProducts(unique);
      } catch (e) {
        console.error('Error fetching store products:', e);
        setStoreProducts([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchAllPackages();
        setAllPackages(list);
      } catch {
        setAllPackages([]);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return coupons.filter(c => {
      if (filterStatus === 'active' && c.status === false) return false;
      if (filterStatus === 'inactive' && c.status !== false) return false;
      if (filterType !== 'all' && c.discountType !== filterType) return false;
      if (filterApplies && !JSON.stringify(c.appliesTo || '').toLowerCase().includes(filterApplies.toLowerCase())) return false;
      return true;
    });
  }, [coupons, filterStatus, filterType, filterApplies]);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', description: '', discountType: 'fixed', discountValue: 0, appliesTo: [], combinable: false, usageLimit: undefined, validFrom: undefined, validTo: undefined, status: true });
    setEditorOpen(true);
  };

  const openEdit = (c: DBCoupon) => {
    setEditing(c);
    const applies = Array.isArray(c.appliesTo) ? c.appliesTo : (c.appliesTo ? [String(c.appliesTo)] : []);
    setForm({ ...c, appliesTo: applies });
    setEditorOpen(true);
  };

  const save = async () => {
    try {
      if (!form.code || !String(form.code).trim()) { setError('Código requerido'); return; }
      if (!form.discountType) { setError('Tipo de descuento requerido'); return; }
      if (form.discountType !== 'full' && (form.discountValue == null || isNaN(Number(form.discountValue)))) {
        setError('Valor de descuento requerido'); return;
      }
      if (editing) {
        await updateCoupon(editing.id, {
          code: String(form.code).trim(),
          description: form.description || '',
          discountType: form.discountType as any,
          discountValue: form.discountType === 'full' ? 0 : Number(form.discountValue || 0),
          appliesTo: form.appliesTo as any,
          combinable: Boolean(form.combinable),
          validFrom: form.validFrom || null,
          validTo: form.validTo || null,
          usageLimit: form.usageLimit != null ? Number(form.usageLimit) : undefined,
          status: Boolean(form.status),
        });
      } else {
        await createCoupon({
          id: '' as any,
          code: String(form.code).trim(),
          description: form.description || '',
          discountType: form.discountType as any,
          discountValue: form.discountType === 'full' ? 0 : Number(form.discountValue || 0),
          appliesTo: form.appliesTo as any,
          combinable: Boolean(form.combinable),
          validFrom: form.validFrom || null,
          validTo: form.validTo || null,
          usageLimit: form.usageLimit != null ? Number(form.usageLimit) : undefined,
          usedCount: 0,
          status: Boolean(form.status),
          created_at: undefined,
          updated_at: undefined,
        } as any);
      }
      setSuccess('Datos guardados correctamente');
      setEditorOpen(false);
      await load();
      setTimeout(() => setSuccess(null), 2500);
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Eliminar cupón?')) return;
    try {
      await deleteCoupon(id);
      await load();
      setSuccess('Cupón eliminado');
      setTimeout(() => setSuccess(null), 2000);
    } catch (e: any) {
      setError(e?.message || 'No se pudo eliminar');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="section-title">Cupones de Descuento</h2>
        <button onClick={openCreate} className="px-4 py-2 border-2 border-black text-black rounded-none hover:bg-black hover:text-white">+ Nuevo Cupón</button>
      </div>

      {success && <div className="mb-4 p-3 rounded border border-green-200 bg-green-50 text-green-700 text-sm">{success}</div>}
      {loading && <div className="text-gray-600">Cargando...</div>}
      {error && <div className="text-red-600">{error}</div>}

      <div className="flex gap-3 mb-4 items-end">
        <div>
          <label className="block text-xs text-gray-600">Estado</label>
          <select value={filterStatus} onChange={(e)=>setFilterStatus(e.target.value as any)} className="border px-2 py-1">
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600">Tipo</label>
          <select value={filterType} onChange={(e)=>setFilterType(e.target.value as any)} className="border px-2 py-1">
            <option value="all">Todos</option>
            {discountTypeOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600">Aplica a</label>
          <input value={filterApplies} onChange={(e)=>setFilterApplies(e.target.value)} placeholder="prewedding / portrait / productos" className="border px-2 py-1" />
        </div>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Código</th>
              <th className="text-left p-2">Descripción</th>
              <th className="text-left p-2">Tipo</th>
              <th className="text-left p-2">Valor</th>
              <th className="text-left p-2">Aplica a</th>
              <th className="text-left p-2">Uso</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-left p-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="border-t">
                <td className="p-2 font-mono">{c.code}</td>
                <td className="p-2">{c.description}</td>
                <td className="p-2 capitalize">{c.discountType}</td>
                <td className="p-2">{c.discountType === 'full' ? '-' : Number(c.discountValue || 0)}</td>
                <td className="p-2">{Array.isArray(c.appliesTo) ? c.appliesTo.join(', ') : (c.appliesTo || 'todos')}</td>
                <td className="p-2">{Number(c.usedCount || 0)}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                <td className="p-2">{c.status === false ? 'Inactivo' : 'Activo'}</td>
                <td className="p-2 flex gap-2">
                  <button onClick={()=>openEdit(c)} className="px-2 py-1 border-2 border-black text-black hover:bg-black hover:text-white">Editar</button>
                  <button onClick={()=>remove(c.id)} className="px-2 py-1 border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-white">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editorOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl p-6 rounded shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{editing ? 'Editar Cupón' : 'Nuevo Cupón'}</h3>
              <button onClick={()=>setEditorOpen(false)} className="text-gray-600">✕</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm">Código</label>
                <input value={form.code as any} onChange={(e)=>setForm(f=>({...f, code: e.target.value}))} className="input-base" />
              </div>
              <div>
                <label className="block text-sm">Descripción</label>
                <input value={form.description as any} onChange={(e)=>setForm(f=>({...f, description: e.target.value}))} className="input-base" />
              </div>
              <div>
                <label className="block text-sm">Tipo de descuento</label>
                <select value={form.discountType as any} onChange={(e)=>setForm(f=>({...f, discountType: e.target.value as any}))} className="input-base">
                  {discountTypeOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm">Valor</label>
                <input type="number" value={Number(form.discountValue || 0)} onChange={(e)=>setForm(f=>({...f, discountValue: Number(e.target.value)}))} className="input-base" disabled={form.discountType==='full'} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm">Aplica a</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div ref={appliesRef} className="relative">
                    <button type="button" onClick={() => setAppliesOpen(v=>!v)} className="w-full input-base flex justify-between items-center">
                      <span>{(Array.isArray(form.appliesTo) ? form.appliesTo.length : (form.appliesTo ? 1 : 0)) > 0 ? `${Array.isArray(form.appliesTo) ? form.appliesTo.length : 1} seleccionado(s)` : 'Seleccionar...'}</span>
                      <span className="text-gray-500">▾</span>
                    </button>
                    {appliesOpen && (
                      <div className="absolute z-50 mt-1 w-full border bg-white rounded shadow max-h-64 overflow-auto">
                        <div className="px-3 py-2 text-xs text-gray-600 uppercase">Productos</div>
                        {storeProducts.map(prod => {
                          const opt = { value: prod.id, label: prod.name };
                          const selected = Array.isArray(form.appliesTo) ? (form.appliesTo as string[]).includes(opt.value) : form.appliesTo === opt.value;
                          return (
                            <div key={opt.value} className="px-0">
                              <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                                <input type="checkbox" checked={selected} onChange={() => {
                                  const current = Array.isArray(form.appliesTo) ? [...(form.appliesTo as string[])] : (form.appliesTo ? [String(form.appliesTo)] : []);
                                  const idx = current.indexOf(opt.value);
                                  if (idx >= 0) current.splice(idx,1); else current.push(opt.value);
                                  setForm(f=>({...f, appliesTo: current}));
                                }} />
                                <span className="text-sm">{opt.label}</span>
                              </label>
                              {Array.isArray(prod.variants) && prod.variants.length > 0 && (
                                <div className="ml-6 border-l pl-3 my-1">
                                  <div className="text-[10px] text-gray-500 uppercase">Variantes</div>
                                  {prod.variants.map(vn => {
                                    const vkey = `${opt.value}|v:${vn}`;
                                    const selectedVar = Array.isArray(form.appliesTo) ? (form.appliesTo as string[]).includes(vkey) : form.appliesTo === vkey;
                                    return (
                                      <label key={vkey} className="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs">
                                        <input type="checkbox" checked={selectedVar} onChange={() => {
                                          const current = Array.isArray(form.appliesTo) ? [...(form.appliesTo as string[])] : (form.appliesTo ? [String(form.appliesTo)] : []);
                                          const idx = current.indexOf(vkey);
                                          if (idx >= 0) current.splice(idx,1); else current.push(vkey);
                                          setForm(f=>({...f, appliesTo: current}));
                                        }} />
                                        <span>{vn}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="px-3 py-2 text-xs text-gray-600 uppercase border-t">Paquetes</div>
                        {allPackages.map(p => {
                          const opt = {value: p.id, label: p.title};
                          const selected = Array.isArray(form.appliesTo) ? (form.appliesTo as string[]).includes(opt.value) : form.appliesTo === opt.value;
                          return (
                            <label key={opt.value} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                              <input type="checkbox" checked={selected} onChange={() => {
                                const current = Array.isArray(form.appliesTo) ? [...(form.appliesTo as string[])] : (form.appliesTo ? [String(form.appliesTo)] : []);
                                const idx = current.indexOf(opt.value);
                                if (idx >= 0) current.splice(idx,1); else current.push(opt.value);
                                setForm(f=>({...f, appliesTo: current}));
                              }} />
                              <span className="text-sm">{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm text-gray-700 mb-1">Aplicado a:</div>
                    <div className="flex flex-wrap gap-2 p-2 border rounded min-h-[42px]">
                      {(() => {
                        const vals = Array.isArray(form.appliesTo) ? form.appliesTo as string[] : (form.appliesTo ? [String(form.appliesTo)] : []);
                        const labelFor = (v: string): string => {
                          if (v.includes('|v:')) {
                            const [pid, rest] = v.split('|v:');
                            const prod = storeProducts.find(sp => sp.id === pid);
                            if (prod) return `${prod.name} — ${rest}`;
                          }
                          const pkg = allPackages.find(p => p.id === v);
                          if (pkg) return pkg.title;
                          const prod = storeProducts.find(sp => sp.id === v);
                          if (prod) return prod.name;
                          return v;
                        };
                        return vals.length === 0 ? (
                          <span className="text-xs text-gray-500">Nada seleccionado</span>
                        ) : (
                          vals.map(v => (
                            <span key={v} className="px-2 py-1 bg-gray-100 rounded text-xs flex items-center gap-1">
                              {labelFor(v)}
                              <button type="button" className="text-gray-500 hover:text-gray-700" onClick={() => {
                                const current = vals.filter(x => x !== v);
                                setForm(f=>({...f, appliesTo: current}));
                              }}>✕</button>
                            </span>
                          ))
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm">Válido desde</label>
                <input type="date" value={form.validFrom ? new Date(form.validFrom.seconds ? form.validFrom.seconds*1000 : form.validFrom).toISOString().slice(0,10) : ''} onChange={(e)=>setForm(f=>({...f, validFrom: e.target.value ? new Date(e.target.value) : null}))} className="input-base" />
              </div>
              <div>
                <label className="block text-sm">Válido hasta</label>
                <input type="date" value={form.validTo ? new Date(form.validTo.seconds ? form.validTo.seconds*1000 : form.validTo).toISOString().slice(0,10) : ''} onChange={(e)=>setForm(f=>({...f, validTo: e.target.value ? new Date(e.target.value) : null}))} className="input-base" />
              </div>
              <div>
                <label className="block text-sm">Límite de usos</label>
                <input type="number" value={Number(form.usageLimit || 0)} onChange={(e)=>setForm(f=>({...f, usageLimit: Number(e.target.value)}))} className="input-base" />
              </div>
              <div>
                <label className="block text-sm">Estado</label>
                <select value={form.status===false?'false':'true'} onChange={(e)=>setForm(f=>({...f, status: e.target.value==='true'}))} className="input-base">
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={()=>setEditorOpen(false)} className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-none">Cancelar</button>
              <button onClick={save} className="px-4 py-2 border-2 border-black text-black rounded-none hover:bg-black hover:text-white">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CouponsManagement;
