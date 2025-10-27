import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, Mic, StopCircle } from 'lucide-react';
import { formatPrice } from '../../utils/format';
import type { Product } from '../../types/store';
import { fetchCoupons, DBCoupon, bestCouponForItem, filterActiveCoupons, isItemApplicable, computeCouponDiscountForCart } from '../../utils/couponsService';

interface AddToCartModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: (Product & {
    tieneVariantes?: boolean;
    variantes?: { nombre: string; precio: number }[];
    variants?: { name: string; priceDelta?: number; price?: number }[];
    permiteTexto?: boolean;
    permiteFoto?: boolean;
    permiteAudio?: boolean;
    allow_name?: boolean;
    allow_custom_image?: boolean;
  }) | null;
  coupons?: DBCoupon[];
  onAdd: (payload: {
    id: string;
    name: string;
    priceNumber: number;
    image?: string;
    variantName?: string;
    customText?: string;
    customImageDataUrl?: string | null;
    customAudioDataUrl?: string | null;
    appliedCoupon?: { id: string; code: string; discount: number; discountType: 'percentage' | 'fixed' | 'full'; discountValue?: number };
  }) => void;
}

const MAX_IMAGE_MB = 10;
const MAX_AUDIO_MB = 25;

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImageToDataURL(file: File, maxWidth = 2048, quality = 0.85): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = document.createElement('img');
  await new Promise(r => { img.onload = r as any; img.onerror = r as any; img.src = url; });
  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return await fileToDataURL(file);
  ctx.drawImage(img, 0, 0, w, h);
  const mime = 'image/webp';
  const dataUrl = canvas.toDataURL(mime, quality);
  URL.revokeObjectURL(url);
  return dataUrl;
}

function bytesToMB(bytes: number) { return bytes / (1024 * 1024); }

