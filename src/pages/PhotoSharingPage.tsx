import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../utils/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';
import AdminPhotoLibrary from '../components/store/AdminPhotoLibrary';
import ClientPhotoGallery from '../components/store/ClientPhotoGallery';

const PhotoSharingPage = () => {
  const { contractId, shareToken } = useParams<{ contractId?: string; shareToken?: string }>();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAndLoad = async () => {
      try {
        // If there's a shareToken, it's a client view
        if (shareToken) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        // If there's a contractId, it's an admin view
        if (contractId) {
          // Try to load the contract
          const contractsQuery = query(
            collection(db, 'contracts'),
            where('__name__', '==', contractId)
          );
          const snapshot = await getDocs(contractsQuery);

          if (!snapshot.empty) {
            const contractData = {
              id: snapshot.docs[0].id,
              ...snapshot.docs[0].data(),
            };
            setContract(contractData);
            setIsAdmin(true);
          } else {
            alert('Contrato no encontrado');
            navigate('/');
          }
        } else {
          alert('URL inválida');
          navigate('/');
        }
      } catch (error) {
        console.error('Error:', error);
        alert('Error al cargar');
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    checkAndLoad();
  }, [contractId, shareToken, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  // Admin view: upload and manage photos
  if (isAdmin && contract) {
    return <AdminPhotoLibrary contractId={contractId!} clientName={contract.clientName || 'Cliente'} />;
  }

  // Client view: select photos
  if (!isAdmin && shareToken) {
    return <ClientPhotoGallery shareToken={shareToken} />;
  }

  // Fallback
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-600">URL inválida</p>
      </div>
    </div>
  );
};

export default PhotoSharingPage;
