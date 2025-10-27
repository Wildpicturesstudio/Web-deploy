import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { withFirestoreRetry } from './firestoreRetry';
import { db } from './firebaseClient';
import { BookingFormData } from '../types/booking';

export interface ContractData {
  clientName: string;
  clientEmail: string;
  eventType: string;
  eventDate: string;
  contractDate: string;
  totalAmount: number;
  travelFee: number;
  paymentMethod: string;
  depositPaid: boolean;
  finalPaymentPaid: boolean;
  eventCompleted: boolean;
  packageTitle?: string;
  packageDuration?: string;
  eventLocation?: string;
  eventTime?: string;
  services?: any[];
  storeItems?: any[];
  message?: string;
  createdAt: string;
  pdfUrl?: string;
  formSnapshot?: BookingFormData;
}

export interface OrderData {
  clientName: string;
  clientEmail: string;
  items: any[];
  totalAmount: number;
  status: 'pending' | 'paid' | 'cancelled';
  paymentMethod: string;
  contractId?: string;
  createdAt: string;
}

export const saveContract = async (formData: BookingFormData, userUid?: string): Promise<{ id: string; status?: string; pendingApproval?: boolean }> => {
  try {
    const timeToMinutes = (t: string) => { const [h, m] = (t || '00:00').split(':').map(Number); return (h||0)*60 + (m||0); };
    const minutesToTime = (m: number) => { const h = Math.floor(m/60)%24; const mm = m%60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; };
    const parseCombinedDurationToMinutes = (text?: string): number => {
      if (!text) return 120;
      const t = text.toLowerCase();
      // Sum all hour/minute occurrences; default hours if unit not specified
      const hourMatches = Array.from(t.matchAll(/(\d+[\,\.]?\d*)\s*(hora|horas|hour|h)\b/g)).map(m=> Number(String(m[1]).replace(',','.'))*60);
      const minMatches = Array.from(t.matchAll(/(\d+[\,\.]?\d*)\s*(min|mins|minutos)\b/g)).map(m=> Number(String(m[1]).replace(',','.')));
      let total = hourMatches.reduce((a,b)=>a+b,0) + minMatches.reduce((a,b)=>a+b,0);
      if (total === 0) {
        const nums = (t.match(/\d+/g) || []).map(n=> Number(n));
        total = nums.reduce((a,b)=> a + (isFinite(b)? b*60 : 0), 0);
      }
      return Math.max(30, Math.round(total || 120));
    };

    // Calculate total amount
    const servicesTotal = formData.cartItems?.reduce((sum, item) => {
      const itemPrice = Number(item.price.replace(/[^0-9]/g, ''));
      const itemTotal = itemPrice * item.quantity;
      const coupon = formData[`discountCoupon_${formData.cartItems?.indexOf(item)}`];
      if (coupon === 'FREE' && item.id && item.id.includes('prewedding') && !item.id.includes('teaser')) {
        return sum;
      }
      return sum + itemTotal;
    }, 0) || 0;

    const storeTotal = formData.storeItems?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;

    const subtotal = servicesTotal + storeTotal + formData.travelCost;
    const paymentDiscount = formData.paymentMethod === 'cash' ? subtotal * 0.05 : 0;
    const totalAmount = subtotal - paymentDiscount;

    const eventDate = formData.cartItems?.[0] ? (formData[`date_0`] || '') : '';
    const startTime = formData.cartItems?.[0] ? (formData[`time_0`] || '') : '';
    const pkgDuration = formData.cartItems?.[0]?.duration || '';
    const baseMinutes = parseCombinedDurationToMinutes(pkgDuration);
    const endWithIntermissionMin = timeToMinutes(startTime) + baseMinutes + 60; // +1h intermedio
    const eventEndTime = minutesToTime(endWithIntermissionMin);

    // Availability check (conflicts consider occupied window until end+intermission already included)
    let pendingApproval = false;
    if (eventDate && startTime) {
      try {
        const { getDocs, collection, where, query } = await import('firebase/firestore');
        const q = query(collection(db, 'contracts'), where('eventDate','==', eventDate));
        const snap = await getDocs(q);
        const newStart = timeToMinutes(startTime);
        const newEnd = endWithIntermissionMin;
        for (const d of snap.docs) {
          const c: any = d.data();
          const st = String(c.status || 'booked');
          // Ignore released and cancelled
          if (st === 'released' || st === 'cancelled') continue;
          const cStart = timeToMinutes(String(c.eventTime || '00:00'));
          const cEnd = c.eventEndTime ? timeToMinutes(String(c.eventEndTime)) : (timeToMinutes(String(c.eventTime || '00:00')) + parseCombinedDurationToMinutes(String(c.packageDuration || '')) + 60);
          const overlap = newStart < cEnd && newEnd > cStart;
          if (overlap) { pendingApproval = true; break; }
        }
      } catch (e) {
        // On read failure, be safe and mark pending
        pendingApproval = true;
      }
    }

    // Prepare contract data
    const contractData: ContractData & { status?: string; eventEndTime?: string } = {
      clientName: formData.name,
      clientEmail: formData.email,
      eventType: formData.cartItems?.[0]?.type === 'events' ? 'Eventos' :
                 formData.cartItems?.[0]?.type === 'portrait' ? 'Retratos' : 'Gestantes',
      eventDate,
      contractDate: new Date().toISOString().split('T')[0],
      totalAmount,
      travelFee: formData.travelCost,
      paymentMethod: formData.paymentMethod,
      depositPaid: false,
      finalPaymentPaid: false,
      eventCompleted: false,
      packageTitle: formData.cartItems?.[0]?.name || '',
      packageDuration: pkgDuration,
      eventLocation: formData.cartItems?.[0] ? formData[`eventLocation_0`] || '' : '',
      eventTime: startTime,
      services: formData.cartItems || [],
      storeItems: formData.storeItems || [],
      message: formData.message,
      createdAt: new Date().toISOString(),
      eventEndTime,
      ...(pendingApproval ? { status: 'pending_approval' } : { status: 'confirmed' })
    };

    // Save to Firebase with retry for transient network errors
    const maxAttempts = 3;
    let attempt = 0;
    let docRef: any = null;
    while (attempt < maxAttempts) {
      try {
        docRef = await addDoc(collection(db, 'contracts'), {
          ...contractData,
          userUid: userUid || null,
          formSnapshot: { ...formData, pendingApproval }
        });
        break;
      } catch (err: any) {
        attempt++;
        const msg = String(err?.message || err);
        console.warn(`addDoc contracts attempt ${attempt} failed:`, err);
        if (attempt >= maxAttempts || !msg.includes('Failed to fetch')) {
          throw err;
        }
        await new Promise(res => setTimeout(res, 500 * attempt));
      }
    }

    // If there are store items, also create an order record
    if ((formData.storeItems?.length || 0) > 0) {
      const orderData: OrderData & { userUid?: string } = {
        clientName: formData.name,
        clientEmail: formData.email,
        items: formData.storeItems || [],
        totalAmount: storeTotal,
        status: 'pending',
        paymentMethod: formData.paymentMethod,
        contractId: docRef.id,
        createdAt: new Date().toISOString(),
        userUid: userUid || null as any
      };

      attempt = 0;
      while (attempt < maxAttempts) {
        try {
          await addDoc(collection(db, 'orders'), orderData);
          break;
        } catch (err: any) {
          attempt++;
          const msg = String(err?.message || err);
          console.warn(`addDoc orders attempt ${attempt} failed:`, err);
          if (attempt >= maxAttempts || !msg.includes('Failed to fetch')) {
            throw err;
          }
          await new Promise(res => setTimeout(res, 500 * attempt));
        }
      }
    }

    return { id: docRef.id, status: (contractData as any).status, pendingApproval };
  } catch (error: any) {
    console.error('Error saving contract:', error);
    // Enhance error with code/message for better debugging in UI
    const enhanced = new Error(`SaveContract failed: ${error?.code || ''} ${error?.message || String(error)}`);
    // @ts-ignore attach extra
    enhanced.original = error;
    throw enhanced;
  }
};

export const updateContractStatus = async (contractId: string, updates: Partial<ContractData>) => {
  try {
    const contractRef = doc(db, 'contracts', contractId);
    await withFirestoreRetry(() => updateDoc(contractRef, updates));
  } catch (error) {
    console.error('Error updating contract:', error);
    throw error;
  }
};
