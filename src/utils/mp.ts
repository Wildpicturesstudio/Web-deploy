import { functions } from './firebaseClient';
import { httpsCallable } from 'firebase/functions';

declare global {
  interface Window { MercadoPago?: any }
}

export async function loadMercadoPago(): Promise<any> {
  const key = import.meta.env.VITE_MP_PUBLIC_KEY;
  if (!key) throw new Error('VITE_MP_PUBLIC_KEY não configurada');
  // If SDK not present yet, wait a tick
  if (typeof window.MercadoPago === 'undefined') {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (!window.MercadoPago) throw new Error('SDK do Mercado Pago não carregou');
  return new window.MercadoPago(key, { locale: 'pt-BR' });
}

async function ensureMpSdkLoaded(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.MercadoPago) return;
  const src = 'https://sdk.mercadopago.com/js/v2';
  const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
  if (existing) {
    if ((existing as any).datasetLoaded === 'true') return;
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => { (existing as any).datasetLoaded = 'true'; resolve(); });
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar SDK do Mercado Pago')));
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => { (script as any).datasetLoaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error('Falha ao carregar SDK do Mercado Pago'));
    document.head.appendChild(script);
  });
}

export async function initCheckout(preferenceId: string, options?: { autoOpen?: boolean }): Promise<void> {
  if (!preferenceId) throw new Error('preferenceId ausente');
  await ensureMpSdkLoaded();
  const mp = await loadMercadoPago();
  await mp.checkout({
    preferenceId,
    render: {
      container: '#mp-checkout-btn',
      label: 'Pagar',
    },
    redirectMode: 'self',
    autoOpen: options?.autoOpen === false ? false : true,
  });
}

// Create a simple test preference via the Firebase callable function (more reliable than direct fetch)
export async function requestTestPreference(): Promise<string> {
  const call = httpsCallable(functions as any, 'mpCreatePreference');
  const demoPreference = {
    items: [{ title: 'Produto de Teste', quantity: 1, unit_price: 100, currency_id: 'BRL' }]
  };
  const resp: any = await call({ preference: demoPreference });
  const data = resp?.data || resp;
  if (!data || (!data.id && !data.preferenceId)) {
    throw new Error('Falha ao criar preferência de teste');
  }
  return String(data.id || data.preferenceId);
}
