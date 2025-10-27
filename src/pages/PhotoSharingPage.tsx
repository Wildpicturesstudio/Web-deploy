import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../utils/firebaseClient';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, Check, AlertCircle, Download } from 'lucide-react';

interface Photo {
  id: string;
  name: string;
  url: string;
  category?: string;
}

interface ContractData {
  id: string;
  clientName: string;
  eventType?: string;
  eventDate?: string;
  packageDuration?: string;
  formSnapshot?: {
    cartItems?: any[];
    selectedPhotosCount?: number;
  };
  totalAmount?: number;
}

const PhotoSharingPage = () => {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  
  const [contract, setContract] = useState<ContractData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [maxPhotosInPackage, setMaxPhotosInPackage] = useState(0);
  const [showQRModal, setShowQRModal] = useState(false);
  const [extraPhotos, setExtraPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    const loadData = async () => {
      if (!contractId) {
        setLoading(false);
        return;
      }

      try {
        // Load contract
        const contractSnap = await getDocs(
          query(collection(db, 'contracts'), where('__name__', '==', contractId))
        );
        
        if (!contractSnap.empty) {
          const contractData = { id: contractSnap.docs[0].id, ...contractSnap.docs[0].data() } as ContractData;
          setContract(contractData);
          
          // Calculate max photos allowed based on package duration
          const duration = String(contractData.packageDuration || '');
          const hoursMatch = duration.match(/(\d+)\s*(?:hora|hour)/i);
          const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 6;
          const estimatedPhotos = Math.floor(hours * 15);
          setMaxPhotosInPackage(estimatedPhotos || 50);
        }

        // Load all photos (in a real app, these would come from a specific event/category)
        const photosSnap = await getDocs(collection(db, 'event_photos'));
        const photosList: Photo[] = photosSnap.docs.map(doc => ({
          id: doc.id,
          name: (doc.data() as any).name || `Photo ${doc.id.slice(0, 8)}`,
          url: (doc.data() as any).url || '',
          category: (doc.data() as any).category || 'general'
        }));
        
        // If no photos from DB, use demo photos
        if (photosList.length === 0) {
          const demoPhotos = Array.from({ length: 20 }, (_, i) => ({
            id: `demo-${i}`,
            name: `Foto ${i + 1}`,
            url: `https://images.unsplash.com/photo-${1500000000 + i * 100000}?w=300&h=300&fit=crop`,
            category: 'general'
          }));
          setPhotos(demoPhotos);
        } else {
          setPhotos(photosList);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [contractId]);

  const handlePhotoSelect = (photoId: string) => {
    const newSelected = new Set(selectedPhotos);
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId);
    } else {
      newSelected.add(photoId);
    }
    setSelectedPhotos(newSelected);
  };

  const selectedArray = Array.from(selectedPhotos);
  const isOverLimit = selectedArray.length > maxPhotosInPackage;
  const extraCount = Math.max(0, selectedArray.length - maxPhotosInPackage);
  const extraPhotosList = selectedArray.slice(maxPhotosInPackage).map(id => photos.find(p => p.id === id)).filter(Boolean) as Photo[];

  const handleConfirm = () => {
    if (selectedArray.length === 0) {
      alert('Por favor selecciona al menos una foto');
      return;
    }

    if (isOverLimit) {
      setExtraPhotos(extraPhotosList);
      setShowQRModal(true);
    } else {
      // All selected photos are within the package
      alert(`Se confirmaron ${selectedArray.length} fotos`);
      navigate(-1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <p className="text-gray-600">Cargando galería...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-none border border-gray-200"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-semibold">Galería de Fotos</h1>
              {contract && (
                <p className="text-sm text-gray-600">{contract.clientName} - {contract.eventType}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Seleccionadas: {selectedArray.length}</div>
            <div className="text-sm font-medium">
              {isOverLimit ? (
                <span className="text-red-600">+{extraCount} fotos extras</span>
              ) : (
                <span className="text-green-600">✓ Dentro del paquete</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Package Info */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className={`rounded-lg border p-4 ${isOverLimit ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
          <div className="flex items-start gap-3">
            {isOverLimit ? (
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            ) : (
              <Check className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
            )}
            <div className="flex-1">
              <p className="font-medium">
                {isOverLimit
                  ? `Seleccionaste ${extraCount} fotos más del paquete`
                  : `Paquete: hasta ${maxPhotosInPackage} fotos`}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {isOverLimit
                  ? `Tu paquete incluye ${maxPhotosInPackage} fotos. Podrás pagar por las ${extraCount} fotos adicionales al confirmar.`
                  : `Tienes ${maxPhotosInPackage - selectedArray.length} fotos disponibles más en tu paquete.`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Photo Gallery */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo) => {
            const isSelected = selectedPhotos.has(photo.id);
            const isInPackage = selectedArray.indexOf(photo.id) < maxPhotosInPackage;
            const isExtra = selectedArray.indexOf(photo.id) >= maxPhotosInPackage && isSelected;

            return (
              <div
                key={photo.id}
                onClick={() => handlePhotoSelect(photo.id)}
                className={`relative overflow-hidden rounded-lg cursor-pointer group transition-all ${
                  isSelected
                    ? isExtra
                      ? 'ring-4 ring-red-500 border-4 border-red-500'
                      : 'ring-4 ring-green-500 border-4 border-green-500'
                    : 'hover:shadow-lg'
                }`}
              >
                {/* Image */}
                <div className="aspect-square overflow-hidden bg-gray-200">
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://via.placeholder.com/300?text=${encodeURIComponent(photo.name)}`;
                    }}
                  />
                </div>

                {/* Overlay */}
                <div
                  className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                    isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  } ${isExtra ? 'bg-red-500/30' : 'bg-green-500/30'}`}
                >
                  {isSelected && (
                    <div className="text-white text-center">
                      <Check size={32} className="mx-auto mb-2" />
                      <p className="text-sm font-medium">
                        {isExtra ? 'Extra' : 'Incluido'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Photo name */}
                <div className="p-2 bg-white border-t">
                  <p className="text-xs text-gray-700 truncate">{photo.name}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="max-w-7xl mx-auto px-4 py-8 fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-none hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedArray.length === 0}
            className="px-6 py-3 border-2 border-black bg-black text-white rounded-none hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Check size={18} />
            Confirmar Selección
          </button>
        </div>
      </div>

      {/* QR Modal for Extra Photos */}
      {showQRModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-2xl font-semibold mb-4">Pagar por Fotos Extras</h2>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-600 mb-2">Resumen:</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Fotos en paquete:</span>
                  <span className="font-medium">{maxPhotosInPackage}</span>
                </div>
                <div className="flex justify-between">
                  <span>Fotos extra:</span>
                  <span className="font-medium text-red-600">{extraCount}</span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span>Total fotos:</span>
                  <span className="font-semibold">{selectedArray.length}</span>
                </div>
              </div>
            </div>

            {/* QR Code placeholder */}
            <div className="bg-gray-100 rounded-lg p-6 mb-4 text-center">
              <div className="bg-white p-4 rounded-lg mx-auto w-40 h-40 flex items-center justify-center border-2 border-gray-300">
                <svg viewBox="0 0 29 29" className="w-full h-full">
                  {/* Simple QR code representation */}
                  <rect x="0" y="0" width="29" height="29" fill="white" />
                  <rect x="0" y="0" width="7" height="7" fill="black" />
                  <rect x="22" y="0" width="7" height="7" fill="black" />
                  <rect x="0" y="22" width="7" height="7" fill="black" />
                  <rect x="11" y="11" width="7" height="7" fill="black" />
                </svg>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Código QR para pagar R$ {(extraCount * 50).toFixed(2)}
              </p>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Escanea este código QR para pagar por las {extraCount} fotos adicionales a R$ 50 cada una.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowQRModal(false)}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-none hover:bg-gray-50"
              >
                Atrás
              </button>
              <button
                onClick={() => {
                  alert(`Pago de R$ ${(extraCount * 50).toFixed(2)} para ${extraCount} fotos extras`);
                  navigate(-1);
                }}
                className="flex-1 px-4 py-2 border-2 border-black bg-black text-white rounded-none hover:opacity-90 flex items-center justify-center gap-2"
              >
                <Download size={16} />
                Descargar QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoSharingPage;
