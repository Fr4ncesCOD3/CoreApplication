import axios from 'axios';
import { debounce } from 'lodash';
import { toast } from './notification';

// URL di base del backend
const baseURL = 'https://backend-upsearch.onrender.com';

// Configura axios con l'URL base e gli header di default
const api = axios.create({
  baseURL,
  timeout: 60000, // Aumentato a 60 secondi per render.com
  headers: {
    'Content-Type': 'application/json'
  }
});

// Stato globale per tenere traccia di eventuali tentativi di risveglio dell'istanza
let isWakingUpServer = false;
let wakingUpPromise = null;

// Funzione per risvegliare il server
export const wakeUpServer = async () => {
  // Se c'è già un tentativo in corso, restituisci la promessa esistente
  if (isWakingUpServer && wakingUpPromise) {
    return wakingUpPromise;
  }
  
  isWakingUpServer = true;
  
  // Crea una nuova promessa per il risveglio
  wakingUpPromise = new Promise(async (resolve) => {
    let attempts = 0;
    const maxAttempts = 3;
    
    const attemptWakeUp = async () => {
      try {
        toast.info(`Risveglio del server in corso... (${attempts + 1}/${maxAttempts})`, {
          toastId: 'server-wakeup',
          autoClose: 10000
        });
        
        // Usa un endpoint esistente per un ping leggero
        await axios({
          method: 'OPTIONS',
          url: 'https://backend-upsearch.onrender.com/auth/register',
          timeout: 15000
        });
        
        toast.update('server-wakeup', {
          render: 'Server attivo!',
          type: toast.TYPE.SUCCESS,
          autoClose: 3000
        });
        
        isWakingUpServer = false;
        resolve(true);
        return;
      } catch (error) {
        attempts++;
        
        if (attempts >= maxAttempts) {
          toast.update('server-wakeup', {
            render: 'Il server è ancora in fase di avvio. Le operazioni potrebbero richiedere più tempo.',
            type: toast.TYPE.WARNING,
            autoClose: 5000
          });
          
          isWakingUpServer = false;
          resolve(false);
          return;
        }
        
        // Attendi con backoff esponenziale
        const delay = calculateBackoff(attempts);
        await new Promise(r => setTimeout(r, delay));
        
        // Riprova
        return attemptWakeUp();
      }
    };
    
    await attemptWakeUp();
  });
  
  return wakingUpPromise;
};

// Interceptor per aggiungere il token JWT alle richieste
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Aggiungi il CF-Ray ID se disponibile (per debug)
    const cfRayId = localStorage.getItem('cf-ray');
    if (cfRayId) {
      config.headers['X-CF-Ray-Client'] = cfRayId;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Gestisci gli errori di autenticazione
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token scaduto o non valido
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Evita reindirizzamenti circolari se siamo già alla pagina di login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

// Funzione per calcolare il backoff esponenziale
const calculateBackoff = (retryCount) => {
  // Base di 1 secondo con jitter casuale
  const baseDelay = 1000; 
  const maxDelay = 30000; // max 30 secondi
  const exponentialBackoff = Math.min(maxDelay, baseDelay * Math.pow(2, retryCount));
  const jitter = Math.random() * 0.5 * exponentialBackoff; // 50% di jitter
  return exponentialBackoff + jitter;
};

// Gestione centralizzata degli errori
const handleApiError = (error) => {
  if (error.response) {
    // Errore lato server con risposta
    console.error('Errore API:', error.response.data);
    if (error.response.status === 401) {
      // Token scaduto o non valido, reindirizza al login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  } else if (error.request) {
    // Nessuna risposta ricevuta
    console.error('Nessuna risposta dal server:', error.request);
  } else {
    // Errore nella configurazione della richiesta
    console.error('Errore di configurazione:', error.message);
  }
  return Promise.reject(error);
};

const retryApiCall = async (apiCall, maxRetries = 3, delay = 1000) => {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await apiCall();
    } catch (error) {
      if (error.response || retries === maxRetries - 1) {
        throw error;
      }
      retries++;
      await new Promise(resolve => setTimeout(resolve, delay * retries));
    }
  }
};

/**
 * Funzione per effettuare il login
 * @param {string} email - Email
 * @param {string} password - Password
 * @returns {Promise} - Promise con la risposta del server
 */
