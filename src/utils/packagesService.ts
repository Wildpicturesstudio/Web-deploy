import { db } from './firebaseClient';
import { withFirestoreRetry } from './firestoreRetry';
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
} from 'firebase/firestore';

export type PackageType = 'portrait' | 'maternity' | 'events';

export interface DBPackage {
  id: string;
  type: PackageType;
  title: string;
  price: number;
  duration: string;
  description: string;
  features?: string[];
  image_url: string;
  category?: string;
  created_at?: any;
  updated_at?: any;
  active?: boolean;
  sections?: string[];
  storeItemsIncluded?: { productId: string; quantity: number; variantName?: string }[];
}

function coercePackage(id: string, data: any): DBPackage {
  return {
    id,
    type: (data?.type as PackageType) || 'portrait',
    title: String(data?.title || ''),
    price: Number(data?.price ?? 0),
    duration: String(data?.duration || ''),
    description: String(data?.description || ''),
    features: Array.isArray(data?.features) ? data.features.map((x: any) => String(x)) : [],
    image_url: String(data?.image_url || ''),
    category: data?.category ? String(data.category) : undefined,
    created_at: data?.created_at ?? null,
    updated_at: data?.updated_at ?? null,
    active: data?.active ?? true,
    sections: Array.isArray(data?.sections) ? data.sections.map((x: any) => String(x)) : undefined,
    storeItemsIncluded: (() => {
      const raw = Array.isArray(data?.storeItemsIncluded)
        ? data.storeItemsIncluded
        : (Array.isArray(data?.storeItemIncluded) ? data.storeItemIncluded : undefined);
      return Array.isArray(raw)
        ? raw.map((x: any) => ({ productId: String(x?.productId || ''), quantity: Number(x?.quantity || 0), ...(x?.variantName ? { variantName: String(x.variantName) } : {}) }))
        : undefined;
    })(),
  };
}

export async function fetchPackages(type?: PackageType): Promise<DBPackage[]> {
  const colRef = collection(db, 'packages');

  if (type) {
    let q1 = query(colRef, where('type', '==', type));
    try {
      q1 = query(q1, orderBy('created_at', 'desc'));
    } catch (_) {}
    const snap1 = await withFirestoreRetry(() => getDocs(q1));
    if (snap1.size > 0) {
      return snap1.docs.map((d) => coercePackage(d.id, d.data()));
    }
    let q2 = query(colRef);
    try {
      q2 = query(q2, orderBy('created_at', 'desc'));
    } catch (_) {}
    const snap2 = await withFirestoreRetry(() => getDocs(q2));
    return snap2.docs
      .map((d) => coercePackage(d.id, d.data()))
      .filter((p) => p.type === type);
  }

  let q = query(colRef);
  try {
    q = query(q, orderBy('created_at', 'desc'));
  } catch (_) {}
  const snap = await withFirestoreRetry(() => getDocs(q));
  return snap.docs.map((d) => coercePackage(d.id, d.data()));
}

export type CreatePackageInput = Omit<DBPackage, 'id' | 'created_at' | 'updated_at'>;

export async function createPackage(data: CreatePackageInput): Promise<string> {
  const col = collection(db, 'packages');
  const base: any = {
    type: data.type,
    title: data.title,
    price: Number(data.price ?? 0),
    duration: data.duration || '',
    description: data.description || '',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    active: data.active ?? true,
  };
  const optional: any = {};
  if (Array.isArray(data.features)) optional.features = data.features;
  if (typeof data.image_url === 'string') optional.image_url = data.image_url;
  if (data.category != null && data.category !== '') optional.category = data.category;
  if (Array.isArray(data.sections)) optional.sections = data.sections;
  if (Array.isArray((data as any).storeItemsIncluded)) optional.storeItemsIncluded = (data as any).storeItemsIncluded;
  const payload = { ...base, ...optional };
  const maxAttempts = 3;
  let attempt = 0;
  let ref: any = null;
  while (attempt < maxAttempts) {
    try {
      ref = await addDoc(col, payload);
      break;
    } catch (err: any) {
      attempt++;
      const msg = String(err?.message || err);
      console.warn(`createPackage addDoc attempt ${attempt} failed:`, err);
      if (attempt >= maxAttempts || !msg.includes('Failed to fetch')) {
        throw err;
      }
      await new Promise(res => setTimeout(res, 300 * attempt));
    }
  }
  return ref.id;
}

export async function updatePackage(id: string, updates: Partial<DBPackage>): Promise<void> {
  const ref = doc(db, 'packages', id);
  const payload: any = { ...updates };
  if (payload.price != null) payload.price = Number(payload.price);
  if (payload.features && !Array.isArray(payload.features)) payload.features = [];
  if (payload.category === '') delete payload.category;
  if (payload.storeItemsIncluded && !Array.isArray(payload.storeItemsIncluded)) delete payload.storeItemsIncluded;
  // Remove any keys with undefined values to avoid Firestore errors
  for (const k of Object.keys(payload)) {
    if ((payload as any)[k] === undefined) delete (payload as any)[k];
  }
  payload.updated_at = serverTimestamp();
  await updateDoc(ref, payload);
}

export async function deletePackage(id: string): Promise<void> {
  const ref = doc(db, 'packages', id);
  await deleteDoc(ref);
}
