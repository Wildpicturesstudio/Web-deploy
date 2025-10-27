import { db } from './firebaseClient';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  increment,
} from 'firebase/firestore';
import { withFirestoreRetry } from './firestoreRetry';

export type DiscountType = 'percentage' | 'fixed' | 'full';

export interface DBCoupon {
  id: string;
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue?: number;
  appliesTo?: string | string[]; // e.g. 'prewedding', 'todos', 'productos'
  combinable?: boolean;
  validFrom?: any;
  validTo?: any;
  usageLimit?: number;
  usedCount?: number;
  status?: boolean;
  created_at?: any;
  updated_at?: any;
}

function coerceCoupon(id: string, data: any): DBCoupon {
  return {
    id,
    code: String(data?.code || '').trim(),
    description: data?.description ? String(data.description) : undefined,
    discountType: (data?.discountType as DiscountType) || 'fixed',
    discountValue: data?.discountValue != null ? Number(data.discountValue) : undefined,
    appliesTo: Array.isArray(data?.appliesTo)
      ? (data.appliesTo as any[]).map((x) => String(x))
      : (data?.appliesTo ? String(data.appliesTo) : undefined),
    combinable: Boolean(data?.combinable ?? false),
    validFrom: data?.validFrom ?? undefined,
    validTo: data?.validTo ?? undefined,
    usageLimit: data?.usageLimit != null ? Number(data.usageLimit) : undefined,
    usedCount: data?.usedCount != null ? Number(data.usedCount) : 0,
    status: Boolean(data?.status ?? true),
    created_at: data?.created_at ?? null,
    updated_at: data?.updated_at ?? null,
  };
}

export async function fetchCoupons(): Promise<DBCoupon[]> {
  try {
    const colRef = collection(db, 'coupons');
    let q = colRef as any;
    try { q = query(colRef, orderBy('created_at', 'desc')); } catch (_) {}
    const snap = await withFirestoreRetry(() => getDocs(q));
    return snap.docs.map((d) => coerceCoupon(d.id, d.data()));
  } catch (err) {
    console.error('fetchCoupons error:', err);
    return [];
  }
}

export type CreateCouponInput = Omit<DBCoupon, 'id' | 'created_at' | 'updated_at' | 'usedCount'>;

