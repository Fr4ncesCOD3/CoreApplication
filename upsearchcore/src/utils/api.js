import axios from 'axios';
import { debounce } from 'lodash';
import { toast } from './notification';

// URL di base del backend
const baseURL = 'https://backend-upsearch.onrender.com';

// Configura axios con l'URL base e gli header di default
const api = axios.create({
  baseURL,
  timeout: 30000, // Ridotto da 60000 a 30000ms (30 secondi)
  headers: {
    'Content-Type': 'application/json'
  }
});

// Stato globale per tenere traccia di eventuali tentativi di risveglio dell'istanza
let isWakingUpServer = false;
let wakingUpPromise = null;

// Aggiungi queste variabili per gestire il backoff esponenziale
let retryTimeout = 1000; // Timeout iniziale di 1 secondo
const COOLDOWN_PERIOD = 10000; // 10 secondi di attesa dopo un errore 429

// Aggiungi gestione rate limiting e strategie di fallback
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 secondo tra richieste
const RATE_LIMIT_COOLDOWN = 5000; // 5 secondi di attesa in caso di errore 429
const CACHE_TTL = 2 * 60 * 1000; // Ridotto da 5 a 2 minuti

// Aggiungi questo helper di throttling
let apiThrottleTimers = {};

const throttleApiCall = (key, fn, delay = 2000) => {
  if (apiThrottleTimers[key]) {
    clearTimeout(apiThrottleTimers[key]);
  }
  
  return new Promise(resolve => {
    apiThrottleTimers[key] = setTimeout(async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        console.error(`Errore nell'API throttled (${key}):`, error);
        throw error;
      } finally {
        delete apiThrottleTimers[key];
      }
    }, delay);
  });
};

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

// Aggiungi questa funzione per controllare l'età della cache
const getCacheAge = () => {
  const timestamp = localStorage.getItem('noteCacheTimestamp');
  if (!timestamp) return null;
  
  const age = Date.now() - parseInt(timestamp, 10);
  return age;
};

// Funzione per throttling delle richieste API
const throttledRequest = async (requestFn) => {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  
  if (elapsed < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed));
  }
  
  lastRequestTime = Date.now();
  return requestFn();
};

// Ottimizzazione della funzione getNotes per prioritizzare le chiamate online
const getNotes = async () => {
  try {
    // Ottieni l'utente corrente
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      console.warn('Utente non autenticato, impossibile recuperare note');
      return [];
    }
    
    const user = JSON.parse(userStr);
    if (!user || !user.id) {
      console.warn('Dati utente non validi');
      return [];
    }
    
    console.log(`Tentativo di caricamento note per utente: ${user.id}`);
    
    // Fai SEMPRE una richiesta al server come prima opzione
    try {
      const response = await api.get('/api/notes', { 
        params: { userId: user.id },
        timeout: 20000 // Timeout più breve per questa richiesta specifica
      });
      
      if (response.data) {
        console.log(`Note caricate dal server: ${response.data.length}`);
        // Aggiorna la cache solo se la richiesta ha successo
        localStorage.setItem('cachedNotes', JSON.stringify(response.data));
        localStorage.setItem('noteCacheTimestamp', Date.now().toString());
        return response.data;
      }
    } catch (serverError) {
      console.error('Errore nella richiesta al server:', serverError);
      
      // Se la richiesta al server fallisce, controlla la cache
      const cachedData = getCachedNotes();
      const cacheAge = getCacheAge();
      
      if (cachedData && cachedData.length > 0 && cacheAge && cacheAge < CACHE_TTL) {
        console.log(`Fallback alla cache: ${cachedData.length} note, età cache: ${Math.round(cacheAge/1000)}s`);
        toast.warning('Impossibile connettersi al server, utilizzo dati in cache');
        return cachedData.filter(note => !note.userId || note.userId === user.id);
      } else {
        // Se non ci sono dati in cache o sono troppo vecchi, propaga l'errore
        toast.error('Impossibile caricare le note dal server e nessun dato locale disponibile');
        throw serverError;
      }
    }
  } catch (error) {
    console.error('Errore generale nel recupero delle note:', error);
    throw error;
  }
};

// Assicuriamoci di esporre questa funzione
export { getNotes };

// Miglioramento della funzione createNote per garantire la creazione online
const createNote = async (noteData) => {
  try {
    toast.info('Creazione nota in corso...');
    
    const response = await api.post('/api/notes', noteData, { 
      timeout: 15000 
    });
    
    // Se la creazione online ha successo, aggiorna la cache
    if (response.data) {
      toast.success('Nota creata con successo');
      
      // Aggiorna la cache locale
      const cachedNotes = getCachedNotes();
      localStorage.setItem('cachedNotes', JSON.stringify([...cachedNotes, response.data]));
      localStorage.setItem('noteCacheTimestamp', Date.now().toString());
    }
    
    return response.data;
  } catch (error) {
    console.error('Errore nella creazione della nota:', error);
    
    if (error.response && error.response.status === 429) {
      toast.error('Troppe richieste. Riprova tra qualche secondo.');
      throw new Error('Rate limit exceeded');
    }
    
    toast.error('Errore nella creazione della nota. Verifica la connessione.');
    throw error;
  }
};

// Ottimizza updateNote per essere più affidabile
export const updateNote = debounce(async (id, noteData) => {
  try {
    // Prima di aggiornare, verifica che il server sia raggiungibile
    let serverAvailable = false;
    try {
      serverAvailable = await checkServerStatus();
    } catch (e) {
      serverAvailable = false;
    }
    
    if (!serverAvailable) {
      toast.warning('Server non raggiungibile. Il salvataggio sarà ritardato.');
      
      // Memorizza la modifica per sincronizzarla in seguito
      const pendingUpdates = JSON.parse(localStorage.getItem('pendingUpdates') || '[]');
      localStorage.setItem('pendingUpdates', JSON.stringify([
        ...pendingUpdates.filter(p => p.id !== id), // Rimuove aggiornamenti precedenti per la stessa nota
        { id, data: noteData, timestamp: Date.now() }
      ]));
      
      // Rifiuta la promessa per evitare che il componente pensi che tutto sia andato bene
      return Promise.reject(new Error('Server non raggiungibile'));
    }
    
    // Se il server è disponibile, procedi con l'aggiornamento
    const response = await api.put(`/api/notes/${id}`, noteData);
    
    // Aggiorna la cache
    const cachedNotes = getCachedNotes();
    if (cachedNotes.length > 0) {
      const updatedNotes = cachedNotes.map(note => 
        note.id === id ? { ...note, ...response.data } : note
      );
      localStorage.setItem('cachedNotes', JSON.stringify(updatedNotes));
      localStorage.setItem('noteCacheTimestamp', Date.now().toString());
    }
    
    return response.data;
  } catch (error) {
    console.error(`Errore nell'aggiornamento della nota ${id}:`, error);
    throw error;
  }
}, 800); // 800ms di debounce

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
