import { toast } from './notification';
import { Navigate } from 'react-router-dom';
import axios from 'axios';

// Verifica se il token è ancora valido con sicurezza migliorata
const isTokenValid = (token) => {
  if (!token) return false;
  
  try {
    // Il token JWT è diviso in tre parti: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const payload = parts[1];
    if (!payload) return false;
    
    // Decodifica il payload (Base64)
    // Utilizziamo una funzione più sicura per decodificare base64
    const base64Url = payload.replace(/-/g, '+').replace(/_/g, '/');
    const base64 = base64Url.padEnd(base64Url.length + (4 - base64Url.length % 4) % 4, '=');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    
    const decodedPayload = JSON.parse(jsonPayload);
    
    // Verifica la scadenza del token
    const currentTime = Math.floor(Date.now() / 1000); // Tempo attuale in secondi
    
    // Aggiungiamo un margine di 10 secondi per evitare problemi di sincronizzazione dell'orario
    return decodedPayload.exp > (currentTime - 10);
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
  const token = getToken();
  if (!token) return false;
  
  // Se abbiamo un token valido, consideriamo l'utente autenticato
  // anche se mancano altri dati utente
  
  // Controlla se l'applicazione è offline
  if (!navigator.onLine) {
    return true; // In modalità offline, considera l'utente autenticato
  }
  
  return true;
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

// Aggiungi invece questa funzione di utility
export const isUserAuthenticated = () => {
  return localStorage.getItem('token') !== null;
};

// Controlla la validità del token e ricaricalo se necessario
export const checkAndRefreshToken = async () => {
  const token = getToken();
  
  if (!token) return false;
  
  // Decodifica il token senza verificare la firma (solo per leggere la data di scadenza)
  try {
    const decodedToken = JSON.parse(atob(token.split('.')[1]));
    const expiryTime = decodedToken.exp * 1000; // converti in millisecondi
    const currentTime = Date.now();
    
    // Se il token scade in meno di 5 minuti, ricaricalo
    if (expiryTime - currentTime < 5 * 60 * 1000) {
      const response = await refreshAuthToken();
      if (response && response.token) {
        localStorage.setItem('token', response.token);
        return true;
      }
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Errore durante il controllo del token:', error);
    return false;
  }
};

// Aggiunge un intercettore per aggiornare automaticamente il token
export const setupTokenRefresh = () => {
  axios.interceptors.request.use(
    async (config) => {
      // Salta il controllo per il refresh token stesso per evitare loop
      if (config.url.includes('/api/auth/refresh-token')) {
        return config;
      }
      
      // Controlla e aggiorna il token se necessario
      await checkAndRefreshToken();
      
      // Aggiunge il token all'header, se esiste
      const token = getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Aggiungi un interceptor per salvare il token CSRF
  axios.interceptors.response.use(
    (response) => {
      // Salva il token CSRF dalle risposte di verifyOtp
      if (response.config.url && 
          (response.config.url.includes('/auth/verify-otp') || 
           response.config.url.includes('/auth/login')) && 
          response.data && response.data.csrfToken) {
        console.log('Salvato token CSRF dalla risposta di autenticazione:', response.data.csrfToken);
        localStorage.setItem('csrfToken', response.data.csrfToken);
      }
      return response;
    },
    (error) => Promise.reject(error)
  );
};

// Ottieni l'ID utente dal localStorage
export const getUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.id || null;
  } catch (error) {
    console.error('Errore nel recupero ID utente:', error);
    return null;
  }
};
