import axios from 'axios';
import { debounce } from 'lodash';
import { toast } from './notification';
import { CacheService } from './cache';

// Usa l'URL dal file .env
const API_URL = import.meta.env.VITE_API_URL;
console.log('API URL configurato:', API_URL);

// Configurazione di base
const api = axios.create({
  baseURL: API_URL,
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT) || 30000,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: false // Il backend non usa cookies per sessione, usa JWT
});

// Stato globale per tenere traccia di eventuali tentativi di risveglio dell'istanza
let isWakingUpServer = false;
let wakingUpPromise = null;

// Aggiungi queste variabili per gestire il backoff esponenziale
let retryTimeout = 1000; // Timeout iniziale di 1 secondo
const COOLDOWN_PERIOD = 10000; // 10 secondi di attesa dopo un errore 429

// Aggiungi gestione rate limiting e strategie di fallback
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = {
  'getNotes': 5000,        // 5 secondi
  'createNote': 3000,      // 3 secondi
  'updateNote': 10000,     // 10 secondi
  'deleteNote': 3000       // 3 secondi
};
const RATE_LIMIT_COOLDOWN = 5000; // 5 secondi di attesa in caso di errore 429
const CACHE_TTL = 2 * 60 * 1000; // Ridotto da 5 a 2 minuti

// Aggiungi questo helper di throttling
let apiThrottleTimers = {};

// Implementa un throttle basato sulla durata
const apiThrottleQueue = {};

// Funzione migliorata per il throttling delle API
const throttleApiCall = (key, fn, forceExecute = false) => {
  const now = Date.now();
  const lastCallTime = apiThrottleQueue[key] || 0;
  const interval = MIN_REQUEST_INTERVAL[key.split('_')[0]] || 2000;
  
  // Se è trascorso abbastanza tempo o forziamo l'esecuzione
  if (forceExecute || now - lastCallTime >= interval) {
    // Aggiorna il timestamp
    apiThrottleQueue[key] = now;
    return fn();
  }
  
  // Altrimenti restituisci l'ultima promessa o reject
  console.log(`Richiesta ${key} throttled (intervallo ${interval}ms)`);
  return Promise.reject({ throttled: true, message: `Richiesta limitata: attendi ${Math.ceil((lastCallTime + interval - now)/1000)}s` });
};

// Stato per memorizzare il token CSRF
let csrfToken = null;

// Riduci richieste multiple con debounce
const getCsrfTokenDebounced = debounce(async () => {
  try {
    console.log('Richiedo nuovo token CSRF (debounced)');
    const token = localStorage.getItem('token');
    
    // Usa l'URL completo con API_URL
    const response = await axios.get(`${API_URL}/csrf`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    
    if (response.data && response.data.token) {
      // Usa CacheService per salvare il token
      CacheService.saveCsrfToken(response.data.token);
      return response.data.token;
    }
    return null;
  } catch (error) {
    console.error('Errore nel recupero del token CSRF:', error);
    return null;
  }
}, 1000);

// Migliora la gestione dei token CSRF
export const getCsrfToken = async (forceRefresh = false) => {
  // Prima cerca nella cache
  const savedToken = CacheService.getCsrfToken();
  if (savedToken && !forceRefresh) return savedToken;
  
  try {
    console.log('Richiedo nuovo token CSRF');
    const token = localStorage.getItem('token');
    
    // Proteggi contro richieste simultanee
    if (window.pendingCsrfRequest) {
      console.log('Richiesta CSRF già in corso, attendere...');
      try {
        const result = await window.pendingCsrfRequest;
        return result;
      } catch (error) {
        console.error('Errore nella richiesta CSRF pendente:', error);
      }
    }
    
    // Crea una Promise per gestire le richieste multiple
    window.pendingCsrfRequest = (async () => {
      try {
        // Usa l'URL corretto per il backend
        const response = await axios.get(`${API_URL}/csrf`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          timeout: 10000 // 10 secondi timeout
        });
        
        if (response.data && response.data.token) {
          // Salva il token CSRF tramite CacheService
          CacheService.saveCsrfToken(response.data.token);
          console.log('Ottenuto nuovo CSRF token:', response.data.token);
          return response.data.token;
        }
        
        console.warn('Risposta CSRF senza token:', response.data);
        return null;
      } catch (error) {
        console.error('Errore nel recupero del token CSRF:', error);
        throw error;
      } finally {
        window.pendingCsrfRequest = null;
      }
    })();
    
    return await window.pendingCsrfRequest;
  } catch (error) {
    console.error('Errore nel recupero del token CSRF:', error);
    
    // Fallback: usa l'ultimo token salvato, anche se forceRefresh=true
    const lastToken = localStorage.getItem('csrfToken');
    if (lastToken) {
      console.log('Usando ultimo token CSRF disponibile come fallback');
      return lastToken;
    }
    
    return null;
  }
};

