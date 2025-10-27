import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { formatPrice } from '../../utils/format';
import { DBCoupon, bestCouponForItem, fetchCoupons } from '../../utils/couponsService';

export interface PackageLike {
  id: string;
  title: string;
  description?: string;
  image?: string;
  priceNumber: number;
  type: 'portrait' | 'maternity' | 'events';
  features?: string[];
  includes?: { label: string; quantity: number }[];
}

interface AddPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  pkg: PackageLike | null;
  onAdd: (payload: { id: string; name: string; priceNumber: number; image?: string }) => void;
}

const AddPackageModal: React.FC<AddPackageModalProps> = ({ isOpen, onClose, pkg, onAdd }) => {
  const [coupons, setCoupons] = useState<DBCoupon[]>([]);
  const [applyCoupon, setApplyCoupon] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCoupons([]);
      setApplyCoupon(false);
      return;
    }
    (async () => {
      try {
        const list = await fetchCoupons();
        setCoupons(list);
      } catch {
        setCoupons([]);
      }
    })();
  }, [isOpen]);

  const best = useMemo(() => {
    if (!pkg) return { coupon: null as DBCoupon | null, discount: 0, label: '' };
    const item = { id: pkg.id, name: pkg.title, type: pkg.type, price: pkg.priceNumber } as any;
    const { coupon, discount } = bestCouponForItem(coupons, item);
    let label = '';
    if (coupon && discount > 0) {
      label = coupon.discountType === 'percentage'
        ? `-${Math.round(Number(coupon.discountValue || 0))}%`
        : `-${formatPrice(discount)}`;
    }
    return { coupon, discount, label };
  }, [pkg, coupons]);

  const effectivePrice = useMemo(() => {
    if (!pkg) return 0;
    const base = Number(pkg.priceNumber || 0);
    if (applyCoupon && best.discount > 0) return Math.max(0, base - Number(best.discount));
    return base;
  }, [pkg, applyCoupon, best.discount]);

  if (!isOpen || !pkg) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="bg-white rounded-xl w-full max-w-lg md:max-w-xl max-h-[85vh] overflow-auto relative">
        <button onClick={onClose} className="absolute top-3 right-3 bg-white border rounded-full p-1 shadow hover:bg-gray-50" aria-label="Fechar">
          <X size={18} />
        </button>
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">{pkg.title}</h3>
          {pkg.description && <p className="text-sm text-gray-600">{pkg.description}</p>}
          {pkg.image && (
            <div className="mt-3 rounded-lg overflow-hidden">
              <img loading="lazy" src={pkg.image} alt={pkg.title} className="w-full h-40 md:h-48 object-cover" />
            </div>
          )}
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Preço</span>
            <span className="text-xl font-playfair text-primary">{formatPrice(pkg.priceNumber)}</span>
          </div>

          {best.coupon && best.discount > 0 && (
            <div className="p-3 border rounded-md bg-green-50 text-green-800">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={applyCoupon}
                  onChange={(e) => setApplyCoupon(e.target.checked)}
                />
                <span className="text-sm">Aplicar cupom de desconto {best.coupon.code} {best.label}</span>
              </label>
              {applyCoupon && (
                <div className="mt-1 text-xs">
                  Total com desconto: <span className="font-semibold">{formatPrice(effectivePrice)}</span>
                </div>
              )}
            </div>
          )}

          {Array.isArray(pkg.features) && pkg.features.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">O que inclui</div>
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                {pkg.features.map((f, i) => (<li key={i}>{f}</li>))}
              </ul>
            </div>
          )}

          {Array.isArray(pkg.includes) && pkg.includes.length > 0 && (
            <div>
              <div className="text-sm text-gray-600 mb-1">Produtos incluídos</div>
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                {pkg.includes.map((it, i) => (
                  <li key={i}>{it.label} x{Number(it.quantity || 0)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="p-4 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md border">Cancelar</button>
          <button
            onClick={() => {
              onAdd({ id: pkg.id, name: pkg.title, priceNumber: effectivePrice, image: pkg.image });
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

export default AddPackageModal;
