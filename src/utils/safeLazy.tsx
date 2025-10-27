import React from 'react';

export default function safeLazy<T extends React.ComponentType<any>>(factory: () => Promise<any>) {
  return React.lazy(() => factory()
    .then((mod) => {
      // Prefer default export
      const comp = mod && (mod.default || mod);
      // Ensure the imported value is a component (function/class). Accept functions only.
      if (typeof comp === 'function') {
        return { default: comp };
      }

      // Try heuristics: nested default (common when transpiled twice), named exports, or wrapped objects
      try {
        if (mod && typeof mod === 'object') {
          const keys = Object.keys(mod);
          // log keys for debugging
          console.error('safeLazy: imported module keys:', keys);
          if (mod.default && typeof mod.default === 'function') {
            return { default: mod.default };
          }
          if (mod.default && typeof mod.default === 'object' && typeof (mod.default as any).default === 'function') {
            return { default: (mod.default as any).default };
          }
          if (typeof (mod as any).Component === 'function') {
            return { default: (mod as any).Component };
          }
          // if module default is an object with single function export, pick it
          if (mod.default && typeof mod.default === 'object') {
            const innerKeys = Object.keys(mod.default || {});
            if (innerKeys.length === 1 && typeof (mod.default as any)[innerKeys[0]] === 'function') {
              return { default: (mod.default as any)[innerKeys[0]] };
            }
          }
        }
      } catch (e) {
        console.error('safeLazy heuristics failed', e);
      }

      console.error('safeLazy: imported module does not export a valid React component as default', {
        modulePreview: mod && (typeof mod === 'object' ? Object.keys(mod) : String(mod)),
        compType: typeof comp,
      });
      const Fallback: React.FC = () => (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h2 className="text-xl font-semibold mb-2">Error cargando módulo</h2>
            <p className="text-gray-600">El módulo cargado no exportó un componente válido.</p>
          </div>
        </div>
      );
      return { default: Fallback as unknown as T };
    })
    .catch((err) => {
      console.error('safeLazy dynamic import failed:', err);
      const Fallback: React.FC = () => (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h2 className="text-xl font-semibold mb-2">Error cargando módulo</h2>
            <p className="text-gray-600">Hubo un problema cargando esta sección. Intenta recargar la página.</p>
            <div className="mt-4"><button onClick={() => window.location.reload()} className="px-4 py-2 border-2 border-black bg-black text-white rounded-none">Recargar</button></div>
          </div>
        </div>
      );
      return Promise.resolve({ default: Fallback as unknown as T });
    })
  );
}
