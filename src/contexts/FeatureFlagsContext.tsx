import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { db } from '../utils/firebaseClient';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export type PageKey = 'home' | 'portfolio' | 'portrait' | 'maternity' | 'events' | 'civilWedding' | 'contact' | 'store' | 'booking' | 'dashboard' | 'admin' | 'packagesAdmin' | 'clientDashboard';

type PaymentsFlags = { mpEnabled: boolean; calendarEnabled: boolean };

export interface FeatureFlags {
  pages: Record<PageKey, boolean>;
  payments: PaymentsFlags;
}

const DEFAULT_FLAGS: FeatureFlags = {
  pages: {
    home: true,
    portfolio: true,
    portrait: true,
    maternity: true,
    events: true,
    civilWedding: true,
    contact: true,
    store: true,
    booking: true,
    dashboard: true,
    admin: true,
    packagesAdmin: true,
    clientDashboard: true,
  },
  payments: {
    mpEnabled: true,
    calendarEnabled: true,
  },
};

interface FeatureFlagsContextType {
  flags: FeatureFlags;
  loading: boolean;
  setPageEnabled: (key: PageKey, value: boolean) => Promise<void>;
  setPaymentEnabled: (value: boolean) => Promise<void>;
  setCalendarEnabled: (value: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType | undefined>(undefined);

export const useFeatureFlags = () => {
  const ctx = useContext(FeatureFlagsContext);
  if (!ctx) throw new Error('useFeatureFlags must be used within FeatureFlagsProvider');
  return ctx;
};

const STORAGE_KEY = 'feature_flags_v1';

async function readFromFirestore(): Promise<FeatureFlags | null> {
  try {
    const ref = doc(db, 'config', 'featureFlags');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as any;
      if (data && typeof data === 'object' && data.pages) {
        return {
          pages: { ...DEFAULT_FLAGS.pages, ...data.pages },
          payments: { ...DEFAULT_FLAGS.payments, ...(data.payments || {}) } as PaymentsFlags,
        } as FeatureFlags;
      }
    }
  } catch (_) {}
  return null;
}

async function writeToFirestore(flags: FeatureFlags): Promise<void> {
  const ref = doc(db, 'config', 'featureFlags');
  await setDoc(ref, flags, { merge: true });
}

function readFromLocalStorage(): FeatureFlags | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.pages) {
      return {
        pages: { ...DEFAULT_FLAGS.pages, ...parsed.pages },
        payments: { ...DEFAULT_FLAGS.payments, ...(parsed.payments || {}) } as PaymentsFlags,
      } as FeatureFlags;
    }
  } catch (_) {}
  return null;
}

function writeToLocalStorage(flags: FeatureFlags) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(flags)); } catch (_) {}
}

export const FeatureFlagsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [fromDb, fromLs] = await Promise.all([
        readFromFirestore(),
        Promise.resolve(readFromLocalStorage()),
      ]);

      const mergedPayments: PaymentsFlags = {
        mpEnabled: Boolean((fromLs?.payments?.mpEnabled ?? fromDb?.payments?.mpEnabled ?? DEFAULT_FLAGS.payments.mpEnabled)),
        calendarEnabled: Boolean((fromLs?.payments?.calendarEnabled ?? fromDb?.payments?.calendarEnabled ?? DEFAULT_FLAGS.payments.calendarEnabled)),
      };

      const merged: FeatureFlags = {
        pages: {
          ...DEFAULT_FLAGS.pages,
          ...(fromDb?.pages || {}),
          ...(fromLs?.pages || {}), // LS overrides DB for admin local changes
        },
        payments: mergedPayments,
      };

      setFlags(merged);
      writeToLocalStorage(merged);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setPageEnabled = async (key: PageKey, value: boolean) => {
    const next: FeatureFlags = {
      pages: { ...flags.pages, [key]: value },
      payments: {
        mpEnabled: Boolean(flags.payments?.mpEnabled ?? DEFAULT_FLAGS.payments.mpEnabled),
        calendarEnabled: Boolean(flags.payments?.calendarEnabled ?? DEFAULT_FLAGS.payments.calendarEnabled),
      },
    };
    setFlags(next);
    writeToLocalStorage(next);
    try {
      await writeToFirestore(next);
    } catch (_) {
      // ignore, localStorage keeps state for admins temporarily
    }
  };

  const setPaymentEnabled = async (value: boolean) => {
    const next: FeatureFlags = {
      pages: { ...flags.pages },
      payments: {
        mpEnabled: Boolean(value),
        calendarEnabled: Boolean(flags.payments?.calendarEnabled ?? DEFAULT_FLAGS.payments.calendarEnabled),
      },
    };
    setFlags(next);
    writeToLocalStorage(next);
    try {
      await writeToFirestore(next);
    } catch (_) {}
  };

  const setCalendarEnabled = async (value: boolean) => {
    const next: FeatureFlags = {
      pages: { ...flags.pages },
      payments: {
        mpEnabled: Boolean(flags.payments?.mpEnabled ?? DEFAULT_FLAGS.payments.mpEnabled),
        calendarEnabled: Boolean(value),
      },
    };
    setFlags(next);
    writeToLocalStorage(next);
    try {
      await writeToFirestore(next);
    } catch (_) {}
  };

  const value = useMemo(() => ({ flags, loading, setPageEnabled, setPaymentEnabled, setCalendarEnabled, refresh: load }), [flags, loading]);

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
};