const AddToCartModal: React.FC<AddToCartModalProps> = ({ isOpen, onClose, product, coupons: couponsProp, onAdd }) => {
  const [selectedVariant, setSelectedVariant] = useState<number>(0);
  const [customText, setCustomText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  const [coupons, setCoupons] = useState<DBCoupon[]>([]);
  const [applyCoupon, setApplyCoupon] = useState(false);
  const [selectedExclusiveId, setSelectedExclusiveId] = useState<string | null>(null);
  const [selectedComboIds, setSelectedComboIds] = useState<Set<string>>(new Set());
  const [variantTouched, setVariantTouched] = useState(false);
  const [autoAppliedOnce, setAutoAppliedOnce] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedVariant(0);
      setVariantTouched(false);
      setCustomText('');
      setImageDataUrl(null);
      setAudioDataUrl(null);
      setRecording(false);
      setCoupons([]);
      setApplyCoupon(false);
      setSelectedExclusiveId(null);
      setSelectedComboIds(new Set());
      setAutoAppliedOnce(false);
    } else {
      (async () => {
        try {
          const list = await fetchCoupons();
          console.log('AddToCartModal coupons fetched:', list);
          setCoupons(list);
        } catch (e) {
          console.error('AddToCartModal fetchCoupons failed:', e);
          setCoupons([]);
        }
      })();
    }
  }, [isOpen, couponsProp]);

  const hasVariants = useMemo(() => {
    if (!product) return false;
    if (product.tieneVariantes) return true;
    const v1 = Array.isArray(product.variantes) && product.variantes.length > 0;
    const v2 = Array.isArray(product.variants) && product.variants.length > 0;
    return v1 || v2;
  }, [product]);

  const variantOptions = useMemo(() => {
    if (!product) return [] as { label: string; price: number }[];
    const base = Number(product.price || 0);
    const result: { label: string; price: number }[] = [];
    if (Array.isArray(product.variantes) && product.variantes.length) {
      for (const v of product.variantes) {
        result.push({ label: v.nombre, price: Number(v.precio) });
      }
    } else if (Array.isArray(product.variants) && product.variants.length) {
      for (const v of product.variants) {
        const price = v.price != null ? Number(v.price) : base + Number(v.priceDelta || 0);
        result.push({ label: v.name, price });
      }
    }
    if (result.length === 0) {
      result.push({ label: 'Padrão', price: base });
    }
    return result;
  }, [product]);

  const selectedPrice = useMemo(() => {
    const base = Number(product?.price || 0);
    if (!hasVariants) return base;
    return variantOptions[selectedVariant]?.price ?? base;
  }, [product, hasVariants, variantOptions, selectedVariant]);

  const variantDiscountInfo = useMemo(() => {
    if (!product) return [] as { label: string; hasDiscount: boolean; labelText: string }[];
    return variantOptions.map((opt) => {
      const item = { id: String(product.id), name: product.name, type: 'store', price: opt.price, variantName: hasVariants ? (opt.label || '') : '' } as any;
      const { coupon, discount } = bestCouponForItem(coupons, item);
      let labelText = '';
      if (coupon && discount > 0) {
        labelText = coupon.discountType === 'percentage' ? `-${Math.round(Number(coupon.discountValue || 0))}%` : `-${formatPrice(discount)}`;
      }
      return { label: opt.label, hasDiscount: Boolean(coupon && discount > 0), labelText };
    });
  }, [product, variantOptions, coupons, hasVariants]);

  const best = useMemo(() => {
    if (!product) return { coupon: null as DBCoupon | null, discount: 0, label: '' };
    const item = { id: String(product.id), name: product.name, type: 'store', price: selectedPrice, variantName: hasVariants ? (variantOptions[selectedVariant]?.label || '') : '' } as any;
    const { coupon, discount } = bestCouponForItem(coupons, item);
    let label = '';
    if (coupon && discount > 0) {
      label = coupon.discountType === 'percentage'
        ? `-${Math.round(Number(coupon.discountValue || 0))}%`
        : `-${formatPrice(discount)}`;
    }
    return { coupon, discount, label };
  }, [product, selectedPrice, coupons, hasVariants, selectedVariant]);

  useEffect(() => { if (!isOpen) setApplyCoupon(false); }, [isOpen]);

  useEffect(() => {
    if (!autoAppliedOnce && best.coupon && best.discount > 0) {
      setApplyCoupon(true);
      setAutoAppliedOnce(true);
    }
  }, [autoAppliedOnce, best.coupon, best.discount]);

  useEffect(() => {
    console.log('AddToCartModal bestCoupon update:', best);
  }, [best.coupon, best.discount, best.label]);

  const applicable = useMemo(() => {
    if (!product) return { exclusive: [] as DBCoupon[], combinable: [] as DBCoupon[] };
    const item = { id: String(product.id), name: product.name, type: 'store', price: selectedPrice, variantName: hasVariants ? (variantOptions[selectedVariant]?.label || '') : '' } as any;
    const list = filterActiveCoupons(coupons).filter(c => isItemApplicable(c.appliesTo as any, item));
    return {
      exclusive: list.filter(c => !c.combinable),
      combinable: list.filter(c => c.combinable)
    };
  }, [product, selectedPrice, coupons]);

  const effectivePrice = useMemo(() => {
    const base = Number(selectedPrice || 0);
    const discount = applyCoupon ? Math.max(0, Number(best.discount || 0)) : 0;
    return Math.max(0, base - discount);
  }, [selectedPrice, applyCoupon, best.discount]);

  const handleImagePick = async (file: File) => {
    const mb = bytesToMB(file.size);
    if (mb > MAX_IMAGE_MB) {
      try {
        const dataUrl = await compressImageToDataURL(file);
        setImageDataUrl(dataUrl);
      } catch {
        alert('Imagem muito grande. Tente um arquivo menor que 10MB.');
      }
    } else {
      const dataUrl = await fileToDataURL(file);
      setImageDataUrl(dataUrl);
    }
  };

  const handleAudioPick = async (file: File) => {
    const mb = bytesToMB(file.size);
    if (mb > MAX_AUDIO_MB) {
      alert('Áudio muito grande. Máx. 25MB.');
      return;
    }
    const dataUrl = await fileToDataURL(file);
    setAudioDataUrl(dataUrl);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const sizeMb = bytesToMB(blob.size);
        if (sizeMb > MAX_AUDIO_MB) {
          alert('Áudio muito grande. Máx. 25MB.');
          return;
        }
        const dataUrl = await fileToDataURL(new File([blob], 'gravacao.webm', { type: 'audio/webm' }));
        setAudioDataUrl(dataUrl);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      alert('Não foi possível iniciar a gravação. Verifique as permissões.');
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && recording) {
      mr.stop();
      setRecording(false);
    }
  };

  if (!isOpen || !product) return null;

  const canText = product.permiteTexto || product.allow_name;
  const canPhoto = product.permiteFoto || product.allow_custom_image;
  const canAudio = product.permiteAudio || false;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="bg-white rounded-xl w-full max-w-2xl overflow-hidden relative">
        <button onClick={onClose} className="absolute top-3 right-3 bg-white border rounded-full p-1 shadow hover:bg-gray-50" aria-label="Fechar">
          <X size={18} />
        </button>
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">{product.name}</h3>
          <p className="text-sm text-gray-600">{product.description}</p>
        </div>

        <div className="p-4 space-y-4">
          {hasVariants ? (
            <div>
              <label className="block text-sm text-gray-700 mb-1">Opções</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {variantOptions.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setSelectedVariant(idx); setVariantTouched(true); }}
                    className={`px-3 py-2 border rounded-lg text-left ${
                      variantDiscountInfo[idx]?.hasDiscount ? 'border-green-600 bg-green-50' : ''
                    } ${selectedVariant===idx? 'ring-1 ring-black' : 'hover:bg-gray-50'}`}
                  >
                    <div className="font-medium flex items-center gap-2">
                      <span>{opt.label}</span>
                      {variantDiscountInfo[idx]?.hasDiscount && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600 text-white">{variantDiscountInfo[idx]?.labelText}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600">{formatPrice(opt.price)}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-gray-700">{product.description}</div>
              <div className="text-lg font-semibold text-primary">{formatPrice(Number(product.price||0))}</div>
            </div>
          )}

          {(best.coupon && best.discount > 0) && (
            <div className="p-3 border rounded-md bg-green-50 text-green-800">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={applyCoupon}
                  onChange={(e) => setApplyCoupon(e.target.checked)}
                />
                <span className="text-sm">Aplicar cupon</span>
                {best.coupon && best.label && (
                  <span className="ml-2 text-xs font-medium">— {best.coupon.code} {best.label}</span>
                )}
              </label>
              {applyCoupon && (
                <div className="mt-2 text-xs">
                  Total com desconto: <span className="font-semibold">{formatPrice(effectivePrice)}</span>
                </div>
              )}
            </div>
          )}

          {canText && (
            <div>
              <label className="block text-sm text-gray-700 mb-1">Texto personalizado (opcional)</label>
              <input value={customText} onChange={e=> setCustomText(e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="Ex.: Nome, mensagem..." />
            </div>
          )}

          {canPhoto && (
            <div>
              <label className="block text-sm text-gray-700 mb-1">Foto (JPG, PNG, WebP) — máx. 10MB</label>
              <div className="flex items-center gap-2">
                <button onClick={() => imgInputRef.current?.click()} className="px-3 py-2 border rounded-md inline-flex items-center gap-2">
                  <Upload size={16}/> Selecionar imagem
                </button>
                {imageDataUrl && <span className="text-xs text-gray-600">Imagem selecionada</span>}
              </div>
              <input ref={imgInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) handleImagePick(f); }} />
              {imageDataUrl && (
                <div className="mt-2">
                  <img src={imageDataUrl} alt="preview" className="max-h-40 rounded border" />
                </div>
              )}
            </div>
          )}

          {canAudio && (
            <div>
              <label className="block text-sm text-gray-700 mb-1">Áudio (MP3, WAV, OGG) �� máx. 25MB</label>
              <div className="flex items-center gap-2 flex-wrap">
                {!recording ? (
                  <button onClick={startRecording} className="px-3 py-2 border rounded-md inline-flex items-center gap-2">
                    <Mic size={16}/> Gravar mensagem
                  </button>
                ) : (
                  <button onClick={stopRecording} className="px-3 py-2 border rounded-md inline-flex items-center gap-2 text-red-600 border-red-600">
                    <StopCircle size={16}/> Parar gravação
                  </button>
                )}
                <span className="text-xs text-gray-500">ou</span>
                <button onClick={() => audioInputRef.current?.click()} className="px-3 py-2 border rounded-md">Enviar arquivo</button>
                <input ref={audioInputRef} type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) handleAudioPick(f); }} />
                {audioDataUrl && <span className="text-xs text-green-700">Áudio anexado</span>}
              </div>
              {audioDataUrl && (
                <audio controls className="mt-2 w-full">
                  <source src={audioDataUrl} />
                </audio>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md border">Cancelar</button>
          <button
            onClick={() => {
              const variantName = hasVariants ? variantOptions[selectedVariant]?.label : undefined;
              const payload = {
                id: String(product.id),
                name: product.name,
                priceNumber: Number(effectivePrice || product.price || 0),
                image: product.image_url,
                variantName,
                customText: customText.trim() || undefined,
                customImageDataUrl: imageDataUrl,
                customAudioDataUrl: audioDataUrl,
                appliedCoupon: (applyCoupon && best.coupon && best.discount > 0)
                  ? { id: best.coupon.id, code: best.coupon.code, discount: best.discount, discountType: best.coupon.discountType, discountValue: best.coupon.discountValue }
                  : undefined,
              };
              console.log('AddToCartModal onAdd payload:', payload);
              onAdd(payload);
              onClose();
            }}
            className="px-4 py-2 rounded-md bg-black text-white hover:opacity-90"
          >
            {`Adicionar ao Carrinho - ${formatPrice(effectivePrice)}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddToCartModal;
