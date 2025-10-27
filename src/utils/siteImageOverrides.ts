import { collection, getDocs } from 'firebase/firestore';
import { withFirestoreRetry } from './firestoreRetry';
import { db } from './firebaseClient';

export type ImageOverride = { original: string; override: string; updatedAt?: number };

export async function fetchImageOverrides(): Promise<Record<string, string>> {
  try {
    const snap = await withFirestoreRetry(() => getDocs(collection(db, 'image_overrides')));
    const map: Record<string, string> = {};
    snap.forEach(d => {
      const data = d.data() as any;
      if (typeof data?.original === 'string' && typeof data?.override === 'string') {
        map[data.original] = data.override;
      }
    });
    return map;
  } catch {
    return {};
  }
}

export function applyImageOverrides(map: Record<string, string>) {
  const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
  imgs.forEach(img => {
    const current = img.src;
    const override = map[current];
    if (override && current !== override) {
      img.src = override;
    }
  });
}