/**
 * Imposta un token CSRF recuperato dal backend
 * @param {string} token - Token CSRF
 */
export const setCsrfToken = (token) => {
  // Usa CacheService per salvare il token
  CacheService.saveCsrfToken(token);
  console.log('Token CSRF salvato:', token);
};

// Aggiungi una funzione per ottenere il token salvato
export const getSavedCsrfToken = () => {
  return CacheService.getCsrfToken();
};

// Funzione per ottenere un token CSRF valido
const fetchCsrfToken = async () => {
  // Verifica se abbiamo già un token valido (meno di 30 minuti)
  if (csrfToken && csrfToken.value && csrfToken.timestamp) {
    const tokenAge = Date.now() - csrfToken.timestamp;
    if (tokenAge < 30 * 60 * 1000) {
      return csrfToken.value;
    }
  }
  
  try {
    // Usa l'endpoint CSRF dalle variabili d'ambiente
    const csrfEndpoint = import.meta.env.VITE_CSRF_ENDPOINT || '/csrf';
    
    // Richiedi un nuovo token CSRF
    const response = await axios.get(`${API_URL}${csrfEndpoint}`, {
      withCredentials: true // Importante per ricevere i cookie CSRF
    });
    
    if (response.data && response.data.token) {
      if (!csrfToken) csrfToken = {}; // Inizializza l'oggetto se necessario
      csrfToken.value = response.data.token;
      csrfToken.timestamp = Date.now();
      return csrfToken.value;
    }
    
    // Se non riceviamo un token esplicito, controlla i cookie
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'XSRF-TOKEN') {
        if (!csrfToken) csrfToken = {}; // Inizializza l'oggetto se necessario
        csrfToken.value = decodeURIComponent(value);
        csrfToken.timestamp = Date.now();
        return csrfToken.value;
      }
    }
    
    console.warn('Impossibile ottenere un token CSRF');
    return null;
  } catch (error) {
    console.error('Errore nel recupero del token CSRF:', error);
    return null;
  }
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
          url: `${API_URL}/auth/register`,
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

