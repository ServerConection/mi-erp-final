/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HOOK REACT: useAuth
 * Gestiona autenticación, permisos y datos del usuario
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * USO:
 * const { user, permisos, cargando, tienePermiso } = useAuth();
 * 
 * if (tienePermiso('VistaAsesor')) {
 *   return <VistaAsesor />;
 * }
 */

import { useState, useEffect, useCallback } from 'react';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [permisos, setPermisos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Cargar datos del usuario desde localStorage
  useEffect(() => {
    const cargarDatos = () => {
      try {
        const userData = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        const permisosData = localStorage.getItem('permisos');

        if (userData && token) {
          setUser(JSON.parse(userData));
          if (permisosData) {
            setPermisos(JSON.parse(permisosData));
          }
          setCargando(false);
        } else {
          setCargando(false);
        }
      } catch (err) {
        console.error('Error cargando datos de autenticación:', err);
        setError(err.message);
        setCargando(false);
      }
    };

    cargarDatos();
  }, []);

  /**
   * Función para verificar si el usuario tiene permiso para un módulo
   * @param {string} modulo - Nombre del módulo (ej: 'VistaAsesor')
   * @returns {boolean}
   */
  const tienePermiso = useCallback((modulo) => {
    if (!Array.isArray(permisos)) return false;
    return permisos.includes(modulo);
  }, [permisos]);

  /**
   * Función para obtener permisos del backend
   * Útil si necesitas actualizar permisos después del login
   */
  const obtenerPermisos = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setPermisos([]);
        return [];
      }

      const response = await fetch('/api/auth/permisos', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Error obteniendo permisos');
      }

      const data = await response.json();
      if (data.success) {
        setPermisos(data.permisos);
        localStorage.setItem('permisos', JSON.stringify(data.permisos));
        return data.permisos;
      }
    } catch (err) {
      console.error('Error en obtenerPermisos:', err);
      setError(err.message);
    }
  }, []);

  /**
   * Login: obtiene token y permisos del usuario
   */
  const login = useCallback(async (usuario, contraseña) => {
    try {
      setCargando(true);
      setError(null);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ usuario, contraseña })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Error en login');
      }

      // Guardar en localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('permisos', JSON.stringify(data.user.permisos));

      // Actualizar estado
      setUser(data.user);
      setPermisos(data.user.permisos);

      return { success: true, user: data.user };
    } catch (err) {
      console.error('Error en login:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setCargando(false);
    }
  }, []);

  /**
   * Logout: limpia datos de autenticación
   */
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('permisos');
    setUser(null);
    setPermisos([]);
  }, []);

  /**
   * Verificar si el usuario está autenticado
   */
  const estaAutenticado = useCallback(() => {
    return !!user && !!localStorage.getItem('token');
  }, [user]);

  /**
   * Obtener el token actual
   */
  const obtenerToken = useCallback(() => {
    return localStorage.getItem('token');
  }, []);

  return {
    user,
    permisos,
    cargando,
    error,
    login,
    logout,
    tienePermiso,
    obtenerPermisos,
    estaAutenticado,
    obtenerToken
  };
};

export default useAuth;