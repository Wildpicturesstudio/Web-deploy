import { useLocation, useNavigate } from 'react-router-dom';
import ContractPreview from '../components/booking/ContractPreview';
import type { BookingFormData, CartItem, StoreCartItem } from '../types/booking';
import { useEffect, useMemo, useRef } from 'react';
import ImageAdminOverlay from '../components/admin/ImageAdminOverlay';
import type { CSSProperties } from 'react';
import { generatePDF } from '../utils/pdf';

const formatBRL = (value: number) => {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
};

const AdminContractPreviewPage = () => {
  const location = useLocation() as any;
  const navigate = useNavigate();
  const contract = (location?.state?.contract as any | undefined) || (()=>{ try { const raw = sessionStorage.getItem('admin_contract_preview'); return raw ? JSON.parse(raw) : undefined; } catch { return undefined; } })();

  const data: BookingFormData | null = useMemo(() => {
    if (!contract) return null;

    const name = String(contract.clientName || contract.formSnapshot?.name || '');
    const email = String(contract.clientEmail || contract.formSnapshot?.email || '');
    const phone = String(contract.formSnapshot?.phone || contract.formSnapshot?.telefone || '');
    const cpf = String(contract.formSnapshot?.cpf || '');
    const rg = String(contract.formSnapshot?.rg || '');
    const address = String(contract.formSnapshot?.address || '');

    let services: CartItem[] = (Array.isArray(contract.services) ? contract.services : []).map((it: any, idx: number) => {
      const qty = Number(it.quantity ?? 1);
      const priceNum = Number(String(it.price || '').replace(/[^0-9]/g, ''));
      const duration = String(contract.packageDuration || it.duration || '');
      const type = String(contract.eventType || it.type || '');
      return {
        id: String(it.id || `service-${idx}`),
        name: String(it.name || it.id || 'Serviço'),
        price: formatBRL(priceNum),
        duration,
        type,
        quantity: qty,
        image: '',
        features: []
      };
    });

    if ((!services || services.length === 0) && Array.isArray(contract.formSnapshot?.cartItems)) {
      services = (contract.formSnapshot.cartItems as any[]).map((it: any, idx: number) => {
        const qty = Number(it.quantity ?? 1);
        const priceNum = Number(String(it.price || '').replace(/[^0-9]/g, ''));
        const duration = String(contract.packageDuration || it.duration || '');
        const rawType = String(contract.eventType || it.type || it.category || '');
        const type = (/matern|gestant|pregnan/i.test(rawType) ? 'maternity' : (/event/i.test(rawType) ? 'events' : (/retr|portrait/i.test(rawType) ? 'portrait' : rawType)));
        return {
          id: String(it.id || `service-${idx}`),
          name: String(it.name || it.id || 'Serviço'),
          price: formatBRL(priceNum),
          duration,
          type,
          quantity: qty,
          image: '',
          features: []
        } as CartItem;
      });
    }

    const storeItems: StoreCartItem[] = (Array.isArray(contract.storeItems) ? contract.storeItems : []).map((it: any, idx: number) => ({
      id: String(it.id || `store-${idx}`),
      name: String(it.name || 'Produto'),
      price: Number(it.price || 0),
      quantity: Number(it.quantity || 1),
      image_url: String(it.image_url || ''),
      custom_text: it.custom_text
    }));

    const booking: BookingFormData = {
      name,
      cpf,
      rg,
      address,
      email,
      phone,
      serviceType: String(contract.eventType || ''),
      packageId: '',
      quantity: 1,
      selectedDresses: Array.isArray(contract.formSnapshot?.selectedDresses) ? contract.formSnapshot.selectedDresses : [],
      eventDate: String(contract.eventDate || ''),
      eventTime: String(contract.eventTime || ''),
      eventLocation: String(contract.eventLocation || ''),
      travelCost: Number(contract.travelFee || 0),
      paymentMethod: (contract.paymentMethod as any) || 'pix',
      discountCoupon: '',
      message: String(contract.message || ''),
      cartItems: services,
      storeItems
    };

    // Fill per-service dates/times/locations to match ContractPreview expectations
    (booking.cartItems || []).forEach((_it, index) => {
      (booking as any)[`date_${index}`] = booking.eventDate;
      (booking as any)[`time_${index}`] = booking.eventTime;
      (booking as any)[`eventLocation_${index}`] = booking.eventLocation;
    });

    return booking;
  }, [contract]);

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 pt-32">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="card p-8">
            <h1 className="text-2xl font-medium mb-2">Sin datos</h1>
            <p className="text-gray-600 mb-4">No se encontró información del contrato para previsualizar.</p>
            <button onClick={()=> navigate(-1)} className="btn-primary">Volver</button>
          </div>
        </div>
      </div>
    );
  }

  // Build a tiled SVG watermark saying "COPIA"
  const svg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'>` +
    `<text x='100' y='110' text-anchor='middle' fill='rgba(0,0,0,0.08)' font-size='48' transform='rotate(-30, 100, 100)' font-family='sans-serif'>COPIA</text>` +
    `</svg>`
  );
  const watermarkStyle: CSSProperties = {
    position: 'absolute',
    inset: 0 as any,
    backgroundImage: `url("data:image/svg+xml;utf8,${svg}")`,
    backgroundRepeat: 'repeat',
    backgroundSize: '200px 200px',
    opacity: 1,
    pointerEvents: 'none',
    zIndex: 1
  };

  const wrapperRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  // Disable admin image overlay (👁️) while on this page
  useEffect(() => {
    try { ImageAdminOverlay.destroyImageAdminOverlay(); } catch {}
    return () => {
      try {
        if (typeof window !== 'undefined' && sessionStorage.getItem('site_admin_mode')) {
          ImageAdminOverlay.initImageAdminOverlay();
        }
      } catch {}
    };
  }, []);

  // Wait images inside capture container
  async function waitForImages(container: HTMLElement) {
    const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
    await Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve(null);
      return new Promise(res => { const done = () => res(null); img.onload = done; img.onerror = done; });
    }));
  }

  // Auto-generate and download on mount
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!captureRef.current) return;
      const target = captureRef.current;
      try { await waitForImages(target); } catch {}
      const blob = (await generatePDF(target as HTMLElement, { quality: 1, scale: 2, returnType: 'blob', longSinglePage: true, marginTopPt: 0, marginBottomPt: 0 })) as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contrato-copia-${String(data.name || 'cliente').toLowerCase().replace(/\s+/g,'-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, 500);
    return () => clearTimeout(t);
  }, []);

  const signatureOverlay: CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '120px',
    textAlign: 'center',
    fontSize: '28px',
    fontWeight: 700,
    color: 'rgba(220, 38, 38, 0.6)',
    transform: 'rotate(-15deg)',
    zIndex: 2,
    pointerEvents: 'none'
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div ref={captureRef} className="relative">
        <div style={watermarkStyle} className="print:block" />
        <div style={signatureOverlay}>COPIA</div>
        {String((contract as any)?.status || '') === 'pending_approval' && (
          <div className="bg-yellow-100 text-yellow-900 text-sm px-4 py-2 text-center">Sua reserva está pendente de aprovação. O administrador entrará em contato para confirmar a data e horário do seu evento.</div>
        )}
        <ContractPreview
          data={data}
          onConfirm={() => {}}
          onBack={() => navigate(-1)}
        />
      </div>
      <div className="max-w-4xl mx-auto px-6 pb-12">
        <div className="flex justify-center mt-4">
          <button
            onClick={async ()=>{
              if (!captureRef.current) return;
              const target = captureRef.current;
              try { await waitForImages(target); } catch {}
              const blob = (await generatePDF(target as HTMLElement, { quality: 1, scale: 2, returnType: 'blob', longSinglePage: true, marginTopPt: 0, marginBottomPt: 0 })) as Blob;
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `contrato-copia-${String(data.name || 'cliente').toLowerCase().replace(/\s+/g,'-')}.pdf`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
            className="border-2 border-black bg-black text-white px-4 py-2 rounded-none hover:opacity-90"
          >
            Descargar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminContractPreviewPage;
