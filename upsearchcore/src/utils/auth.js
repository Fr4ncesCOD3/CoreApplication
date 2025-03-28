import { toast } from './notification';
import { Navigate } from 'react-router-dom';

// Verifica se il token è ancora valido
const isTokenValid = (token) => {
  if (!token) return false;
  
  try {
    // Il token JWT è diviso in tre parti: header.payload.signature
    const payload = token.split('.')[1];
    if (!payload) return false;
    
    // Decodifica il payload (Base64)
    const decodedPayload = JSON.parse(atob(payload));
    
    // Verifica la scadenza del token
    const currentTime = Math.floor(Date.now() / 1000); // Tempo attuale in secondi
    return decodedPayload.exp > currentTime;
  } catch (error) {
    console.error('Errore nella verifica del token:', error);
    return false;
  }
};

// Ottiene il token di autenticazione
export const getToken = () => {
  const token = localStorage.getItem('token');
  
  if (!token) return null;
  
  // Verifica la validità del token
  if (!isTokenValid(token)) {
    // Se il token è scaduto, lo rimuoviamo
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return null;
  }
  
  return token;
};

// Ottiene i dati dell'utente dal localStorage
export const getUser = () => {
  const userString = localStorage.getItem('user');
  if (!userString) return null;
  
  try {
    return JSON.parse(userString);
  } catch (error) {
    console.error('Errore nel parsing dei dati utente:', error);
    localStorage.removeItem('user');
    return null;
  }
};

// Verifica se l'utente è autenticato
export const isAuthenticated = () => {
  return !!getToken();
};

// Effettua il logout
export const logout = (redirectPath = '/login') => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  // Reindirizza alla pagina di login
  if (redirectPath) {
    window.location.href = redirectPath;
  }
  
  toast.info('Hai effettuato il logout con successo');
};

// Gestisce gli errori di autenticazione
export const handleAuthError = (error) => {
  if (error.response && error.response.status === 401) {
    // Token scaduto o non valido
    logout();
    return 'Sessione scaduta. Effettua nuovamente il login.';
  }
  
  return error.message || 'Si è verificato un errore di autenticazione';
};

// Esempio di ProtectedRoute senza Router aggiuntivo
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('token') !== null;
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

export default ProtectedRoute;
