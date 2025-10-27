import React from 'react';

// A wrapper around React.lazy that returns a friendly fallback component
// when the dynamic import fails (e.g., network error). This avoids
// unhandled Promise rejections that can trigger dev overlays and crashes.

export default function lazyWithRetry<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return React.lazy(() => factory().catch((err) => {
    console.error('Dynamic import failed:', err);
    // Return a module with a default component that shows an error and a retry button
    const Fallback: React.FC = () => (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h2 className="text-xl font-semibold mb-2">Error cargando módulo</h2>
          <p className="text-gray-600 mb-4">Hubo un problema cargando esta sección. Verifica tu conexión o intenta recargar la página.</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => window.location.reload()} className="px-4 py-2 border-2 border-black bg-black text-white rounded-none">Recargar</button>
          </div>
        </div>
      </div>
    );
    return Promise.resolve({ default: Fallback as unknown as T });
  }));
}
