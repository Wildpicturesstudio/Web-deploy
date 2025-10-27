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

export const saveContract = async (formData: BookingFormData, userUid?: string): Promise<string> => {
  try {
    // Calculate total amount
    const servicesTotal = formData.cartItems?.reduce((sum, item) => {
      const itemPrice = Number(item.price.replace(/[^0-9]/g, ''));
      const itemTotal = itemPrice * item.quantity;
      
      // Apply coupon discounts
      const coupon = formData[`discountCoupon_${formData.cartItems?.indexOf(item)}`];
      if (coupon === 'FREE' && item.id && item.id.includes('prewedding') && !item.id.includes('teaser')) {
        return sum; // FREE coupon makes the item free
      }
      
      return sum + itemTotal;
    }, 0) || 0;

    const storeTotal = formData.storeItems?.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0) || 0;

    const subtotal = servicesTotal + storeTotal + formData.travelCost;
    const paymentDiscount = formData.paymentMethod === 'cash' ? subtotal * 0.05 : 0;
    const totalAmount = subtotal - paymentDiscount;

    // Prepare contract data
    const contractData: ContractData = {
      clientName: formData.name,
      clientEmail: formData.email,
      eventType: formData.cartItems?.[0]?.type === 'events' ? 'Eventos' : 
                 formData.cartItems?.[0]?.type === 'portrait' ? 'Retratos' : 'Gestantes',
      eventDate: formData.cartItems?.[0] ? formData[`date_0`] || '' : '',
      contractDate: new Date().toISOString().split('T')[0],
      totalAmount,
      travelFee: formData.travelCost,
      paymentMethod: formData.paymentMethod,
      depositPaid: false,
      finalPaymentPaid: false,
      eventCompleted: false,
      packageTitle: formData.cartItems?.[0]?.name || '',
      packageDuration: formData.cartItems?.[0]?.duration || '',
      eventLocation: formData.cartItems?.[0] ? formData[`eventLocation_0`] || '' : '',
      eventTime: formData.cartItems?.[0] ? formData[`time_0`] || '' : '',
      services: formData.cartItems || [],
      storeItems: formData.storeItems || [],
      message: formData.message,
      createdAt: new Date().toISOString()
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
          formSnapshot: formData
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

    return docRef.id;
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