export const login = async (credentials) => {
  try {
    console.log('Invio credenziali login:', credentials); // Per debug
    
    const response = await axios.post(`${baseURL}/auth/login`, credentials);
    
    console.log('Risposta login:', response.data); // Per debug
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

// Funzione per verificare l'OTP
export const verifyOtp = async (data) => {
  try {
    console.log('Invio dati verifica OTP:', data);
    
    const response = await axios.post(`${baseURL}/auth/verify-otp`, data);
    
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

/**
 * Funzione per richiedere un nuovo codice OTP
 * @param {string} email - Email
 * @returns {Promise} - Promise con la risposta del server
 */
export const resendOtp = async (data) => {
  try {
    console.log('Invio richiesta resendOtp:', data);
    
    const response = await axios.post(`${baseURL}/auth/resend-otp`, data);
    
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

// Servizio di autenticazione
export const authService = {
  register: async (userData) => {
    try {
      const response = await api.post('/auth/register', userData);
      toast.success('Registrazione completata! Controlla la tua email per il codice OTP');
      return response;
    } catch (error) {
      let message = 'Errore durante la registrazione';
      
      // Se riceviamo un 500 ma l'utente potrebbe essere stato creato comunque
      if (error.response && error.response.status === 500) {
        // Controlliamo se l'utente è stato creato tentando il login
        try {
          const checkUserResponse = await api.post('/auth/check-user-exists', {
            username: userData.username,
            email: userData.email
          });
          
          if (checkUserResponse.data.exists) {
            toast.warning('La registrazione potrebbe essere avvenuta con successo nonostante un errore di comunicazione. Prova a verificare il tuo OTP.');
            return { 
              data: { 
                message: 'Utente registrato. Controlla la tua email per il codice OTP',
                possibleSuccess: true,
                email: userData.email
              } 
            };
          }
        } catch (checkError) {
          console.error('Errore nel controllo utente:', checkError);
        }
        
        message = 'Errore di server durante la registrazione. L\'operazione potrebbe essere stata completata comunque. Verifica la tua email per il codice OTP o riprova.';
      } else if (error.response && error.response.data) {
        message = error.response.data.message || error.response.data || message;
      } else if (error.code === 'ECONNABORTED') {
        message = 'Il server sta impiegando troppo tempo per rispondere. Riprova tra qualche momento.';
      } else if (!error.response) {
        message = 'Impossibile connettersi al server. Controlla la tua connessione.';
      }
      
      toast.error(message);
      throw new Error(message);
    }
  },
  
  // Metodo per verificare se l'utente esiste (aggiunto)
  checkUserExists: async (username, email) => {
    try {
      const response = await api.post('/auth/check-user-exists', { username, email });
      return response.data.exists;
    } catch (error) {
      console.error('Errore nel controllo utente:', error);
      return false;
    }
  },
  
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
};

// Servizi per le note
export const noteApi = {
  getNotes: async () => {
    try {
      const response = await api.get('/api/notes');
      return response.data;
    } catch (error) {
      console.error('Errore nel recupero delle note:', error);
      throw error;
    }
  },
  
  createNote: async (noteData) => {
    try {
      const response = await api.post('/api/notes', noteData);
      return response.data;
    } catch (error) {
      console.error('Errore nella creazione della nota:', error);
      throw error;
    }
  },
  
  updateNote: async (id, updates) => {
    try {
      const response = await api.put(`/api/notes/${id}`, updates);
      return response.data;
    } catch (error) {
      console.error(`Errore nell'aggiornamento della nota ${id}:`, error);
      throw error;
    }
  },
  
  deleteNote: async (id) => {
    try {
      await api.delete(`/api/notes/${id}`);
      return true;
    } catch (error) {
      console.error(`Errore nell'eliminazione della nota ${id}:`, error);
      throw error;
    }
  },
  
  uploadAttachment: async (noteId, file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post(`/api/notes/${noteId}/attachments`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Errore nel caricamento dell\'allegato:', error);
      throw error;
    }
  },
  
  deleteAttachment: async (noteId, attachmentId) => {
    try {
      await api.delete(`/api/notes/${noteId}/attachments/${attachmentId}`);
      return true;
    } catch (error) {
      console.error('Errore nell\'eliminazione dell\'allegato:', error);
      throw error;
    }
  }
};

// Funzione per verificare lo stato della connessione
export const checkConnection = async () => {
  try {
    await api.get('/ping');
    return true;
  } catch (error) {
    return false;
  }
};

// Cache per le note
let notesCache = [];
let lastFetchTime = null;
const CACHE_TIME = 60000; // 1 minuto

// Aggiungi funzione per ottenere note dalla cache locale
export const getCachedNotes = () => {
  try {
    const cachedNotes = localStorage.getItem('cachedNotes');
    if (cachedNotes) {
      return JSON.parse(cachedNotes);
    }
  } catch (error) {
    console.error('Errore nel recupero delle note dalla cache:', error);
  }
  return [];
};

// Modifica getNotes per supportare cache e retry
export const getNotes = async (retryCount = 0) => {
  try {
    const token = localStorage.getItem('token');
    
    if (!token) {
      throw new Error('Token non trovato');
    }
    
    const response = await api.get('/api/notes', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    // Salva in cache le note ricevute
    if (response.data) {
      localStorage.setItem('cachedNotes', JSON.stringify(response.data));
    }
    
    return response.data;
  } catch (error) {
    console.error('Errore nel recupero delle note:', error);
    
    // Se è un timeout e abbiamo ancora tentativi disponibili
    if (error.code === 'ECONNABORTED' && retryCount < 2) {
      console.log(`Tentativo ${retryCount + 1} di recupero note...`);
      return await getNotes(retryCount + 1);
    }
    
    // Altrimenti ritorna le note dalla cache
    const cachedNotes = getCachedNotes();
    if (cachedNotes.length > 0) {
      return cachedNotes;
    }
    
    throw error;
  }
};

// Modifica createNote per supportare cache e retry
export const createNote = async (noteData, retryCount = 0) => {
  try {
    const token = localStorage.getItem('token');
    
    if (!token) {
      throw new Error('Token non trovato');
    }
    
    const response = await api.post('/api/notes', noteData, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    // Aggiorna la cache delle note
    try {
      const cachedNotes = getCachedNotes();
      cachedNotes.push(response.data);
      localStorage.setItem('cachedNotes', JSON.stringify(cachedNotes));
    } catch (e) {
      // Ignora errori di cache
    }
    
    return response.data;
  } catch (error) {
    console.error('Errore nella creazione della nota:', error);
    
    // Se è un timeout e abbiamo ancora tentativi disponibili
    if (error.code === 'ECONNABORTED' && retryCount < 2) {
      console.log(`Tentativo ${retryCount + 1} di creazione nota...`);
      return await createNote(noteData, retryCount + 1);
    }
    
    // Se ancora fallisce, crea una nota temporanea locale
    if (error.code === 'ECONNABORTED') {
      const tempId = 'temp-' + Date.now();
      const tempNote = {
        ...noteData,
        id: tempId,
        temporary: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Salva in cache
      const cachedNotes = getCachedNotes();
      cachedNotes.push(tempNote);
      localStorage.setItem('cachedNotes', JSON.stringify(cachedNotes));
      
      return tempNote;
    }
    
    throw error;
  }
};

// Utilizzo di debounce per il salvataggio delle note
// Aspetta 800ms di inattività prima di inviare la richiesta
export const saveNote = debounce(async (noteData) => {
  try {
    const response = await api.post('/api/notes', noteData);
    return response.data;
  } catch (error) {
    throw error;
  }
}, 800);

// Aggiorna la cache quando una nota viene modificata
export const updateNote = debounce(async (id, noteData) => {
  try {
    const response = await api.put(`/api/notes/${id}`, noteData);
    
    // Aggiorna la cache
    if (notesCache.length > 0) {
      notesCache = notesCache.map(note => 
        note.id === id ? response.data : note
      );
    }
    
    return response.data;
  } catch (error) {
    throw error;
  }
}, 800);

export const deleteNote = async (id) => {
  try {
    await api.delete(`/api/notes/${id}`);
    return true;
  } catch (error) {
    throw error;
  }
};

// Aggiungi questa funzione in api.js
export const checkServerStatus = async () => {
  try {
    // Usa un endpoint esistente che restituisce una risposta leggera
    // Ad esempio, possiamo usare un tentativo di preflight OPTIONS su auth/register
    const response = await axios({
      method: 'OPTIONS',
      url: 'https://backend-upsearch.onrender.com/auth/register',
      timeout: 15000,
      headers: { 'Cache-Control': 'no-cache' }
    });
    return true; // Server online
  } catch (error) {
    console.error('Errore nella verifica dello stato del server:', error);
    return false; // Server offline o errore
  }
};

const getUserData = async () => {
  // Prova a recuperare i dati dalla cache locale
  const cachedUser = localStorage.getItem('user');
  if (cachedUser) {
    return JSON.parse(cachedUser);
  }
  
  // Se non ci sono dati in cache, recuperali dal server
  const response = await api.get('/user/me');
  localStorage.setItem('user', JSON.stringify(response.data));
  return response.data;
};

// Esporta l'istanza di axios configurata
export default api;
