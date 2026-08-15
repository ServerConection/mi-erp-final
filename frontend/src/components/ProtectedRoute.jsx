/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * COMPONENTE: ProtectedRoute
 * Protege rutas basado en permisos del usuario
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * USO:
 * <ProtectedRoute 
 *   requierePermiso="VistaAsesor"
 *   component={VistaAsesor}
 *   fallback={<AccesoDenegado />}
 * />
 * 
 * O con React Router:
 * <Route element={<ProtectedRoute requierePermiso="VistaAsesor" component={VistaAsesor} />} />
 */

import React, { useEffect, useState } from 'react';
import useAuth from '../hooks/useAuth';

const ProtectedRoute = ({ 
  component: Component, 
  requierePermiso,
  fallback = null,
  ...props 
}) => {
  const { user, permisos, cargando, tienePermiso } = useAuth();
  const [autorizado, setAutorizado] = useState(false);

  useEffect(() => {
    if (!cargando) {
      if (!user) {
        // No autenticado: redirigir a login
        window.location.href = '/login';
        return;
      }

      if (requierePermiso && !tienePermiso(requierePermiso)) {
        // No tiene permisos
        setAutorizado(false);
      } else {
        // Tiene permisos o no se requieren permisos
        setAutorizado(true);
      }
    }
  }, [user, permisos, cargando, requierePermiso, tienePermiso]);

  if (cargando) {
    return <div>Cargando...</div>;
  }

  if (!autorizado) {
    return fallback || (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        margin: '20px'
      }}>
        <h2>❌ Acceso Denegado</h2>
        <p>No tienes permisos para acceder a esta página.</p>
        <p>
          <strong>Tu empresa:</strong> {user?.empresa} | 
          <strong> Tu perfil:</strong> {user?.perfil}
        </p>
        {requierePermiso && (
          <p><strong>Módulo requerido:</strong> {requierePermiso}</p>
        )}
        <button 
          onClick={() => window.location.href = '/'}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginTop: '10px'
          }}
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  return <Component {...props} />;
};

export default ProtectedRoute;