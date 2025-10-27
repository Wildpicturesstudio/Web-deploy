import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { collection, getDocs } from 'firebase/firestore';
import { withFirestoreRetry } from '../../utils/firestoreRetry';
import { db } from '../../utils/firebaseClient';
import type { DressOption } from '../../types/booking';
import { useState, useRef, useEffect } from 'react';
import { BookingFormData } from '../../types/booking';
import { sessionPackages } from '../../data/sessionsData';
import { eventPackages } from '../../data/eventsData';
import { maternityPackages } from '../../data/maternityData';
import SignaturePad from './SignaturePad';
import Button from '../ui/Button';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { Camera, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { generatePDF } from '../../utils/pdf';
import { saveContract, updateContractStatus } from '../../utils/contractService';
import { getAuth, signInAnonymously } from 'firebase/auth';
import PaymentModal from './PaymentModal';
import { sendConfirmationEmail } from '../../utils/email';
import { gcalUpsertBooking, parseDurationToMinutes } from '../../utils/calendar';

// Resolve local dress images stored as repo paths to proper URLs using Vite asset handling
const DRESS_ASSETS: Record<string, string> = import.meta.glob('/src/utils/fotos/vestidos/*', { eager: true, as: 'url' }) as any;
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
function resolveDressByName(name?: string): string {
  const n = norm(String(name || ''));
  if (!n) return '';
  const entry = Object.entries(DRESS_ASSETS).find(([k]) => {
    const fname = k.split('/').pop() || '';
    const nf = norm(fname.replace(/\.[a-z0-9]+$/i,''));
    return nf === n || nf.includes(n) || n.includes(nf);
  });
  return entry ? String(entry[1]) : '';
}
function resolveDressImage(u?: string, name?: string): string {
  const val = String(u || '');
  if (!val) return resolveDressByName(name);
  if (/^https?:\/\//i.test(val)) return val;
  if (val.startsWith('gs://')) return val;
  const withSlash = val.startsWith('/') ? val : `/${val}`;
  if (DRESS_ASSETS[withSlash]) return DRESS_ASSETS[withSlash];
  const fname = withSlash.split('/').pop()?.toLowerCase();
  const found = Object.entries(DRESS_ASSETS).find(([k]) => k.split('/').pop()?.toLowerCase() === fname);
  return found ? String(found[1]) : resolveDressByName(name);
}

function parseBRL(value: string): number {
  if (!value) return 0;
  const cleaned = String(value).replace(/[^0-9.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '');
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/\./g, '');
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

interface ContractPreviewProps {
  data: BookingFormData;
  onConfirm: () => void;
  onBack: () => void;
}

const ContractPreview = ({ data, onConfirm, onBack }: ContractPreviewProps) => {
  const [clientSignature, setClientSignature] = useState<string>('');
  const [isSignatureComplete, setIsSignatureComplete] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [dresses, setDresses] = useState<DressOption[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<boolean>(false);
  const [showPendingModal, setShowPendingModal] = useState<boolean>(false);
  const contractRef = useRef<HTMLDivElement>(null);
  const { flags } = useFeatureFlags();

  const photographerSignature = 'https://i.imgur.com/QqWZGHc.png';

  useEffect(() => {
    (async () => {
      try {
        const snap = await withFirestoreRetry(() => getDocs(collection(db, 'products')));
        const list: DressOption[] = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter(p => {
            const c = String((p as any).category || '').toLowerCase();
            return c.includes('vestid') || c.includes('dress');
          })
          .map((p: any) => ({
            id: p.id,
            name: p.name || 'Vestido',
            color: Array.isArray(p.tags) && p.tags.length ? String(p.tags[0]) : '',
            image: p.image_url || p.image || resolveDressByName(p.name)
          }));
        setDresses(list);
      } catch (e) {
        setDresses([]);
      }
    })();
  }, []);

  const allPackages = [...sessionPackages, ...eventPackages, ...maternityPackages];
  const selectedPackage = allPackages.find(pkg => pkg.id === data.packageId);

  const handleSignatureSave = (signature: string) => {
    setClientSignature(signature);
    setIsSignatureComplete(true);
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    onConfirm();
  };

  const handleConfirm = async () => {
    if (!contractRef.current || !isSignatureComplete) return;

    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });

    // Directly finalize: generate PDF and confirmations
    await handlePaymentSuccess();
  };

  const handlePaymentSuccess = async () => {
    try {
      setIsGeneratingPDF(true);

      // Ensure user is authenticated (anonymous if necessary)
      const auth = getAuth();
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error('Anonymous sign-in failed', e);
      }
      const currentUid = auth.currentUser?.uid || 'anonymous';

      // Save contract data to Firestore early including userUid
      const saveRes = await saveContract(data, currentUid);
      const contractId = typeof saveRes === 'string' ? saveRes : saveRes.id;
      const isPending = typeof saveRes === 'object' ? Boolean((saveRes as any).pendingApproval || (saveRes as any).status === 'pending_approval') : false;
      setPendingApproval(isPending);

      // Optional Calendar scheduling (if enabled)
      if (flags.payments?.calendarEnabled !== false) {
        try {
          const cartItems = (data.cartItems || []) as any[];
          const storeItems = (data.storeItems || []) as any[];
          const pkgCount = cartItems.length || 0;
          const storeGroups: any[][] = Array.from({ length: Math.max(1, pkgCount) }, () => []);
          if (storeItems.length) {
            if (pkgCount <= 1) {
              storeGroups[0] = storeItems.slice();
            } else {
              storeItems.forEach((s, idx) => { storeGroups[idx % pkgCount].push(s); });
            }
          }

          if (cartItems.length > 0) {
            for (let index = 0; index < cartItems.length; index++) {
              const item = cartItems[index] as any;
              const date = data[`date_${index}`];
              const time = data[`time_${index}`];
              const location = data[`eventLocation_${index}`];
              if (!date || !time) continue;

              const start = new Date(`${date}T${time}:00`);
              const minutes = Number(parseDurationToMinutes(item.duration) || 0);
              const end = new Date(start.getTime() + minutes * 60000);
              const startISO = start.toISOString();
              const endISO = end.toISOString();

              const attachedStore = storeGroups[Math.min(index, storeGroups.length - 1)] || [];
              const storeLines = attachedStore.length ? ['','Produtos de loja (mesmo dia):', ...attachedStore.map(si => ` - ${si.name} (${si.quantity}x)`)] : [];

              const title = `${data.name} - ${item.type || 'Serviço'}`;
              const description = [
                `CPF: ${data.cpf}`,
                `RG: ${data.rg}`,
                `Email: ${data.email}`,
                `Telefone: ${data.phone}`,
                `Serviço: ${item.name}`,
                `Duração: ${item.duration || minutes + ' min'}`,
                `Pagamento: ${data.paymentMethod}`,
                data.message ? `Obs: ${data.message}` : '',
                ...storeLines
              ].filter(Boolean).join('\n');

              try {
                await gcalUpsertBooking({
                  startISO,
                  endISO,
                  location,
                  title,
                  description,
                  attendees: [{ email: data.email }, { email: 'wildpicturesstudio@gmail.com' }],
                  external_reference: `booking_${Date.now()}`,
                });
              } catch (e) {
                console.error('gcalUpsertBooking failed', e);
              }
            }
          }
        } catch (e) {
          console.error('Scheduling failed', e);
        }
      }

      // Generate one very long single-page PDF, low quality, no side margins
      const pdfBlob = (await generatePDF(contractRef.current!, { quality: 0.4, scale: 1.1, returnType: 'blob', longSinglePage: true, marginTopPt: 0, marginBottomPt: 0 })) as Blob;

      // Generate and download PDF locally (no Cloud Storage upload)
      let downloadUrl: string | null = null;
      try {
        const blobUrl = URL.createObjectURL(pdfBlob);
        downloadUrl = blobUrl;
        setPdfUrl(blobUrl);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `contrato-wild-pictures-studio-${data.name.toLowerCase().replace(/\s+/g, '-')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e: any) {
        console.error('PDF download failed', e);
        alert('Error al generar/descargar el contrato. Tente novamente.');
      }

      // Send confirmation emails (client and studio)
      try {
        const summary = { name: data.name, email: data.email, total, deposit, remaining };
        await Promise.all([
          sendConfirmationEmail({ to: data.email, subject: 'Confirmação de Reserva – Wild Pictures Studio', data: summary }),
          sendConfirmationEmail({ to: 'wildpicturesstudio@gmail.com', subject: 'Nova Reserva Confirmada', data: { ...summary, when: new Date().toISOString() } })
        ]);
      } catch (e) {
        console.warn('Confirmation email failed', e);
      }

      if (pendingApproval || isPending) setShowPendingModal(true); else setShowSuccessModal(true);
    } catch (error: any) {
      console.error('Error finalizing contract:', error);
      const msg = error?.message || String(error);
      if (msg.includes('Failed to fetch')) {
        alert('Network error when contacting Firestore (Failed to fetch). Verifica tu conexión o reglas de red. Revisa la consola para más detalles.');
      } else if (msg.includes('permission') || msg.includes('insufficient')) {
        alert('Firebase permissions error: verifica tus reglas de Firestore y que el usuario (anónimo) tenga permiso para escribir. Revisa la consola para más detalles.');
      } else {
        alert('Erro ao gerar/salvar o contrato. Por favor, tente novamente. ' + (msg ? 'Detalles: ' + msg : ''));
      }
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const [y, m, d] = String(dateStr || '').split('-').map(Number);
    const localDate = (y && m && d) ? new Date(y, (m - 1), d) : new Date();
    return format(localDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  };

  const formatTime = (timeStr: string) => {
    return format(new Date(`2000-01-01T${timeStr}`), 'HH:mm');
  };

  const calculateTotal = () => {
    // Calculate items total considering coupon discounts (handles empty services)
    const itemsTotal = (data.cartItems || []).reduce((sum, item, index) => {
      const itemPrice = parseBRL(item.price);
      const itemTotal = itemPrice * item.quantity;
      const coupon = data[`discountCoupon_${index}`];

      // Apply item-specific discount for FREE coupon on prewedding items (excluding teaser)
      if (coupon === 'FREE' && item.id && item.id.includes('prewedding') && !item.id.includes('teaser')) {
        return sum; // FREE coupon makes the item free (0 cost)
      }

      return sum + itemTotal;
    }, 0);

    // Add store items to total
    const storeItemsTotal = (data.storeItems || []).reduce((sum, item) => {
      return sum + (Number(item.price) * Number(item.quantity));
    }, 0);

    const subtotal = itemsTotal + storeItemsTotal + (data.travelCost || 0);

    // Calculate coupon discounts for display
    const couponDiscount = (data.cartItems || []).reduce((sum, item, index) => {
      const coupon = data[`discountCoupon_${index}`];
      if (coupon === 'FREE' && item.id && item.id.includes('prewedding') && !item.id.includes('teaser')) {
        const itemPrice = parseBRL(item.price);
        return sum + (itemPrice * item.quantity);
      }
      return sum;
    }, 0);

    // Calculate original subtotal for payment discount calculation
    const originalSubtotal = (data.cartItems || []).reduce((sum, item) => {
      const itemPrice = parseBRL(item.price);
      return sum + (itemPrice * item.quantity);
    }, 0) + storeItemsTotal + (data.travelCost || 0);

    const paymentDiscount = data.paymentMethod === 'cash' ? originalSubtotal * 0.05 : 0;
    const total = subtotal - paymentDiscount;

    return {
      subtotal,
      couponDiscount,
      paymentDiscount,
      total
    };
  };

  const calculatePayments = () => {
    const { total } = calculateTotal();

    const isStoreOnly = (!(data.cartItems && data.cartItems.length) && (data.storeItems && data.storeItems.length));

    if (isStoreOnly) {
      const deposit = Math.ceil(total * 0.5);
      const remaining = Math.max(0, total - deposit);
      return { deposit, remaining, storeOnly: true as const };
    }

    // Calculate effective totals: services (with coupons) + travel, and store items
    const servicesEffective = (data.cartItems || []).reduce((sum, item, index) => {
      const itemPrice = parseBRL(item.price);
      const itemTotal = itemPrice * item.quantity;
      const coupon = data[`discountCoupon_${index}`];
      if (coupon === 'FREE' && item.id && item.id.includes('prewedding') && !item.id.includes('teaser')) {
        return sum; // FREE for eligible items
      }
      return sum + itemTotal;
    }, 0) + (data.travelCost || 0);

    const storeItemsTotal = (data.storeItems || []).reduce((sum, s) => sum + (Number(s.price) * Number(s.quantity)), 0);

    const deposit = Math.ceil(servicesEffective * 0.2 + storeItemsTotal * 0.5);
    const remaining = Math.max(0, total - deposit);
    return { deposit, remaining, storeOnly: false as const };
  };

  const { subtotal, couponDiscount, paymentDiscount, total } = calculateTotal();
  const payments = calculatePayments();
  const { deposit, remaining } = payments;

  const selectedDresses = (data.selectedDresses || [])
    .map(dressId => dresses.find(dress => dress.id === dressId))
    .filter(Boolean) as DressOption[];

  return (
    <>
      <div className="min-h-screen bg-gray-50 py-12 pt-32">
      <div ref={contractRef} className="max-w-4xl mx-auto bg-white shadow-xl rounded-lg overflow-hidden">
        {(pendingApproval || Boolean((data as any).pendingApproval)) && (
          <div className="bg-yellow-100 text-yellow-900 text-sm px-4 py-2 text-center">Sua reserva está pendente de aprovação. O administrador entrará em contato para confirmar a data e horário do seu evento.</div>
        )}
        {/* Header */}
        <div className="bg-primary text-white p-8 text-center relative">
          <div className="absolute top-4 left-4">
            <Camera size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-playfair mb-2">Contrato de Prestação de Serviços Fotográficos</h1>
          <p className="text-lg text-white/80">Wild Pictures Studio</p>
        </div>

        <div className="p-8 space-y-8">
          {/* CLÁUSULAS CONTRATUAIS */}
          {((!data.cartItems || data.cartItems.length === 0) && (data.storeItems && data.storeItems.length > 0)) ? null : (
          <div className="bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden" data-pdf-block>
            <div className="bg-primary text-white px-8 py-4 border-b">
              <h2 className="text-xl font-playfair font-medium">Cláusulas Contratuais</h2>
            </div>

            <div className="p-8 space-y-8">
              {/* Cláusula 1 */}
              <section>
                <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-secondary">
                  CLÁUSULA 1ª – DAS OBRIGAÇÕES DA CONTRATADA
                </h3>
                <div className="space-y-3 text-sm text-gray-700">
                  <p>1.1. Comparecer ao evento com antecedência suficiente, garantindo o fiel cumprimento do tempo de cobertura contratado.</p>
                  <p>1.2. Entregar todas as fotografias editadas, com correção de cores, no prazo máximo de 15 (quinze) dias úteis após a realização do evento.</p>
                  <p>1.3. Disponibilizar todos os arquivos digitais em alta resolução, devidamente editados e sem marca d'água.</p>
                  <p>1.4. Manter sigilo sobre as informações pessoais e familiares dos contratantes.</p>
                </div>
              </section>

              {/* Cláusula 2 */}
              <section>
                <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-secondary">
                  CLÁUSULA 2ª – DAS OBRIGAÇÕES DA CONTRATANTE
                </h3>
                <div className="space-y-3 text-sm text-gray-700">
                  <p>2.1. Realizar o pagamento conforme estipulado: 20% do valor total como sinal de reserva e o restante no dia do evento.</p>
                  <p>2.2. Fornecer todas as informações necessárias sobre o evento (horários, locais, pessoas importantes).</p>
                  <p>2.3. Garantir acesso aos locais do evento e cooperação das pessoas envolvidas.</p>
                  <p>2.4. Comunicar qualquer alteração com antecedência mínima de 48 horas.</p>
                </div>
              </section>

              {/* Cláusula 3 */}
                  <section className="contract-section">
                    <h2 className="section-title">CLÁUSULA 3ª – DO ENSAIO PRÉ-WEDDING OU ENSAIO FOTOGRÁFICO</h2>
                    <div className="space-y-4 text-gray-700">
                      <p>No caso de contratação de ensaio pré-wedding ou ensaio fotográfico, o(a) CONTRATANTE deverá informar à CONTRATADA a data escolhida com, no mínimo, 3 (três) dias de antecedência, para que a equipe possa se organizar e enviar o formulário de agendamento.</p>
                      <p>Quando se tratar de casamento, o ensaio pré-wedding deverá ser realizado até 3 (três) dias antes da data do evento.</p>
                      <p><strong>Parágrafo único – Reagendamento de ensaios:</strong> Em caso de condições climáticas desfavoráveis no dia do ensaio, o reagendamento poderá ser realizado sem qualquer custo adicional. O(a) CONTRATANTE terá direito a 1 (uma) remarcação gratuita por outros motivos pessoais, desde que avise com pelo menos 3 (três) dias de antecedência. A partir da segunda remarcação por motivos pessoais, será necessário efetuar novo pagamento do valor da reserva (20%) para garantir a nova data.</p>
<p><strong>Exceção:</strong> Situações imprevisíveis e de força maior, tais como acidentes, doenças súbitas ou emergências comprovadas, não serão consideradas como remarcação pessoal e poderão ser reagendadas sem custo adicional, mediante comunicação imediata à <strong>CONTRATADA</strong>.</p>
                    </div>
                  </section>

              {/* Cláusula 4 */}
              <section>
                <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-secondary">
                  CLÁUSULA 4ª – DAS HORAS EXTRAS E ATRASOS
                </h3>
                <div className="space-y-3 text-sm text-gray-700">
                  <p>O(a) CONTRATANTE reconhece que os horários contratados são previamente definidos por ele(a) e que devem ser rigorosamente cumpridos.</p>
                  <p>A CONTRATADA não se responsabiliza por atrasos de terceiros (como cerimônias religiosas, buffets, maquiadores, etc.) que impactem na realização do evento e demandem horas extras.</p>
                  <p>A contratação de horas extras no dia do evento estará sujeita à disponibilidade da agenda da CONTRATADA, que se reserva o direito de aceitar ou recusar tal solicitação.</p>
                </div>
              </section>

              {/* Cláusula 5 */}
              <section>
                <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-secondary">
                  CLÁUSULA 5ª – DA RESCISÃO E MUDANÇA DE DATA
                </h3>
                <div className="space-y-3 text-sm text-gray-700">
                  <p>O contrato poderá ser rescindido por qualquer das partes mediante aviso prévio por escrito de, no mínimo, 30 (trinta) dias.</p>
                  <p>Em caso de desistência injustificada pelo(a) CONTRATANTE, o valor pago a título de reserva de data (20%) não será devolvido.</p>
                  <p>Se a rescisão ocorrer por parte da CONTRATADA sem justa causa, esta deverá restituir integralmente os valores pagos, acrescidos de multa de 1/3 (um terço) sobre o valor já pago.</p>
                  <p>Em caso de mudança de data do evento, o(a) CONTRATANTE deverá informar à CONTRATADA com antecedência mínima de 30 (trinta) dias, ficando a alteração condicionada à disponibilidade da agenda.</p>
                  <p><strong>Parágrafo único – Sessões fotográficas:</strong> O reagendamento de ensaios deve ser solicitado com, no mínimo, 3 (três) dias de antecedência. Caso a solicitação ocorra fora deste prazo, a remarcação estará sujeita à cobrança de nova reserva de data (20%). Se a nova data não estiver disponível, aplicam-se as disposições de rescisão previstas nos itens anteriores.</p>
                </div>
              </section>

              {/* Cláusula 6 */}
              <section>
                <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-secondary">
                  CLÁUSULA 6ª – DA CLÁUSULA PENAL
                </h3>
                <div className="space-y-3 text-sm text-gray-700">
                  <p>6.1. O descumprimento, por qualquer das partes, das obrigações assumidas neste contrato, sujeitará a parte infratora ao pagamento de multa equivalente a 1/3 (um terço) do valor total do contrato, sem prejuízo de eventuais perdas e danos.</p>
                  <p>6.2. A cláusula penal não afasta a possibilidade de cobrança judicial ou extrajudicial de danos adicionais comprovadamente sofridos pela parte prejudicada.</p>
                  <p>6.3. No caso de a CONTRATADA não comparecer no dia do evento ou não entregar o material contratado nos prazos estabelecidos, a multa será aplicada de forma imediata, facultando ao(à) CONTRATANTE a execução do contrato e o ajuizamento de ação para reparação integral dos prejuízos, incluindo eventual indenização por danos morais.</p>
                  <p>6.4. Em caso fortuito ou força maior, devidamente comprovados, não se aplicam as penalidades acima descritas, sendo o contrato desfeito sem prejuízo a ambas as partes.</p>
                </div>
              </section>
            </div>
          </div>
          )}

          {/* DADOS DO CONTRATO */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden" data-pdf-block>
            <div className="bg-primary text-white px-8 py-4 border-b">
              <h2 className="text-xl font-playfair font-medium">Dados do Contrato</h2>
            </div>
            
            <div className="p-8">
              {/* Contract Parties */}
              <div className="mb-8">
                <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-secondary">
                  PARTES CONTRATANTES
                </h3>
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">CONTRATADA:</h4>
                    <div className="space-y-2 text-sm text-gray-700">
                      <p><strong>Razão Social:</strong> Wild Pictures Studio</p>
                       <p><strong>CNPJ:</strong> 52.074.297/0001-33 </p>
                      <p><strong>Atividade:</strong> Serviços Fotográficos Profissionais</p>
                      <p><strong>Endereço:</strong> R. Ouro Verde, 314 - Jardim Santa Monica, Piraquara - PR, 83302-080 </p>
                      <p><strong>Contato:</strong> +55 41 98487-5565</p>
                      <p><strong>Dados de cobrança via PIX:</strong> 713.343.922-00</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">CONTRATANTE:</h4>
                    <div className="space-y-2 text-sm text-gray-700">
                      <p><strong>Nome:</strong> {data.name}</p>
                      <p><strong>CPF:</strong> {data.cpf}</p>
                      <p><strong>RG:</strong> {data.rg}</p>
                      <p><strong>Email:</strong> {data.email}</p>
                      <p><strong>Telefone:</strong> {data.phone}</p>
                      <p><strong>Endereço:</strong> {data.address}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Object - hidden for store-only checkout */}
          {((data.cartItems && data.cartItems.length > 0) || (data.storeItems && data.storeItems.length > 0)) && (
            <div className="mb-8">
              <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-secondary">
                OBJETO DO CONTRATO
              </h3>
              {data.cartItems && data.cartItems.length > 0 ? (
                <div className="space-y-6">
                  {data.cartItems.map((item, index) => (
                    <div key={`service-${index}`} className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h4 className="text-lg font-medium text-primary mb-4">
                        Serviço #{index + 1}: {item.name}
                      </h4>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4" data-pdf-block>
                          <div className="flex items-center">
                            <span className="text-gray-600">Tipo de Serviço:</span>
                            <span className="font-medium text-gray-900 ml-2">
                              {item.type === 'events' ? 'Eventos' : item.type === 'portrait' ? 'Retratos' : 'Gestantes'}
                            </span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-gray-600">Pacote Contratado:</span>
                            <span className="font-medium text-gray-900 ml-2">{item.name}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-gray-600">Duração:</span>
                            <span className="font-medium text-gray-900 ml-2">{item.duration}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-gray-600">Quantidade:</span>
                            <span className="font-medium text-gray-900 ml-2">{item.quantity}x</span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-gray-600">Data do Evento:</span>
                            <span className="font-medium text-gray-900 ml-2">
                              {data[`date_${index}`] ? formatDate(data[`date_${index}`]) : 'Não informada'}
                            </span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-gray-600">Horário:</span>
                            <span className="font-medium text-gray-900 ml-2">
                              {data[`time_${index}`] ? formatTime(data[`time_${index}`]) : 'Não informado'}
                            </span>
                          </div>
                          <div className="flex items-center md:col-span-2">
                            <span className="text-gray-600">Local:</span>
                            <span className="font-medium text-gray-900 ml-2">
                              {data[`eventLocation_${index}`] || 'Não informado'}
                            </span>
                          </div>
                        </div>

                        {selectedDresses.length > 0 && (/matern|gestant|pregnan/i.test(String(item?.type || data.serviceType || '')) ) && (
                          <div className="mt-4" data-pdf-block>
                            <h5 className="font-medium text-primary mb-2">Vestidos Selecionados</h5>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {selectedDresses.map((dress) => (
                                <div key={dress.id} className="text-center">
                                  <div className="relative aspect-[9/16] overflow-hidden rounded-lg mb-2">
                                    <img loading="eager" src={resolveDressImage(dress.image, dress.name)} alt={dress.name} className="absolute inset-0 w-full h-full object-cover" />
                                  </div>
                                  <p className="text-sm font-medium text-gray-900">{dress.name}</p>
                                  <p className="text-xs text-gray-600">{dress.color}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {data.storeItems && data.storeItems.length > 0 && (
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200" data-pdf-block>
                      <h4 className="text-lg font-medium text-primary mb-4">Produtos da Loja</h4>
                      <div className="space-y-3">
                        {data.storeItems.map((s, i) => (
                          <div key={`obj-store-${i}`} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {s.image_url ? (
                                <img loading="lazy" src={s.image_url} alt={s.name} className="w-12 h-12 object-cover rounded" />
                              ) : null}
                              <div>
                                <div className="font-medium text-gray-900">{s.name}</div>
                                <div className="text-sm text-gray-600">Quantidade: {s.quantity}</div>
                              </div>
                            </div>
                            <div className="text-sm font-medium text-gray-900">
                              R$ {(Number(s.price) * Number(s.quantity)).toFixed(2).replace('.', ',')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                  <p className="text-gray-600">Nenhum serviço contratado</p>
                </div>
              )}
            </div>
          )}



              {/* Entrega */}
              {(() => {
                const hasServices = Boolean(data.cartItems && data.cartItems.length);
                const hasStore = Boolean(data.storeItems && data.storeItems.length);
                const getPackageDeliveryDays = (): number | null => {
                  if (!selectedPackage) return null;
                  const feat = (selectedPackage.features || []).find(f => /Entrega em\s+\d+\s+dias/i.test(f));
                  if (!feat) return null;
                  const m = feat.match(/Entrega em\s+(\d+)\s+dias/i);
                  return m ? parseInt(m[1], 10) : null;
                };
                const pkgDays = getPackageDeliveryDays();
                return (hasServices || hasStore) ? (
                  <div className="mb-8" data-pdf-block>
                    <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-secondary">ENTREGA</h3>
                    <div className="bg-gray-50 p-6 rounded-lg">
                      <div className="space-y-2 text-sm text-gray-700">
                        {hasServices && (
                          <p>
                            <strong>Fotos digitais:</strong> {pkgDays ?? 15} dias úteis
                          </p>
                        )}
                        {hasStore && (
                          <p>
                            <strong>Material físico:</strong> 30 dias úteis
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Summary and Totals */}
              <div className="mb-8" data-pdf-block>
                <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-secondary">
                  RESUMO DOS SERVIÇOS
                </h3>
                <div className="bg-gray-50 p-6 rounded-lg">
                  <div className="space-y-4">
                    {data.cartItems?.map((item, index) => {
                      const itemPrice = parseBRL(item.price);
                      const itemTotal = itemPrice * item.quantity;
                      const coupon = data[`discountCoupon_${index}`];
                      const hasDiscount = coupon === 'FREE' && item.id && item.id.includes('prewedding') && !item.id.includes('teaser');
                      
                      return (
                        <div key={`summary-${index}`} className="flex justify-between items-center">
                          <span className="text-gray-700">
                            {item.name} ({item.quantity}x):
                          </span>
                          {hasDiscount ? (
                            <span className="space-x-2">
                              <span className="line-through text-gray-500">R$ {itemTotal.toFixed(2).replace('.', ',')}</span>
                              <span className="text-green-600 font-bold">R$ 0,00</span>
                            </span>
                          ) : (
                            <span className="font-medium text-gray-900">
                              R$ {itemTotal.toFixed(2).replace('.', ',')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {data.storeItems && data.storeItems.length > 0 && (
                      <>
                        {data.storeItems.map((item, index) => (
                          <div key={`store-financial-${index}`} className="flex justify-between items-center">
                            <span className="text-gray-700">
                              {item.name} ({item.quantity}x):
                            </span>
                            <span className="font-medium text-gray-900">
                              R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                    {data.travelCost > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">Taxa de Deslocamento:</span>
                        <span className="font-medium text-gray-900">R$ {data.travelCost.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}
                    {couponDiscount > 0 && (
                      <div className="flex justify-between items-center text-green-600">
                        <span className="font-medium">Desconto por Cupons:</span>
                        <span className="font-medium">- R$ {couponDiscount.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}
                    {paymentDiscount > 0 && (
                      <div className="flex justify-between items-center text-green-600">
                        <span className="font-medium">Desconto (Pagamento à Vista):</span>
                        <span className="font-medium">- R$ {paymentDiscount.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}
                   <div className="border-t border-gray-300 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xl font-medium text-primary">VALOR TOTAL:</span>
                      <span className="text-2xl font-bold text-green-600">
                      R$ {total.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>

                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-gray-300">
                    <h4 className="font-medium text-gray-900 mb-4">Forma de Pagamento:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-center">
                          <p className="text-sm text-gray-600 mb-1">{payments.storeOnly ? 'Sinal (50%)' : 'Sinal (20% de sinal + 50% serv. adicional)'}</p>
                          <p className="text-xl font-bold text-primary">R$ {deposit.toFixed(2).replace('.', ',')}</p>
                          <p className="text-xs text-gray-500 mt-1">Na assinatura do contrato</p>
                        </div>
                      </div>
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-center">
                          <p className="text-sm text-gray-600 mb-1">{payments.storeOnly ? 'Saldo Restante (50%)' : 'Saldo Restante (80%)'}</p>
                          <p className="text-xl font-bold text-green-600">R$ {remaining.toFixed(2).replace('.', ',')}</p>
                          <p className="text-xs text-gray-500 mt-1">No dia do evento</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Cupons aplicados */}
                    {(() => {
                      const appliedCoupons = data.cartItems?.filter((item, index) => {
                        const coupon = data[`discountCoupon_${index}`];
                        return coupon === 'FREE' && item.id && item.id.includes('prewedding') && !item.id.includes('teaser');
                      }) || [];
                      
                      if (appliedCoupons.length > 0) {
                        const couponDiscount = appliedCoupons.reduce((sum, item) => {
                          const itemPrice = parseBRL(item.price);
                          return sum + (itemPrice * item.quantity);
                        }, 0);
                        
                        return (
                          <div className="mt-4 bg-green-50 rounded-lg p-4 border border-green-200">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium text-green-700">Cupons Aplicados</span>
                              <span className="text-lg font-bold text-green-600">
                                - R$ {couponDiscount.toFixed(2).replace('.', ',')}
                              </span>
                            </div>
                            <div className="text-xs text-green-600">
                              {appliedCoupons.map((item, index) => (
                                <div key={index}>• {item.name} - Cupom FREE</div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    
                    <div className="mt-4 text-sm text-gray-600">
                      <p><strong>Método de Pagamento:</strong> {
                        data.paymentMethod === 'cash' ? 'Dinheiro (5% desconto)' :
                        data.paymentMethod === 'credit' ? 'Cartão de Crédito' : 'PIX'
                      }</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              {data.message && (
                <div className="mb-8" data-pdf-block>
                  <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-secondary">
                    OBSERVAÇÕES ADICIONAIS
                  </h3>
                  <div className="bg-gray-50 p-6 rounded-lg">
                    <p className="text-gray-700">{data.message}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Signatures Section */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden" data-pdf-block>
            <div className="bg-primary text-white px-8 py-4 border-b">
              <h2 className="text-xl font-playfair font-medium">Assinaturas das Partes</h2>
            </div>
            <div className="p-8">
              <div className="grid md:grid-cols-2 gap-12">
                <div className="text-center">
                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <h4 className="font-medium text-primary mb-4">CONTRATADA</h4>
                    <div className="mb-4 h-20 flex items-center justify-center">
                      <img
                        src="/firma_fotografo.png"
                        alt="Assinatura do Fotógrafo"
                        width={150}  // ajusta según necesites
                        height={64}  // ajusta según necesites
                        className="max-h-16"
                      />
                    </div>
                    <div className="border-t border-gray-300 pt-4">
                      <p className="font-medium text-gray-900">Wild Pictures Studio</p>
                      <p className="text-sm text-gray-600">CNPJ: 52.074.297/0001-33</p>
                    </div>
                  </div>
                </div>
                <div className="text-center">
                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <h4 className="font-medium text-primary mb-4">CONTRATANTE</h4>
                    {!isSignatureComplete ? (
                      <SignaturePad
                        onSave={handleSignatureSave}
                        label="Assinatura do Cliente"
                      />
                    ) : (
                      <>
                        <div className="mb-4 h-20 flex items-center justify-center">
                          <img
                            src={clientSignature}
                            alt="Assinatura do Cliente"
                            className="max-h-16"
                          />
                        </div>
                        <div className="border-t border-gray-300 pt-4">
                          <p className="font-medium text-gray-900">{data.name}</p>
                          <p className="text-sm text-gray-600">CPF: {data.cpf}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-gray-600 mb-8">
            Curitiba, {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
      </div>

      {/* Action Buttons - Outside PDF container */}
      <div className="max-w-4xl mx-auto px-6 pb-12">
        <div className="flex justify-center space-x-4 mt-8">
          <Button variant="secondary" onClick={onBack} disabled={isGeneratingPDF}>
            Voltar
          </Button>
          <Button 
            variant="primary" 
            onClick={handleConfirm}
            disabled={!isSignatureComplete || isGeneratingPDF}
          >
            {isGeneratingPDF ? 'Gerando PDF...' : 'Confirmar Pagamento e Agendar'}
          </Button>
        </div>
      </div>
      </div>

      {/* Pending Approval Modal */}
      {showPendingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 relative">
            <button onClick={()=> { setShowPendingModal(false); onConfirm(); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 mb-4">
                <AlertTriangle className="h-8 w-8 text-yellow-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Reserva pendente de aprovação</h3>
              <div className="space-y-3 text-sm text-gray-700 mb-6">
                <p>Sua reserva está pendente de aprovação. Entre em contato com o estúdio para confirmar a data e horário do seu evento.</p>
                <p>Em caso de aprovação, este mesmo contrato será válido sem necessidade de um novo envio.</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {pdfUrl && (
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="w-full bg-secondary text-black py-2 px-4 rounded-md hover:bg-opacity-90 transition-colors text-center">Baixar PDF novamente</a>
                )}
                <button onClick={()=> { setShowPendingModal(false); onConfirm(); }} className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-opacity-90 transition-colors">Entendi</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 relative">
            <button
              onClick={handleCloseSuccessModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </button>
            
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Contrato Enviado com Sucesso!
              </h3>
              
              <div className="space-y-3 text-sm text-gray-600 mb-6">
                <div className="flex items-center justify-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Copia enviada para o estúdio</span>
                </div>
                <div className="flex items-center justify-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Cópia enviada para: <strong>{data.email}</strong></span>
                </div>
                <div className="flex items-center justify-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>PDF gerado e baixado automaticamente</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                {pdfUrl && (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-secondary text-black py-2 px-4 rounded-md hover:bg-opacity-90 transition-colors text-center"
                  >
                    Baixar PDF novamente
                  </a>
                )}
                <button
                  onClick={handleCloseSuccessModal}
                  className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-opacity-90 transition-colors"
                >
                  Continuar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal (only if enabled) */}
      {flags.payments?.mpEnabled !== false && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          bookingData={data}
          onSuccess={handlePaymentSuccess}
        />
      )}

    </>
  );
};

export default ContractPreview;