export async function createCoupon(data: CreateCouponInput): Promise<string> {
  // Ensure unique code (best-effort)
  const existing = await findCouponByCode(data.code);
  if (existing) throw new Error('Código ya existe');
  const colRef = collection(db, 'coupons');
  const payload: any = {
    code: data.code.trim(),
    description: data.description || '',
    discountType: data.discountType,
    discountValue: data.discountType === 'full' ? 0 : Number(data.discountValue || 0),
    appliesTo: Array.isArray(data.appliesTo) ? data.appliesTo : (data.appliesTo || 'todos'),
    combinable: Boolean(data.combinable ?? false),
    validFrom: data.validFrom || null,
    validTo: data.validTo || null,
    usageLimit: data.usageLimit != null ? Number(data.usageLimit) : null,
    usedCount: 0,
    status: Boolean(data.status ?? true),
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
  const ref = await addDoc(colRef, payload);
  return ref.id;
}

export async function updateCoupon(id: string, updates: Partial<DBCoupon>): Promise<void> {
  const ref = doc(db, 'coupons', id);
  const payload: any = { ...updates };
  if (payload.code != null) payload.code = String(payload.code).trim();
  if (payload.discountType != null && payload.discountType === 'full') payload.discountValue = 0;
  if (payload.discountValue != null) payload.discountValue = Number(payload.discountValue);
  if (payload.appliesTo != null && !Array.isArray(payload.appliesTo)) payload.appliesTo = String(payload.appliesTo);
  payload.updated_at = serverTimestamp();
  await updateDoc(ref, payload);
}

export async function deleteCoupon(id: string): Promise<void> {
  const ref = doc(db, 'coupons', id);
  await deleteDoc(ref);
}

export async function findCouponByCode(code: string): Promise<DBCoupon | null> {
  if (!code) return null;
  const colRef = collection(db, 'coupons');
  const q = query(colRef, where('code', '==', code.trim()));
  const snap = await withFirestoreRetry(() => getDocs(q));
  const docSnap = snap.docs[0];
  return docSnap ? coerceCoupon(docSnap.id, docSnap.data()) : null;
}

export async function incrementCouponUsage(id: string): Promise<void> {
  const ref = doc(db, 'coupons', id);
  await updateDoc(ref, { usedCount: increment(1), updated_at: serverTimestamp() });
}

// Helpers to evaluate coupon applicability
export interface CartItemLike { id?: string; type?: string; name?: string; price?: string | number; quantity?: number; }

export function parseBRLLike(v: string | number | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[^0-9,\.]/g, '').replace('.', '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}

export function isItemApplicable(appliesTo: string | string[] | undefined, item: CartItemLike): boolean {
  if (!appliesTo || (Array.isArray(appliesTo) && appliesTo.length === 0)) return true;
  const arr = Array.isArray(appliesTo) ? appliesTo : [appliesTo];
  const id = (item.id || '').toLowerCase();
  const name = (item.name || '').toLowerCase();
  const type = (item.type || '').toLowerCase();
  const variant = (item as any).variantName ? String((item as any).variantName).toLowerCase() : '';
  const tags = [id, name, type];
  if (variant) {
    tags.push(variant);
    tags.push(`${id}|v:${variant}`);
  }
  return arr.some((rule) => {
    const r = String(rule).toLowerCase();
    if (r === 'todos' || r === 'all' || r === 'any') return true;
    if (r === 'productos' || r === 'store') return (type === 'store');
    if (r === 'prewedding') return (tags.some(t => t.includes('prewedding')) && !tags.some(t => t.includes('teaser')));
    if (r === 'portrait' || r === 'maternity' || r === 'events') return (tags.some(t => t.includes(r)));
    return tags.some(t => t.includes(r));
  });
}

export function computeCouponDiscountForCart(coupon: DBCoupon, cartItems: CartItemLike[]): { discount: number; eligibleSubtotal: number } {
  const eligibleItems = cartItems.filter((it) => isItemApplicable(coupon.appliesTo as any, it));
  const eligibleSubtotal = eligibleItems.reduce((sum, it) => sum + (parseBRLLike(it.price) * (Number(it.quantity) || 1)), 0);
  if (eligibleSubtotal <= 0) return { discount: 0, eligibleSubtotal: 0 };

  switch (coupon.discountType) {
    case 'full':
      return { discount: eligibleSubtotal, eligibleSubtotal };
    case 'percentage': {
      const v = Math.max(0, Math.min(100, Number(coupon.discountValue || 0)));
      return { discount: Math.round(eligibleSubtotal * (v / 100)), eligibleSubtotal };
    }
    case 'fixed': {
      const v = Math.max(0, Number(coupon.discountValue || 0));
      return { discount: Math.min(v, eligibleSubtotal), eligibleSubtotal };
    }
    default:
      return { discount: 0, eligibleSubtotal };
  }
}

export function isCouponActiveNow(c: DBCoupon, now: Date = new Date()): boolean {
  if (c.status === false) return false;
  if (c.usageLimit != null && c.usedCount != null && c.usedCount >= c.usageLimit) return false;
  const toMillis = (v: any): number | null => {
    if (!v) return null;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.getTime();
  };
  const start = toMillis(c.validFrom);
  const end = toMillis(c.validTo);
  const nowMs = now.getTime();
  if (start != null && nowMs < start) return false;
  if (end != null && nowMs > end) return false;
  return true;
}

export function filterActiveCoupons(coupons: DBCoupon[], now: Date = new Date()): DBCoupon[] {
  return (coupons || []).filter(c => isCouponActiveNow(c, now));
}

export function bestCouponForItem(coupons: DBCoupon[], item: CartItemLike): { coupon: DBCoupon | null; discount: number } {
  let best: { coupon: DBCoupon | null; discount: number } = { coupon: null, discount: 0 };
  for (const c of filterActiveCoupons(coupons)) {
    if (!isItemApplicable(c.appliesTo as any, item)) continue;
    const { discount } = computeCouponDiscountForCart(c, [{ ...item, quantity: 1 }]);
    if (discount > best.discount) best = { coupon: c, discount };
  }
  return best;
}
