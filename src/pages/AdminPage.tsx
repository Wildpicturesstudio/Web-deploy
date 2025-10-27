import React, { useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../utils/firebaseClient"; // importa tu firebaseClient

const AdminSetup = () => {
  useEffect(() => {
    const assignAdmin = async () => {
      try {
        const functions = getFunctions(app);
        const makeAdmin = httpsCallable(functions, "makeAdmin");
        const result = await makeAdmin({});
        console.log(result.data.message);
        window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: String(result?.data?.message || 'Operación completada'), type: 'success' } }));
      } catch (err: any) {
        console.error(err.message);
        window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Error al asignar admin: ' + err.message, type: 'error' } }));
      }
    };

    assignAdmin();
  }, []);

  return <div>Asignando permisos de admin...</div>;
};

export default AdminSetup;
