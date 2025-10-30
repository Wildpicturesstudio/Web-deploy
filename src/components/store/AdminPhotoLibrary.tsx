import { useState, useEffect } from 'react';
import { db, storage } from '../../utils/firebaseClient';
import { collection, addDoc, getDocs, query, where, doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Upload, Trash2, Link as LinkIcon, Copy, Check } from 'lucide-react';

interface Photo {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
}

const AdminPhotoLibrary = ({ contractId, clientName }: { contractId: string; clientName: string }) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    loadPhotos();
    checkExistingShareLink();
  }, [contractId]);

  const loadPhotos = async () => {
    try {
      setLoading(true);

      // Load photo list from Firestore instead of Storage
      const libraryRef = doc(db, 'photo-libraries', contractId);
      const librarySnapshot = await getDoc(libraryRef);

      const photosList: Photo[] = [];

      if (librarySnapshot.exists()) {
        const libraryData = librarySnapshot.data() as any;
        const photoNames = libraryData.photos || [];

        for (const photoName of photoNames) {
          try {
            const storageRef = ref(storage, `photo-libraries/${contractId}/${photoName}`);
            const url = await getDownloadURL(storageRef);
            photosList.push({
              id: photoName,
              name: photoName,
              url: url,
              uploadedAt: new Date().toISOString(),
            });
          } catch (urlError) {
            console.warn(`Error getting URL for ${photoName}:`, urlError);
          }
        }
      }

      setPhotos(photosList);
    } catch (error) {
      console.error('Error loading photos:', error);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  const checkExistingShareLink = async () => {
    try {
      const linksQuery = query(
        collection(db, 'photo-sharing-links'),
        where('contractId', '==', contractId)
      );
      const snapshot = await getDocs(linksQuery);
      if (!snapshot.empty) {
        const linkData = snapshot.docs[0].data();
        setShareLink(`${window.location.origin}/photo-gallery/${linkData.shareToken}`);
      }
    } catch (error) {
      console.error('Error checking share link:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files) return;

    setUploading(true);
    try {
      const uploadedFileNames: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const timestamp = Date.now();
        const fileName = `${timestamp}_${file.name}`;

        try {
          const storageRef = ref(storage, `photo-libraries/${contractId}/${fileName}`);
          console.log('Uploading to:', `photo-libraries/${contractId}/${fileName}`);

          const result = await uploadBytes(storageRef, file, {
            contentType: file.type,
          });
          console.log('Upload successful:', result.metadata.name);
          uploadedFileNames.push(fileName);
        } catch (uploadError: any) {
          console.error(`Error uploading ${file.name}:`, uploadError);
          throw uploadError;
        }
      }

      // Update Firestore with the new photo names
      if (uploadedFileNames.length > 0) {
        try {
          const libraryRef = doc(db, 'photo-libraries', contractId);
          const existingPhotos = photos.map(p => p.id);
          const allPhotos = [...existingPhotos, ...uploadedFileNames];

          await setDoc(libraryRef, {
            contractId,
            photos: allPhotos,
            updatedAt: new Date(),
          }, { merge: true });
        } catch (firestoreError) {
          console.error('Error updating Firestore:', firestoreError);
        }
      }

      // Reload photos
      await loadPhotos();
    } catch (error: any) {
      console.error('Error uploading photos:', error);
      alert(`Error al subir fotos: ${error?.message || error}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    try {
      // Delete from Storage
      const storageRef = ref(storage, `photo-libraries/${contractId}/${photoId}`);
      await deleteObject(storageRef);

      // Update Firestore
      const remainingPhotos = photos.filter(p => p.id !== photoId).map(p => p.id);
      const libraryRef = doc(db, 'photo-libraries', contractId);
      await setDoc(libraryRef, {
        contractId,
        photos: remainingPhotos,
        updatedAt: new Date(),
      }, { merge: true });

      await loadPhotos();
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Error al eliminar foto');
    }
  };

  const generateShareLink = async () => {
    try {
      // Check if link already exists
      const linksQuery = query(
        collection(db, 'photo-sharing-links'),
        where('contractId', '==', contractId)
      );
      const snapshot = await getDocs(linksQuery);

      let token: string;
      if (snapshot.empty) {
        // Generate short token (8 characters)
        token = Math.random().toString(36).substring(2, 10);
        await addDoc(collection(db, 'photo-sharing-links'), {
          contractId,
          shareToken: token,
          createdAt: new Date(),
          clientName,
        });
      } else {
        token = snapshot.docs[0].data().shareToken;
      }

      const link = `${window.location.origin}/photo-gallery/${token}`;
      setShareLink(link);
      setShowShareModal(true);
    } catch (error) {
      console.error('Error generating share link:', error);
      alert('Error al generar link');
    }
  };

  const downloadPhotoList = () => {
    const photoList = photos.map(p => {
      const lastFour = p.name.slice(-4);
      return lastFour;
    });

    const csvContent = photoList.join('\n');
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(csvContent));
    element.setAttribute('download', `fotos_${contractId}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">{clientName}</h1>
          <p className="text-gray-600">Biblioteca de fotos</p>
        </div>
      </div>

      {/* Upload Section */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-8 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Subir Fotos</h2>
            <div className="flex gap-2">
              {shareLink && (
                <button
                  onClick={() => setShowShareModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <LinkIcon size={18} />
                  Ver Link
                </button>
              )}
              {photos.length > 0 && (
                <button
                  onClick={downloadPhotoList}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Copy size={18} />
                  Descargar Lista
                </button>
              )}
              {!shareLink && photos.length > 0 && (
                <button
                  onClick={generateShareLink}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90"
                >
                  <LinkIcon size={18} />
                  Crear Link
                </button>
              )}
            </div>
          </div>

          <label className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 bg-gray-50">
            <div className="flex flex-col items-center">
              <Upload className="text-gray-400 mb-2" size={32} />
              <span className="text-sm text-gray-600">
                {uploading ? 'Subiendo...' : 'Click para seleccionar fotos'}
              </span>
            </div>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {/* Photos Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-semibold mb-4">Fotos Subidas ({photos.length})</h2>
            {photos.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-600">
                No hay fotos subidas aún
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {photos.map((photo) => (
                  <div key={photo.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition">
                    <div className="aspect-square overflow-hidden bg-gray-200">
                      <img
                        src={photo.url}
                        alt={photo.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://via.placeholder.com/300?text=Error`;
                        }}
                      />
                    </div>
                    <div className="p-3 flex items-center justify-between">
                      <span className="text-xs text-gray-600 truncate">{photo.name.slice(-10)}</span>
                      <button
                        onClick={() => handleDeletePhoto(photo.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share Link Modal */}
      {showShareModal && shareLink && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-2xl font-semibold mb-4">Link para Compartir</h2>
            <p className="text-gray-600 mb-4">Comparte este link con {clientName} para que seleccione las fotos:</p>

            <div className="bg-gray-50 rounded-lg p-4 mb-4 flex items-center gap-2">
              <input
                type="text"
                value={shareLink}
                readOnly
                className="flex-1 bg-transparent text-sm outline-none text-gray-700"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="p-2 hover:bg-gray-200 rounded-lg transition"
              >
                {copied ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
              </button>
            </div>

            <button
              onClick={() => setShowShareModal(false)}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPhotoLibrary;
