import { useEffect, useRef, useState } from 'react';
import { X, Upload, Trash2, Check } from 'lucide-react';
import { db, storage } from '../../utils/firebaseClient';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';

export interface DressData {
  id?: string;
  name: string;
  color?: string;
  image_url?: string;
  active?: boolean;
}

interface DressEditorModalProps {
  open: boolean;
  onClose: () => void;
  dress: DressData | null;
  onSaved: () => void;
}

const DressEditorModal: React.FC<DressEditorModalProps> = ({ open, onClose, dress, onSaved }) => {
  const [form, setForm] = useState<DressData>({ name: '', color: '', image_url: '', active: true });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    if (dress) {
      setForm({ id: dress.id, name: dress.name || '', color: dress.color || '', image_url: dress.image_url || '', active: dress.active !== false });
    } else {
      setForm({ name: '', color: '', image_url: '', active: true });
    }
  }, [open, dress]);

  const testStorageWrite = async (): Promise<{ ok: boolean; code?: string; message?: string }> => {
    try {
      const blob = new Blob([`ping ${Date.now()}`], { type: 'text/plain' });
      const key = `diagnostics/_ping_${Date.now()}.txt`;
      const r = ref(storage, key);
      await uploadBytes(r, blob, { cacheControl: 'no-store' });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, code: e?.code, message: e?.message };
    }
  };

  const handleUpload = async (file: File) => {
    try {
      setUploading(true);
      setUploadProgress(0);
      // Optional preflight: try a tiny write to surface permission issues fast
      const pre = await testStorageWrite();
      if (!pre.ok && pre.code && pre.code.includes('unauth')) {
        window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'No autenticado para subir al Storage. Inicia sesión como admin.', type: 'error' } }));
        setUploading(false);
        setUploadProgress(null);
        return;
      }

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const key = `dresses/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const r = ref(storage, key);
      const task = uploadBytesResumable(r, file);

      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setUploadProgress(pct);
          },
          (err) => reject(err),
          () => resolve()
        );
      });

      const url = await getDownloadURL(task.snapshot.ref);
      setForm(prev => ({ ...prev, image_url: url }));
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Imagen subida al Storage', type: 'success' } }));
    } catch (e: any) {
      console.error('Upload failed', e);
      const code = e?.code || '';
      if (code.includes('unauthorized')) {
        window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Reglas de Firebase Storage bloquean la subida (unauthorized). Revisa reglas y que el usuario admin esté autenticado.', type: 'error' } }));
      } else if (code.includes('retry-limit-exceeded')) {
        window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Problema de red/CORS al subir (retry limit). Verifica CORS, conexión y dominios autorizados.', type: 'error' } }));
      } else {
        window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Error al subir la imagen. Revisa consola y reglas de Storage.', type: 'error' } }));
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const reuploadToBucket = async (src: string): Promise<string> => {
    // Only attempt reupload for data URLs; external HTTP(S) often block CORS
    try {
      if (!src) return src;
      if (isFirebaseUrl(src)) return src;
      if (!src.startsWith('data:')) return src;

      const res = await fetch(src);
      const b = await res.blob();
      const ext = (b.type && b.type.split('/')[1]) || 'jpg';
      const key = `dresses/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const r = ref(storage, key);
      await uploadBytes(r, b);
      const url = await getDownloadURL(r);
      return url;
    } catch (e) {
      console.warn('Reupload to bucket failed, keeping original URL', e);
      return src;
    }
  };

  const isFirebaseUrl = (u?: string | null) => {
    if (!u) return false;
    return u.includes('firebasestorage.googleapis.com') || u.includes('storage.googleapis.com');
  };

  const save = async () => {
    try {
      setSaving(true);

      // Ensure image is stored in our bucket
      let finalImageUrl = form.image_url || '';
      if (finalImageUrl && !isFirebaseUrl(finalImageUrl)) {
        finalImageUrl = await reuploadToBucket(finalImageUrl);
      }

      const payload: any = {
        name: form.name || 'Vestido',
        image_url: finalImageUrl || '',
        category: 'vestidos',
        tags: form.color ? [form.color] : [],
        price: 0,
        active: form.active !== false,
        updated_at: new Date().toISOString(),
      };
      if (form.id) {
        await updateDoc(doc(db, 'products', form.id), payload);
      } else {
        await addDoc(collection(db, 'products'), { ...payload, created_at: new Date().toISOString() });
      }
      onSaved();
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: form.id ? 'Vestido actualizado' : 'Vestido creado', type: 'success', refresh: true } }));
      onClose();
    } catch (e) {
      console.error('Error saving dress', e);
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'No se pudo guardar el vestido', type: 'error' } }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!form.id) return onClose();
    try {
      setSaving(true);
      await deleteDoc(doc(db, 'products', form.id));
      onSaved();
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Vestido eliminado', type: 'success', refresh: true } }));
      onClose();
    } catch (e) {
      console.error('Error deleting dress', e);
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'No se pudo eliminar el vestido', type: 'error' } }));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{form.id ? 'Editar Vestido' : 'Agregar Vestido'}</h3>
          <button onClick={onClose} className="p-2 rounded-none border border-black text-black hover:bg-black hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nombre</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-none" />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Color</label>
            <input value={form.color || ''} onChange={e => setForm({ ...form, color: e.target.value })} className="w-full px-3 py-2 border rounded-none" placeholder="Ej: Azul, Verde" />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Imagen</label>
            <div className="border-2 border-dashed rounded-lg p-4 text-center text-gray-500 cursor-pointer" onClick={() => fileRef.current?.click()}>
              <Upload size={18} className="inline mr-2" /> Subir imagen (JPG, PNG, WebP)
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files && e.target.files[0] && handleUpload(e.target.files[0])} />
            </div>
            {uploading && (
              <div className="text-sm text-gray-700 mt-2">
                Subiendo{uploadProgress !== null ? ` ${uploadProgress}%` : '...'}
              </div>
            )}
            {form.image_url && (
              <div className="mt-3 relative aspect-[9/16]">
                <img src={(function(u){ if(!u) return ''; if(/^https?:\/\//i.test(u)) return u; if(u.startsWith('gs://')){ try { const bucket = ((storage as any)?.app?.options?.storageBucket)||''; const without = u.slice(5); const idx = without.indexOf('/'); const path = idx>=0? without.slice(idx+1): without; const enc = encodeURIComponent(path); if(bucket) return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${enc}?alt=media`; } catch(_){} } return u; })(form.image_url)} alt="preview" className="absolute inset-0 w-full h-full object-cover rounded" />
                <button className="absolute top-2 right-2 bg-white border-2 border-black text-black rounded-none p-1 hover:bg-black hover:text-white" onClick={() => setForm({ ...form, image_url: '' })}>
                  <X size={14} />
                </button>
              </div>
            )}
            <input
              placeholder="o pega la URL manualmente"
              value={form.image_url || ''}
              onChange={e => setForm({ ...form, image_url: e.target.value })}
              className="mt-2 w-full px-3 py-2 border rounded"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.active} onChange={e => setForm(prev => ({ ...prev, active: e.target.checked }))} /> Activo</label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            {form.id && (
              <button onClick={remove} disabled={saving} className="px-4 py-2 border-2 border-red-600 text-red-600 rounded-none hover:bg-red-600 hover:text-white flex items-center gap-2"><Trash2 size={16} /> Eliminar</button>
            )}
            <button onClick={save} disabled={saving} className="px-4 py-2 border-2 border-black text-black rounded-none hover:bg-black hover:text-white flex items-center gap-2"><Check size={16} /> Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DressEditorModal;