// Interceptor per aggiungere il token JWT a ogni richiesta
axios.interceptors.request.use(
  async config => {
    // Aggiungi token JWT in tutte le richieste
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Interceptor per gestire le risposte e i possibili errori di autenticazione
axios.interceptors.response.use(
  response => response,
  async error => {
    // Se siamo offline, gestisci la risposta offline
    if (!navigator.onLine) {
      if (error.config && error.config.method === 'get') {
        // Per le richieste GET, prova a recuperare dati dalla cache
        const cachedData = CacheService.getFromCache(`request_${error.config.url}`);
        if (cachedData) {
          toast.info('Utilizzando dati dalla cache in modalità offline');
          return Promise.resolve({ data: cachedData, fromCache: true });
        }
      }
      return Promise.reject({ ...error, offline: true });
    }

    // Gestione specifica per errori 404
    if (error.response && error.response.status === 404) {
      console.error('Risorsa non trovata:', error.config?.url);
      
      // Se si tratta di una nota (URL contiene /notes/)
      if (error.config?.url && error.config.url.includes('/notes/')) {
        const noteId = error.config.url.split('/notes/')[1]?.split('/')[0];
        if (noteId) {
          console.log(`Nota ${noteId} non trovata`);
          
          // Se siamo nella visualizzazione di una nota, reindirizza all'elenco delle note
          const currentPath = window.location.pathname;
          if (currentPath.includes(`/note/${noteId}`)) {
            console.log('Reindirizzamento alla lista delle note');
            window.location.href = '/note/';
            toast.error('La nota richiesta non è disponibile');
            return Promise.reject({ ...error, handled: true });
          }
        }
      }
    }
    
    // Se il token è scaduto o non valido (401 o 403)
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Verifica se l'errore è relativo all'autenticazione e non a CSRF o altro
      const isAuthError = 
        (error.response.data && error.response.data.error === 'Unauthorized') ||
        error.response.data?.message?.includes('JWT expired') ||
        !error.response.data?.message?.includes('CSRF');
        
      if (isAuthError) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Reindirizza al login solo se non siamo già nella pagina di login
        const currentPath = window.location.pathname;
        if (currentPath !== '/login' && currentPath !== '/register') {
          toast.error('La sessione è scaduta. Effettua nuovamente l\'accesso.');
          window.location.href = '/login';
        }
      }
    } else if (error.response && error.response.status === 400 && 
               error.response.data && error.response.data.message &&
               error.response.data.message.includes('URL non valido')) {
      // Gestione specifica per errori di decrittografia URL
      console.error('Errore di decrittografia URL:', error.response.data);
      toast.error('Errore nell\'elaborazione dell\'URL. Riprova.');
    } else if (error.code === 'ECONNABORTED') {
      // Gestione timeout
      toast.error('La richiesta è scaduta. Il server potrebbe essere sovraccarico.');
    } else if (!error.response && error.request) {
      // Gestione errori di rete (nessuna risposta)
      toast.error('Impossibile comunicare con il server. Verifica la tua connessione.');
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

// Funzioni API allineate con il backend

// Auth API
export const login = async (credentials) => {
  try {
    const response = await axios.post('/auth/login', credentials);
    return response.data;
  } catch (error) {
    console.error('Errore durante il login:', error);
    throw error;
  }
};

export const register = async (userData) => {
  try {
    const response = await axios.post('/auth/register', userData);
    return response.data;
  } catch (error) {
    console.error('Errore durante la registrazione:', error);
    throw error;
  }
};

export const verifyOtp = async (otpData) => {
  try {
    const response = await axios.post('/auth/verify-otp', otpData);
    return response.data;
  } catch (error) {
    console.error('Errore durante la verifica OTP:', error);
    throw error;
  }
};

export const resendOtp = async (userData) => {
  try {
    const response = await axios.post('/auth/resend-otp', userData);
    return response.data;
  } catch (error) {
    console.error('Errore durante il reinvio OTP:', error);
    throw error;
  }
};

// Sistema di tracciamento richieste in corso
const pendingRequests = {};

// Funzione per creare una chiave univoca per le richieste
const createRequestKey = (method, url, data) => {
  return `${method}_${url}_${data ? JSON.stringify(data) : ''}`;
};

// Implementa un wrapper per evitare richieste duplicate
const dedupRequest = async (key, requestFn) => {
  // Se c'è già una richiesta in corso con la stessa chiave, usa quella
  if (pendingRequests[key]) {
    console.log(`Richiesta duplicata rilevata [${key}], riutilizzo promessa esistente`);
    return pendingRequests[key];
  }

  try {
    // Crea e memorizza la promessa
    pendingRequests[key] = requestFn();
    // Attendi il risultato
    const result = await pendingRequests[key];
    return result;
  } finally {
    // Pulisci dopo la risoluzione
    delete pendingRequests[key];
  }
};

// Modifica getNotes per implementare cache e deduplicazione
export const noteApi = {
  getNotes: async (forceRefresh = false) => {
    const requestKey = 'getNotes';
    
    // Usa cache se offline o se c'è già una richiesta in corso
    if (!forceRefresh && (!navigator.onLine || window.pendingGetNotes)) {
      // Se offline, usa cache
      if (!navigator.onLine) {
        const cachedNotes = CacheService.getCachedNotes();
        if (cachedNotes && cachedNotes.length > 0) {
          console.log('Usando note dalla cache (offline)');
          return cachedNotes;
        }
      }
      
      // Se c'è già una richiesta in corso, attendi quella
      if (window.pendingGetNotes) {
        console.log('Richiesta getNotes già in corso, attendere...');
        try {
          return await window.pendingGetNotes;
        } catch (error) {
          // Se la richiesta in corso fallisce, continua con una nuova
          console.warn('Richiesta getNotes in corso fallita, provo nuovamente');
          // Cancella la richiesta pendente per consentire un nuovo tentativo
          window.pendingGetNotes = null;
        }
      }
    }
    
    // Implementazione di backoff esponenziale per i tentativi
    let retryCount = 0;
    const maxRetries = 3;
    const baseDelay = 1000; // 1 secondo

    const executeRequest = async () => {
      try {
        // Codice esistente per ottenere il token CSRF e costruire l'URL
        const csrfToken = localStorage.getItem('csrfToken');
        let url;
        
        if (csrfToken) {
          url = `/${csrfToken}/notes`;
          console.log('Utilizzando URL con CSRF per getNotes');
        } else {
          url = '/api/v1/user/notes';
          console.log('Utilizzando URL fallback per getNotes');
        }
        
        const response = await axios.get(url);
        
        // Salva le note nella cache
        if (response.data) {
          CacheService.cacheNotes(response.data);
        }
        
        return response.data;
      } catch (error) {
        console.error('Errore nel recupero delle note:', error);
        
        // Se siamo offline, usa la cache
        if (!navigator.onLine) {
          const cachedNotes = CacheService.getCachedNotes();
          if (cachedNotes.length > 0) {
            return cachedNotes;
          }
        }
        
        // Implementazione backoff esponenziale
        if (retryCount < maxRetries) {
          retryCount++;
          const delay = Math.min(baseDelay * Math.pow(2, retryCount), 10000); // Max 10 secondi
          console.log(`Riprovo getNotes tra ${delay}ms (tentativo ${retryCount}/${maxRetries})`);
          
          // Attendi prima di riprovare
          await new Promise(resolve => setTimeout(resolve, delay));
          return executeRequest(); // Riprova ricorsivamente
        }
        
        // Se tutti i tentativi falliscono, torna alla cache o rilancia l'errore
        const cachedNotes = CacheService.getCachedNotes();
        if (cachedNotes && cachedNotes.length > 0) {
          console.log('Tutti i tentativi falliti, uso cache');
          return cachedNotes;
        }
        
        throw error;
      }
    };
    
    // Throttle le richieste
    try {
      window.pendingGetNotes = throttleApiCall(requestKey, executeRequest, forceRefresh);
      
      return await window.pendingGetNotes;
    } catch (error) {
      if (error.throttled) {
        // Se throttled, torna ai dati in cache
        console.log('Richiesta throttled, uso cache');
        return CacheService.getCachedNotes();
      }
      throw error;
    } finally {
      // Assicurati di resettare sempre lo stato pendingGetNotes alla fine
      window.pendingGetNotes = null;
    }
  },
  
  getNoteById: async (id) => {
    try {
      // Ottieni il token CSRF per l'URL
      const csrfToken = localStorage.getItem('csrfToken');
      
      // Costruisci l'URL in modo corretto
      let url;
      if (csrfToken) {
        url = `/${csrfToken}/notes/${id}`;
        console.log('Utilizzando URL con CSRF per getNoteById:', url);
      } else {
        // Fallback senza token CSRF
        url = `/api/v1/user/notes/${id}`;
        console.log('Utilizzando URL fallback per getNoteById:', url);
      }
      
      console.log('Richiesta nota singola con URL:', url);
      const response = await axios.get(url);
      console.log('Nota recuperata con successo:', response.status);
      return response.data;
    } catch (error) {
      console.error(`Errore nel recupero della nota ${id}:`, error);
      
      // Se è un problema di autenticazione, reindirizza al login
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.warn('Token non valido o scaduto, reindirizzamento al login...');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      
      throw error;
    }
  },
  
  createNote: async (noteData) => {
    // Crea una chiave univoca per questa richiesta
    const requestKey = `createNote_${JSON.stringify(noteData)}`;
    
    // Controllo per note tutorial duplicate
    if (noteData.isTutorial === true || 
        (noteData.tags && Array.isArray(noteData.tags) &&
         noteData.tags.some(tag => ['tutorial', 'benvenuto'].includes(tag)))) {
      try {
        // Verifica se esiste già una nota tutorial
        const notes = await noteApi.getNotes();
        const existingTutorial = notes.find(note => 
          note.isTutorial === true || 
          (note.tags && Array.isArray(note.tags) &&
           note.tags.some(tag => ['tutorial', 'benvenuto'].includes(tag)))
        );
        
        if (existingTutorial) {
          console.log('Nota tutorial già esistente:', existingTutorial.id);
          return existingTutorial;
        }
      } catch (error) {
        console.warn('Errore durante la verifica delle note tutorial esistenti:', error);
      }
    }
    
    return dedupRequest(requestKey, async () => {
      try {
        // Codice esistente per la creazione della nota
        // Ottieni token CSRF e costruisci l'URL
        const csrfToken = localStorage.getItem('csrfToken');
        let url;
        
        if (csrfToken) {
          url = `/${csrfToken}/notes`;
        } else {
          url = '/api/v1/user/notes';
        }
        
        const response = await axios.post(url, noteData);
        
        // Aggiorna la cache con la nuova nota
        if (response.data) {
          CacheService.updateNoteInCache(response.data);
        }
        
        return response.data;
      } catch (error) {
        console.error('Errore nella creazione della nota:', error);
        
        // Se siamo offline, crea una nota locale
        if (!navigator.onLine) {
          const tempNote = {
            id: `temp-${Date.now()}`,
            ...noteData,
            temporary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          // Salva nella cache locale
          CacheService.updateNoteInCache(tempNote);
          
          return tempNote;
        }
        
        throw error;
      }
    });
  },
  
  updateNote: async (id, noteData) => {
    // Crea una chiave univoca per questa richiesta
    const requestKey = `updateNote_${id}_${JSON.stringify(noteData)}`;
    
    return dedupRequest(requestKey, async () => {
      try {
        // Verifica e limita la dimensione dei dati
        if (noteData.content && typeof noteData.content === 'string' && noteData.content.length > 2000000) {
          console.warn('Contenuto troppo grande per l\'invio al server, troncato a 2MB');
          noteData.content = noteData.content.substring(0, 2000000);
        }
        
        if (noteData.title && typeof noteData.title === 'string' && noteData.title.length > 255) {
          console.warn('Titolo troppo lungo, troncato a 255 caratteri');
          noteData.title = noteData.title.substring(0, 255);
        }
        
        // Ottieni il token CSRF dalla cache
        let csrfToken = CacheService.getCsrfToken();
        
        // Se non c'è un token CSRF, tenta di ottenerlo
        if (!csrfToken) {
          try {
            csrfToken = await getCsrfToken(true);
          } catch (csrfError) {
            console.error('Errore nel recupero del token CSRF:', csrfError);
          }
        }
        
        // Costruisci l'URL per la richiesta
        let url;
        if (csrfToken) {
          url = `/${csrfToken}/notes/${id}`;
        } else {
          url = `/api/v1/user/notes/${id}`;
          console.warn('Usando URL fallback senza CSRF token');
        }
        
        console.log(`Aggiornamento nota ${id} con URL: ${url}`);
        
        // Sanitizza il contenuto prima dell'invio
        if (noteData.content) {
          noteData.content = CacheService.sanitizeHtml(noteData.content);
        }
        
        // Aggiungi timestamp di aggiornamento se non presente
        if (!noteData.updatedAt) {
          noteData.updatedAt = new Date().toISOString();
        }
        
        // Implementa un meccanismo di timeout e retry
        const maxRetries = 2;
        const timeout = 15000; // 15 secondi
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            // Se non è il primo tentativo, aggiungiamo un ritardo esponenziale
            if (attempt > 0) {
              const delay = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
              console.log(`Tentativo ${attempt}/${maxRetries} dopo ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            // Configura le opzioni della richiesta con timeout
            const config = {
              timeout: timeout,
              headers: {
                'Content-Type': 'application/json'
              }
            };
            
            // Esegui la richiesta di aggiornamento
            const response = await axios.put(url, noteData, config);
            
            // Aggiorna la cache
            if (response.data) {
              CacheService.updateNoteInCache(response.data);
            }
            
            return response.data;
          } catch (error) {
            // In caso di timeout o errore di rete, riprova
            if (!error.response || error.code === 'ECONNABORTED') {
              if (attempt < maxRetries) {
                console.log('Timeout o errore di connessione, riprovo...');
                continue;
              }
            }
            
            // In caso di errore 500, potrebbe essere un problema di CSRF
            if (error.response && error.response.status === 500) {
              // Solo sul primo errore 500, prova a ottenere un nuovo token CSRF
              if (attempt === 0) {
                try {
                  console.log('Errore 500, provo a ottenere un nuovo token CSRF');
                  await getCsrfToken(true);
                  
                  // Riprova con il nuovo token
                  const newCsrfToken = CacheService.getCsrfToken();
                  if (newCsrfToken) {
                    const retryUrl = `/${newCsrfToken}/notes/${id}`;
                    console.log(`Riprovo aggiornamento nota ${id} con nuovo token CSRF`);
                    
                    // Riprova con il nuovo URL ma con un timeout più lungo
                    const retryResponse = await axios.put(retryUrl, noteData, {
                      timeout: timeout * 1.5, // 50% più lungo
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    });
                    
                    if (retryResponse.data) {
                      CacheService.updateNoteInCache(retryResponse.data);
                      return retryResponse.data;
                    }
                  }
                } catch (retryError) {
                  console.error('Errore nel secondo tentativo di aggiornamento:', retryError);
                  // Se siamo all'ultimo tentativo, propaga l'errore
                  if (attempt === maxRetries) throw retryError;
                }
              } else {
                // Se errore 500 e non è il primo tentativo, propaga l'errore
                throw error;
              }
            } else {
              // Per altri errori di risposta (non 500), propaga subito
              throw error;
            }
          }
        }
        
        // Se arriviamo qui, tutti i tentativi sono falliti
        throw new Error('Tutti i tentativi di aggiornamento della nota sono falliti');
      } catch (error) {
        console.error('Errore nell\'aggiornamento della nota:', error);
        
        // Se siamo offline, aggiorna localmente
        if (!navigator.onLine) {
          // Ottieni la nota esistente dalla cache
          const cachedNotes = CacheService.getCachedNotes();
          const existingNote = cachedNotes.find(note => note.id === id);
          
          if (existingNote) {
            const updatedNote = {
              ...existingNote,
              ...noteData,
              updatedAt: new Date().toISOString(),
              temporary: true
            };
            
            // Aggiorna la cache
            CacheService.updateNoteInCache(updatedNote);
            
            return updatedNote;
          }
        }
        
        // Se non possiamo gestire l'errore, propagalo
        throw error;
      }
    });
  },
  
  deleteNote: async (id) => {
    try {
      // Se offline, salva l'operazione di eliminazione per la sincronizzazione futura
      if (!navigator.onLine) {
        console.log('Utente offline, salvataggio locale dell\'eliminazione');
        const pendingDeletes = JSON.parse(localStorage.getItem('pendingDeletes') || '[]');
        pendingDeletes.push({
          type: 'delete',
          id: id,
          timestamp: Date.now()
        });
        localStorage.setItem('pendingDeletes', JSON.stringify(pendingDeletes));
        
        // Rimuovi la nota dalla cache locale
        const cachedNotes = JSON.parse(localStorage.getItem('cachedNotes') || '[]');
        const updatedCachedNotes = cachedNotes.filter(note => note.id !== id);
        localStorage.setItem('cachedNotes', JSON.stringify(updatedCachedNotes));
        
        return { success: true, offline: true };
      }
      
      // Ottieni il token CSRF per l'URL
      const csrfToken = localStorage.getItem('csrfToken');
      if (!csrfToken) {
        console.warn('CSRF token mancante, tentativo di ottenerne uno nuovo');
        try {
          await getCsrfToken(true);
        } catch (error) {
          console.error('Impossibile ottenere token CSRF:', error);
        }
      }
      
      // Costruisci l'URL in modo corretto
      const latestCsrf = localStorage.getItem('csrfToken');
      let url;
      if (latestCsrf) {
        url = `/${latestCsrf}/notes/${id}`;
        console.log('Utilizzando URL con CSRF per deleteNote:', url);
      } else {
        // Fallback senza token CSRF
        url = `/api/v1/user/notes/${id}`;
        console.log('Utilizzando URL fallback per deleteNote:', url);
      }
      
      console.log(`Eliminazione nota ${id} con URL:`, url);
      const response = await axios.delete(url);
      console.log('Nota eliminata con successo:', response.status);
      return response.data;
    } catch (error) {
      console.error(`Errore nell'eliminazione della nota ${id}:`, error);
      
      // Se è un problema di autenticazione, reindirizza al login
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.warn('Token non valido o scaduto, reindirizzamento al login...');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      
      throw error;
    }
  },
  
  searchNotesByUser: async (query) => {
    try {
      // Ottieni il token CSRF per l'URL
      const csrfToken = localStorage.getItem('csrfToken');
      if (!csrfToken) {
        console.warn('CSRF token mancante, tentativo di ottenerne uno nuovo');
        try {
          await getCsrfToken(true);
        } catch (error) {
          console.error('Impossibile ottenere token CSRF:', error);
        }
      }
      
      // Costruisci l'URL in modo corretto
      const latestCsrf = localStorage.getItem('csrfToken');
      let url;
      if (latestCsrf) {
        url = `/${latestCsrf}/notes?search=${encodeURIComponent(query)}`;
        console.log('Utilizzando URL con CSRF per searchNotesByUser:', url);
      } else {
        // Fallback senza token CSRF
        url = `/api/v1/user/notes?search=${encodeURIComponent(query)}`;
        console.log('Utilizzando URL fallback per searchNotesByUser:', url);
      }
      
      console.log(`Ricerca note con query '${query}' e URL:`, url);
      const response = await axios.get(url);
      console.log('Ricerca completata con successo:', response.status, response.data ? response.data.length + ' risultati' : 'nessun risultato');
      return response.data;
    } catch (error) {
      console.error('Errore nella ricerca delle note:', error);
      
      // Se è un problema di autenticazione, reindirizza al login
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.warn('Token non valido o scaduto, reindirizzamento al login...');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      
      throw error;
    }
  }
};

// User API
export const userApi = {
  getUserProfile: async () => {
    try {
      const response = await api.get('/users/profile');
      return response.data;
    } catch (error) {
      console.error('Errore recupero profilo utente:', error);
      throw error;
    }
  },
  
  updateUserProfile: async (userData) => {
    try {
      const response = await api.put('/users/profile', userData);
      return response.data;
    } catch (error) {
      console.error('Errore aggiornamento profilo:', error);
      throw error;
    }
  }
};

// Servizi NASA (se necessari)
export const nasaApi = {
  searchNasaImages: async (query) => {
    try {
      // Ottieni il token CSRF per l'URL
      const csrfToken = localStorage.getItem('csrfToken');
      const url = csrfToken 
        ? `/${csrfToken}/nasa/search?q=${encodeURIComponent(query)}` 
        : `/api/nasa/search?q=${encodeURIComponent(query)}`;
      
      console.log('Ricerca NASA con URL:', url);
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error('Errore ricerca NASA:', error);
      throw error;
    }
  },
  
  getAstronomyPictureOfDay: async (date) => {
    try {
      // Ottieni il token CSRF per l'URL
      const csrfToken = localStorage.getItem('csrfToken');
      const urlParams = date ? `?date=${date}` : '';
      const url = csrfToken 
        ? `/${csrfToken}/nasa/apod${urlParams}` 
        : `/api/nasa/apod${urlParams}`;
      
      console.log('Richiesta APOD con URL:', url);
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error('Errore recupero APOD:', error);
      throw error;
    }
  }
};

// Funzione getCachedNotes richiesta in Notepad.jsx
export const getCachedNotes = () => {
  return CacheService.getCachedNotes();
};

// Utility per verificare la connessione al server
export const checkServerStatus = async () => {
  try {
    const start = Date.now();
    await api.get('/auth/health', { timeout: 5000 });
    const responseTime = Date.now() - start;
    return {
      online: true,
      responseTime
    };
  } catch (error) {
    return {
      online: false,
      error: error.message
    };
  }
};

// Funzione per validare il token
export const validateToken = async () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return false;

    const response = await axios.get(`${API_URL}/auth/validate-token`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000
    });
    
    return response.status === 200;
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Token scaduto o non valido - puliamo lo storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Solo se non siamo già nella pagina di login, mostriamo il toast
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        toast.error('La tua sessione è scaduta. Effettua nuovamente il login.');
        // Reindirizzo alla pagina di login
        window.location.href = '/login';
      }
      
      return false;
    }
    
    // Per altri errori, consideriamo il token ancora valido
    console.warn('Errore nella validazione del token:', error);
    return true;
  }
};

// Funzione per verificare se l'utente è autenticato e reindirizzare se necessario
export const checkAuthentication = (navigateCallback) => {
  const token = localStorage.getItem('token');
  if (!token) {
    if (navigateCallback) {
      navigateCallback('/login');
    } else {
      window.location.href = '/login';
    }
    return false;
  }
  
  // Verifica se siamo online per validare il token
  if (navigator.onLine) {
    validateToken().catch(() => {
      // Se validateToken fallisce completamente, consideriamo valido il token
      // La funzione stessa gestisce già il caso di token non valido
    });
  }
  
  return true;
};

// Esporta l'istanza di axios configurata
export default api;

// Modifica initializeAxios per includere la gestione CSRF
export const initializeAxios = () => {
  // ... existing code ...
  
  // Aggiungi intercettore per gestire il token CSRF
  axios.interceptors.request.use(
    async (config) => {
      // Salta la richiesta CSRF stessa per evitare loop infiniti
      if (config.url.includes('/api/csrf')) {
        return config;
      }
      
      // Per richieste che modificano lo stato, assicurarsi che il token CSRF sia presente
      if (['post', 'put', 'delete'].includes(config.method)) {
        if (!axios.defaults.headers.common['X-CSRF-TOKEN']) {
          await getCsrfToken();
        }
      }
      return config;
    },
    (error) => Promise.reject(error)
  );
  
  // ... existing code ...
};

