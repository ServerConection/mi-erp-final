import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { instalarInterceptorSesion } from './utils/sesion.js'

// Cierra sesión automáticamente si el backend responde 401 (token vencido
// o inválido) en cualquier llamada — ver utils/sesion.js
instalarInterceptorSesion()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
