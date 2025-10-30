import { useState, useEffect } from 'react';
import { db, storage } from '../../utils/firebaseClient';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { ArrowLeft, Heart, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Photo {
  id: string;
  name: string;
  url: string;
}

interface ContractData {
  id: string;
  clientName: string;
  eventType?: string;
  packageDuration?: string;
}

const ClientPhotoGallery = ({ shareToken }: { shareToken: string }) => {
  const navigate = useNavigate();
  const [contract, setContract] = useState<ContractData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [maxPhotosInPackage, setMaxPhotosInPackage] = useState(0);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<Photo | null>(null);
  const [showSelectedMsg, setShowSelectedMsg] = useState(false);

  useEffect(() => {
    loadData();
  }, [shareToken]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Get contract ID from share link
      const linksQuery = query(
        collection(db, 'photo-sharing-links'),
        where('shareToken', '==', shareToken)
      );
      const linksSnap = await getDocs(linksQuery);

      if (linksSnap.empty) {
        alert('Link de compartir inválido o expirado');
        navigate('/');
        return;
      }

      const linkData = linksSnap.docs[0].data();
      const contractId = linkData.contractId;

      // Get contract details
      const contractRef = doc(db, 'contracts', contractId);
      const contractSnap = await getDoc(contractRef);

      if (contractSnap.exists()) {
        const contractData = {
          id: contractSnap.id,
          ...contractSnap.data(),
        } as ContractData;
        setContract(contractData);

        // Calculate max photos based on package duration
        const duration = String(contractData.packageDuration || '');
        const hoursMatch = duration.match(/(\d+)\s*(?:hora|hour)/i);
        const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 6;
        const estimatedPhotos = Math.max(15, Math.floor(hours * 15));
        setMaxPhotosInPackage(estimatedPhotos);
      }

      // Load photos from Firestore
      try {
        const libraryRef = doc(db, 'photo-libraries', contractId);
        const librarySnap = await getDoc(libraryRef);

        const photosList: Photo[] = [];

        if (librarySnap.exists()) {
          const libraryData = librarySnap.data() as any;
          const photoNames = libraryData.photos || [];

          for (const photoName of photoNames) {
            try {
              const storageRef = ref(storage, `photo-libraries/${contractId}/${photoName}`);
              const url = await getDownloadURL(storageRef);
              photosList.push({
                id: photoName,
                name: photoName,
                url: url,
              });
            } catch (urlError) {
              console.warn(`Error getting URL for ${photoName}:`, urlError);
            }
          }
        }

        setPhotos(photosList);
      } catch (error: any) {
        console.warn('Error loading photos from firestore:', error);
        setPhotos([]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoSelect = (photoId: string) => {
    if (selectedPhotos.has(photoId)) {
      const newSelected = new Set(selectedPhotos);
      newSelected.delete(photoId);
      setSelectedPhotos(newSelected);
    } else {
      if (selectedPhotos.size < maxPhotosInPackage) {
        const newSelected = new Set(selectedPhotos);
        newSelected.add(photoId);
        setSelectedPhotos(newSelected);
        setShowSelectedMsg(true);
        setTimeout(() => setShowSelectedMsg(false), 2000);
      }
    }
  };

  const selectedArray = Array.from(selectedPhotos);
  const isAtLimit = selectedArray.length >= maxPhotosInPackage;

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
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">{contract?.clientName || 'Galería'}</h1>
            <p className="text-sm text-gray-600 mt-1">Selecciona tus fotos favoritas</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              {selectedArray.length} <span className="text-gray-600">de {maxPhotosInPackage}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Package Info */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div
          className={`rounded-lg border p-4 ${
            isAtLimit ? 'bg-amber-50 border-amber-300' : 'bg-green-50 border-green-300'
          }`}
        >
          <p className="text-sm font-medium">
            {isAtLimit
              ? `Alcanzaste el límite de ${maxPhotosInPackage} fotos`
              : `Puedes seleccionar hasta ${maxPhotosInPackage} fotos`}
          </p>
        </div>
      </div>

      {/* Photo Grid */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {photos.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-600">
            No hay fotos disponibles
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo) => {
              const isSelected = selectedPhotos.has(photo.id);
              return (
                <div key={photo.id} className="relative group">
                  {/* Photo Card */}
                  <div
                    className={`aspect-square overflow-hidden rounded-lg cursor-pointer bg-gray-200 transition-all ${
                      isSelected ? 'border-4 border-green-500' : 'border-2 border-transparent'
                    }`}
                    onClick={() => setFullscreenPhoto(photo)}
                  >
                    <img
                      src={photo.url}
                      alt={photo.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://via.placeholder.com/300?text=Error`;
                      }}
                    />

                    {/* Checkbox - Top Left */}
                    <div className="absolute top-3 left-3 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePhotoSelect(photo.id);
                        }}
                        disabled={isAtLimit && !isSelected}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-green-500 border-green-500'
                            : 'border-white bg-transparent hover:border-green-400'
                        } ${isAtLimit && !isSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isSelected && <Check size={16} className="text-white" />}
                      </button>
                    </div>

                    {/* Hover Overlay */}
                    {!isSelected && (
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-sm font-medium">Click para ver</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Message Toast */}
      {showSelectedMsg && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg animate-pulse">
          ✓ Foto seleccionada
        </div>
      )}

      {/* Fullscreen Photo Modal */}
      {fullscreenPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setFullscreenPhoto(null)}
        >
          <div className="relative max-w-4xl w-full h-full flex flex-col items-center justify-center">
            {/* Close button */}
            <button
              onClick={() => setFullscreenPhoto(null)}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition z-10"
            >
              <ArrowLeft size={24} />
            </button>

            {/* Image */}
            <img
              src={fullscreenPhoto.url}
              alt={fullscreenPhoto.name}
              className="max-h-[80vh] w-auto object-contain"
              onClick={(e) => e.stopPropagation()}
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://via.placeholder.com/800?text=Error`;
              }}
            />

            {/* Heart Button - Bottom Center */}
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePhotoSelect(fullscreenPhoto.id);
                }}
                disabled={isAtLimit && !selectedPhotos.has(fullscreenPhoto.id)}
                className={`transition-all transform hover:scale-110 ${
                  selectedPhotos.has(fullscreenPhoto.id) ? 'opacity-100' : ''
                } ${isAtLimit && !selectedPhotos.has(fullscreenPhoto.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Heart
                  size={48}
                  className={`transition-all ${
                    selectedPhotos.has(fullscreenPhoto.id)
                      ? 'fill-red-500 text-red-500'
                      : 'text-red-500 hover:fill-red-500/20'
                  }`}
                  strokeWidth={1.5}
                />
              </button>
            </div>

            {/* Selected indicator */}
            {selectedPhotos.has(fullscreenPhoto.id) && (
              <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg font-medium animate-pulse">
                ✓ Foto seleccionada
              </div>
            )}

            {/* Info */}
            <div className="absolute top-4 left-4 text-white">
              <p className="text-sm opacity-75">
                {photos.indexOf(fullscreenPhoto) + 1} de {photos.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="max-w-7xl mx-auto px-4 py-8 pb-20">
        {selectedArray.length > 0 && (
          <button
            onClick={() => {
              alert(`¡Confirmaste ${selectedArray.length} fotos!`);
              navigate(-1);
            }}
            className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition"
          >
            Confirmar {selectedArray.length} foto{selectedArray.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
};

export default ClientPhotoGallery;
