import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, Search, CheckCircle } from 'lucide-react';
import { DBPackage, updatePackage } from '../../utils/packagesService';
import { storage } from '../../utils/firebaseClient';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../utils/firebaseClient';

interface PackageEditorModalProps {
  open: boolean;
  onClose: () => void;
  pkg: DBPackage | null;
  onSaved?: (updated: DBPackage) => void;
}

const PackageEditorModal: React.FC<PackageEditorModalProps> = ({ open, onClose, pkg, onSaved }) => {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [duration, setDuration] = useState('');
  const [description, setDescription] = useState('');
  const [featuresText, setFeaturesText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState<string | undefined>('');
  const [sections, setSections] = useState<string[]>([]);
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSection, setNewSection] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | undefined>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  // key format: productId or productId||Variant Name
  const [included, setIncluded] = useState<Record<string, number>>({});
  const [manualId, setManualId] = useState<string>('');
  const [manualQty, setManualQty] = useState<number>(1);
  const parseKey = (key: string) => { const [id, variantName] = key.split('||'); return { id, variantName }; };
  const getVariantNames = (p: any): string[] => {
    const names: string[] = [];
    if (Array.isArray(p.variantes) && p.variantes.length) { names.push(...p.variantes.map((v: any) => String(v?.nombre||'').trim()).filter(Boolean)); }
    else if (Array.isArray(p.variants) && p.variants.length) { names.push(...p.variants.map((v: any) => String(v?.name||'').trim()).filter(Boolean)); }
    return names.filter(Boolean);
  };

  useEffect(() => {
    if (!pkg) return;
    setTitle(pkg.title || '');
    setPrice(Number(pkg.price) || 0);
    setDuration(pkg.duration || '');
    setDescription(pkg.description || '');
    setFeaturesText((pkg.features || []).join('\n'));
    setImageUrl(pkg.image_url || '');
    setCategory(pkg.category || '');
    // load sections if present
    const s = Array.isArray((pkg as any).sections) ? (pkg as any).sections.slice() : [];
    setSections(s);
    setSelectedSection(s[0] || '');
    const incArr = Array.isArray((pkg as any).storeItemsIncluded) ? (pkg as any).storeItemsIncluded as any[] : [];
    const map: Record<string, number> = {};
    incArr.forEach(x => { if (x?.productId) map[String(x.productId)] = Number(x.quantity||1); });
    setIncluded(map);
  }, [pkg]);

  const handleUploadFile = async (file: File) => {
    if (!pkg) return;
    try {
      setUploading(true);
      setUploadError(null);
      const key = `packages/${pkg.id}/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, key);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setImageUrl(url);
      setSuccessMessage('Imagen subida correctamente');
    } catch (e: any) {
      setUploadError(e?.message || 'Falha ao enviar imagem');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const loadProducts = async () => {
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) { setProducts([]); return; }
        const snap = await getDocs(collection(db, 'products'));
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setProducts(list);
      } catch {
        setProducts([]);
      }
    };
    if (open) loadProducts();
  }, [open]);

  const handleSave = async () => {
    if (!pkg) return;
    try {
      setSaving(true);
      setError(null);
      console.log('PackageEditorModal: saving package', pkg.id);
      const updates = {
        title,
        price: Number(price) || 0,
        duration,
        description,
        features: featuresText
          .split('\n')
          .map(f => f.trim())
          .filter(Boolean),
        image_url: imageUrl,
        category: category || undefined,
      } as Partial<DBPackage>;
      (updates as any).sections = sections;
      (updates as any).storeItemsIncluded = Object.entries(included).map(([rawKey, quantity]) => { const { id, variantName } = parseKey(rawKey); return { productId: id, quantity: Number(quantity||0), ...(variantName ? { variantName } : {}) }; }).filter(x => x.quantity > 0);
      await updatePackage(pkg.id, updates);
      console.log('PackageEditorModal: package saved');
      const updated: DBPackage = { ...pkg, ...updates, sections } as DBPackage;
      onSaved && onSaved(updated);
      setSuccessMessage('Datos guardados correctamente');
    } catch (e: any) {
      console.error('PackageEditorModal: save error', e);
      const msg = e?.message || 'Erro ao salvar pacote';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !pkg) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-medium">Editar pacote</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {successMessage && (
            <div className="p-3 rounded border border-green-200 bg-green-50 text-green-700 text-sm flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600" />
              <span>{successMessage}</span>
            </div>
          )}
          {error && (
            <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm text-gray-700 mb-1">Título</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Preço (R$)</label>
              <input type="number" step="0.01" value={price} onChange={e => setPrice(Number(e.target.value))} className="w-full px-3 py-2 border rounded" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Duração</label>
              <input value={duration} onChange={e => setDuration(e.target.value)} className="w-full px-3 py-2 border rounded" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Descrição</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded" />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Recursos (um por linha)</label>
            <textarea value={featuresText} onChange={e => setFeaturesText(e.target.value)} rows={5} className="w-full px-3 py-2 border rounded" />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Imagem (URL)</label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="w-full px-3 py-2 border rounded" />
            <div className="mt-3">
              <div className="text-sm text-gray-700 mb-1">Ou envie uma imagem</div>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); }}
                  disabled={uploading}
                />
                {uploading && <span className="text-sm text-gray-500">Enviando...</span>}
              </div>
              {uploadError && (
                <div className="mt-2 p-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">{uploadError}</div>
              )}
              {imageUrl && (
                <div className="mt-3">
                  <img src={imageUrl} alt="Prévia da imagem" className="h-24 w-24 object-cover rounded" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Categoria (opcional)</label>
            <input value={category || ''} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>

          {/* Sections selector and management */}
          <div>
            <label className="block text-sm text-gray-700 mb-1">Sección</label>
            <div className="flex items-center gap-2">
              <select value={selectedSection || ''} onChange={e => setSelectedSection(e.target.value)} className="px-3 py-2 border rounded flex-1">
                <option value="">Sin sección</option>
                {sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <button type="button" title="Agregar" onClick={() => { setShowNewSection(true); setNewSection(''); }} className="p-2 border rounded text-gray-600">
                <Plus size={14} />
              </button>
              <button type="button" title="Eliminar sección" onClick={() => {
                if (!selectedSection) { window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Selecciona una sección para eliminar', type: 'info' } })); return; }
                if (!confirm(`Eliminar la sección "${selectedSection}"?`)) return;
                setSections(prev => prev.filter(x => x !== selectedSection));
                setSelectedSection(prev => {
                  const rem = sections.filter(x => x !== (prev || ''));
                  return rem[0] || '';
                });
              }} className="p-2 border rounded text-gray-600"><Trash2 size={14} /></button>
            </div>

            {showNewSection && (
              <div className="mt-2 flex items-center gap-2">
                <input value={newSection} onChange={e => setNewSection(e.target.value)} className="px-3 py-2 border rounded-md flex-1" placeholder="Nueva sección" />
                <button type="button" onClick={() => {
                  const v = (newSection || '').trim();
                  if (!v) return;
                  if (!sections.includes(v)) setSections(prev => [...prev, v]);
                  setSelectedSection(v);
                  setShowNewSection(false);
                  setNewSection('');
                }} className="p-2 bg-primary text-white rounded"><Plus size={14} /></button>
                <button type="button" onClick={() => { setShowNewSection(false); setNewSection(''); }} className="p-2 border rounded text-gray-600"><X size={14} /></button>
              </div>
            )}
          </div>
        </div>

        {/* Productos incluidos en el paquete */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm text-gray-700">Productos incluidos en el paquete</label>
            <div className="flex items-center gap-2">
              <Search size={16} className="text-gray-500" />
              <input value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Buscar" className="px-2 py-1 border rounded text-sm" />
            </div>
          </div>
          {/* Añadir manualmente / seleccionados */}
          <div className="mt-3">
            <div className="text-xs text-gray-600 mb-1">Añadir producto al paquete</div>
            <div className="flex items-center gap-2">
              <select value={manualId} onChange={e=>setManualId(e.target.value)} className="px-2 py-1 border rounded text-sm flex-1">
                <option value="">Selecciona un producto…</option>
                {products.flatMap(p => {
                  const s = productSearch.trim().toLowerCase();
                  const labelBase = String(p.name||p.id);
                  const match = !s || labelBase.toLowerCase().includes(s) || String(p.category||'').toLowerCase().includes(s);
                  const variants = getVariantNames(p);
                  if (variants.length) {
                    return variants
                      .filter(v => !s || v.toLowerCase().includes(s) || labelBase.toLowerCase().includes(s))
                      .map(v => (
                        <option key={`${p.id}||${v}`} value={`${p.id}||${v}`}>{labelBase} — {v}</option>
                      ));
                  }
                  return match ? [<option key={p.id} value={p.id}>{labelBase}</option>] : [];
                })}
              </select>
              <input type="number" min={1} value={manualQty} onChange={e=> setManualQty(Math.max(1, Number(e.target.value||1)))} className="w-24 px-2 py-1 border rounded text-sm" />
              <button type="button" onClick={()=>{ if(!manualId) return; setIncluded(prev=> ({ ...prev, [manualId]: manualQty })); }} className="px-3 py-1 bg-primary text-white rounded text-sm">Agregar</button>
            </div>
            {Object.keys(included).length > 0 && (
              <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
                <div className="text-xs text-gray-600 mb-2">Productos seleccionados</div>
                <ul className="grid grid-cols-1 gap-2">
                  {Object.entries(included).map(([rawKey, qty]) => {
                    const { id, variantName } = parseKey(rawKey);
                    const base = products.find(p=>p.id===id);
                    const display = variantName ? `${base?.name || id} — ${variantName}` : (base?.name || id);
                    return (
                      <li key={rawKey} className="flex items-center justify-between gap-2">
                        <div className="text-sm">{display}</div>
                        <div className="flex items-center gap-2">
                          <input type="number" min={0} value={qty} onChange={e=>{ const v=Math.max(0, Number(e.target.value||0)); setIncluded(prev=> ({ ...prev, [rawKey]: v })); }} className="w-20 px-2 py-1 border rounded text-sm" />
                          <button type="button" onClick={()=> setIncluded(prev=>{ const n={...prev}; delete n[rawKey]; return n; })} className="p-2 border rounded text-gray-600"><Trash2 size={14} /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <div className="text-xs text-gray-500 mt-1">Estos productos se añadirán automáticamente al carrito como items individuales al seleccionar este paquete (precio R$ 0 recomendado para evitar doble cobro).</div>
        </div>

        <div className="border-t p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded border">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving || uploading} className="px-4 py-2 rounded bg-primary text-white disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PackageEditorModal;
