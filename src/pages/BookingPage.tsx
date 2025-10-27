import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { BookingFormData } from '../types/booking';
import BookingForm from '../components/booking/BookingForm';
import ContractDisplay from '../components/booking/ContractDisplay';
import ContractPreview from '../components/booking/ContractPreview';
import { sessionPackages } from '../data/sessionsData';
import { eventPackages } from '../data/eventsData';
import { maternityPackages } from '../data/maternityData';
import { useFeatureFlags } from '../contexts/FeatureFlagsContext';
import { formatPrice } from '../utils/format';

type BookingStep = 'contract' | 'form' | 'preview' | 'complete';

const BookingPage = () => {
  const { items: cartItems, clearCart, addToCart, setIsCartOpen } = useCart();
  const location = useLocation() as any;
  const [currentStep, setCurrentStep] = useState<BookingStep>('contract');
  const [formData, setFormData] = useState<BookingFormData>({
    name: '',
    cpf: '',
    rg: '',
    address: '',
    email: '',
    phone: '',
    serviceType: '',
    packageId: '',
    quantity: 1,
    selectedDresses: [],
    eventDate: '',
    eventTime: '',
    eventLocation: '',
    travelCost: 0,
    paymentMethod: 'pix',
    discountCoupon: '',
    message: '',
    cartItems: [],
    storeItems: []
  });

  const allPackages = [...sessionPackages, ...eventPackages, ...maternityPackages];
  const { flags } = useFeatureFlags();

  useEffect(() => {
    if (cartItems && cartItems.length > 0) {
      const serviceItems = cartItems.filter(item => item.type !== 'store');
      const storeItems = cartItems
        .filter(item => item.type === 'store')
        .map(item => ({
          id: item.id,
          name: item.name,
          price: Number(item.price.replace(/[^0-9]/g, '')),
          quantity: item.quantity,
          image_url: item.image,
          description: ''
        }));
      setFormData(prev => ({
        ...prev,
        cartItems: serviceItems,
        storeItems,
        travelCost: serviceItems.length === 0 && storeItems.length > 0 ? 0 : prev.travelCost
      }));
      if (serviceItems.length === 0 && storeItems.length > 0 && currentStep === 'contract') {
        setCurrentStep('form');
      }

    } else {
      setFormData(prev => ({ ...prev, cartItems: [], storeItems: [] }));
    }
  }, [cartItems]);

  const navigate = useNavigate();
  useEffect(() => {
    const hasStoreItems = cartItems?.some(item => item.type === 'store');
    const skip = Boolean(location?.state?.skipStorePopup);
    if (currentStep === 'contract' && !hasStoreItems && !skip) {
      navigate('/store', { state: { fromCart: true } });
    }
  }, [currentStep, cartItems, location?.state?.skipStorePopup]);

  // Close cart drawer on contract step if cart contains both services and store items
  useEffect(() => {
    if (currentStep === 'contract') {
      const hasServices = (formData.cartItems?.length || 0) > 0;
      const hasStore = (formData.storeItems?.length || 0) > 0;
      if (hasServices && hasStore) {
        setIsCartOpen(false);
      }
    }
  }, [currentStep, formData.cartItems, formData.storeItems]);

  const handleContractAccept = () => {
    setCurrentStep('form');
  };

  const handleContractReject = () => {
    window.history.back();
  };

  const handleFormSubmit = (data: BookingFormData) => {
    setFormData(data);
    setCurrentStep('preview');
  };



  const handleContractConfirm = () => {
    setCurrentStep('complete');
    clearCart();
    // Here you could also send the data to your backend
  };

  const handleBackToForm = () => {
    setCurrentStep('form');
  };

  const handleBackToContract = () => {
    setCurrentStep('contract');
  };

  // Check if user has items in cart
  if (!cartItems || cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 pt-32">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="card">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-2xl font-playfair mb-4">Carrinho Vazio</h1>
            <p className="text-gray-600 mb-6">
              Você precisa adicionar serviços ao carrinho antes de fazer uma reserva.
            </p>
            <div className="space-y-3">
                {flags.pages.portrait && (
                <button
                  onClick={() => window.location.href = '/portrait'}
                  className="btn-primary w-full"
                >
                  Ver Sessões de Retratos
                </button>
              )}

              {flags.pages.maternity && (
                <button
                  onClick={() => window.location.href = '/maternity'}
                  className="btn-secondary w-full"
                >
                  Ver Sessões de Gestantes
                </button>
              )}

              {flags.pages.events && (
                <button
                  onClick={() => window.location.href = '/events'}
                  className="btn-secondary w-full"
                >
                  Ver Pacotes de Eventos
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 'complete') {
    return (
      <div className="min-h-screen bg-gray-50 py-12 pt-32">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="card">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-playfair mb-4">Reserva Confirmada!</h1>
            <p className="text-gray-600 mb-6">
              Sua reserva foi processada com sucesso. Você receberá um email de confirmação em breve.
            </p>
            <button
              onClick={() => window.location.href = '/'}
              className="btn-primary"
            >
              Voltar ao Início
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 'contract') {
    return (
      <ContractDisplay
        onAccept={handleContractAccept}
        onReject={handleContractReject}
      />
    );
  }

  if (currentStep === 'preview') {
    return (
      <>
        <ContractPreview
          data={formData}
          onConfirm={handleContractConfirm}
          onBack={handleBackToForm}
        />
      </>
    );
  }

  return (
    <>
      <BookingForm
        initialData={formData}
        packages={allPackages}
        onSubmit={handleFormSubmit}
        onBack={handleBackToContract}
        isStoreOnly={(formData.cartItems?.length || 0) === 0 && (formData.storeItems?.length || 0) > 0}
      />
    </>
  );
};

export default BookingPage;
