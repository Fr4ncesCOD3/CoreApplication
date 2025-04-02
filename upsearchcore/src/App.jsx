import React, { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { toast } from './utils/notification'
import axios from 'axios'
import { BrowserRouter } from 'react-router-dom'
import ErrorBoundary from './utils/ErrorBoundary';
import { CacheService } from './utils/cache';
import './App.css'
import { validateToken, getCsrfToken } from './utils/api';
import { wakeUpServer, initializeServerCheck } from './utils/ping';
import ProtectedRoute from './utils/ProtectedRoute';

// Caricamento lazy dei componenti per migliorare le prestazioni
const Login = lazy(() => import('./Components/Auth/Login'))
const Register = lazy(() => import('./Components/Auth/Register'))
const Notepad = lazy(() => import('./Components/Notepad/notepad/Notepad'))

// Utilizzo delle variabili d'ambiente per la configurazione
const API_URL = import.meta.env.VITE_API_URL ;
const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT) || 20000;

// Configurazione base di axios
axios.defaults.baseURL = API_URL;
axios.defaults.timeout = API_TIMEOUT;
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Intercettatore per aggiungere il token CSRF a ogni richiesta (non GET)
axios.interceptors.request.use(
  async config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Non serve più inviare token CSRF negli header 
    // perché ora utilizziamo il pattern nel path dell'URL
    
    // Supporto per la modalità offline: aggiungi un header per identificare le richieste offline
    if (!navigator.onLine) {
      config.headers['X-Offline-Mode'] = 'true';
      
      // Salva la richiesta nella coda di richieste in sospeso
      if (config.method !== 'get') {
        const pendingRequests = JSON.parse(localStorage.getItem('pendingRequests') || '[]');
        pendingRequests.push({
          url: config.url,
          method: config.method,
          data: config.data,
          timestamp: Date.now()
        });
        localStorage.setItem('pendingRequests', JSON.stringify(pendingRequests));
        
        // Mostra un messaggio che la richiesta verrà sincronizzata quando tornerà online
        toast.info('Sei offline. La tua richiesta verrà sincronizzata quando tornerai online.');
      }
    }
    
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Intercettatore migliorato per la gestione unificata degli errori
axios.interceptors.response.use(
  response => response,
  error => {
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

// Migliorare il LoadingFallback component
const LoadingFallback = () => (
  <div className="loading-container">
    <div className="d-flex flex-column align-items-center">
      <div className="spinner-border text-primary mb-3" role="status">
        <span className="visually-hidden">Caricamento...</span>
      </div>
      <p className="text-center text-muted">Caricamento dell'applicazione...</p>
    </div>
  </div>
);

// Migliorare il componente AuthGuard per la verifica dell'autenticazione
const AuthGuard = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [isVerifying, setIsVerifying] = useState(true);
  
  useEffect(() => {
    const verifyAuthentication = async () => {
      try {
        // Verifica se l'utente è autenticato
        const token = localStorage.getItem('token');
        
        if (!token) {
          setIsAuthenticated(false);
          setIsVerifying(false);
          return;
        }
        
        // Se offline, considera il token valido temporaneamente
        if (!navigator.onLine) {
          setIsAuthenticated(true);
          setIsVerifying(false);
          return;
        }
        
        // Se online, verifica il token con il server
        try {
          const response = await axios.get('/auth/validate-token', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          setIsAuthenticated(true);
        } catch (error) {
          if (error.response && error.response.status === 401 || error.response?.status === 403) {
            // Token non valido o scaduto
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setIsAuthenticated(false);
            toast.error('La tua sessione è scaduta. Effettua nuovamente il login.');
          } else {
            // Per altri errori, mantieni autenticato per evitare logout non necessari
            console.error('Errore durante la verifica del token:', error);
            setIsAuthenticated(true);
          }
        }
      } finally {
        setIsVerifying(false);
      }
    };
    
    verifyAuthentication();
  }, []);
  
  // Mostra un loader migliorato mentre verifichiamo l'autenticazione
  if (isVerifying) {
    return (
      <div className="loading-container fade-in">
        <div className="d-flex flex-column align-items-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Verifica in corso...</span>
          </div>
          <p className="text-center text-muted">Verifica dell'autenticazione...</p>
        </div>
      </div>
    );
  }
  
  return isAuthenticated ? children : <Navigate to="/login" />;
};

// Componente PrivateRoute migliorato che reindirizza a /note/ se l'utente è autenticato
const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const location = useLocation();
  
  // Verifica se l'utente è autenticato
  if (!token) {
    // Redirect al login se non autenticato
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // Se siamo alla root e l'utente è autenticato, reindirizza a /note/
  if (location.pathname === '/') {
    return <Navigate to="/note/" replace />;
  }
  
  // Altrimenti mostra il contenuto protetto
  return children;
};

// Componente per la gestione della modalità offline
const OfflineManager = () => {
  // Sincronizza le richieste in sospeso quando torna online
  useEffect(() => {
    const synchronizePendingRequests = async () => {
      if (navigator.onLine) {
        const pendingRequests = JSON.parse(localStorage.getItem('pendingRequests') || '[]');
        
        if (pendingRequests.length > 0) {
          toast.info(`Sincronizzazione di ${pendingRequests.length} richieste in sospeso...`);
          
          // Crea una copia e svuota la lista per evitare duplicati
          const requestsToSync = [...pendingRequests];
          localStorage.setItem('pendingRequests', JSON.stringify([]));
          
          let successCount = 0;
          let failureCount = 0;
          
          for (const request of requestsToSync) {
            try {
              await axios({
                url: request.url,
                method: request.method,
                data: request.data
              });
              successCount++;
            } catch (error) {
              console.error('Errore durante la sincronizzazione:', error);
              failureCount++;
              
              // Aggiungi di nuovo alla lista se il fallimento non è dovuto a 400/401/403
              if (!error.response || (error.response.status !== 400 && 
                                     error.response.status !== 401 && 
                                     error.response.status !== 403)) {
                const currentPendingRequests = JSON.parse(localStorage.getItem('pendingRequests') || '[]');
                currentPendingRequests.push(request);
                localStorage.setItem('pendingRequests', JSON.stringify(currentPendingRequests));
              }
            }
          }
          
          if (successCount > 0) {
            toast.success(`Sincronizzate ${successCount} richieste`);
          }
          
          if (failureCount > 0) {
            toast.warning(`Non è stato possibile sincronizzare ${failureCount} richieste`);
          }
        }
      }
    };
    
    const handleOnline = () => {
      toast.success('Sei tornato online. Sincronizzando le modifiche...');
      synchronizePendingRequests();
    };
    
    const handleOffline = () => {
      toast.warning('Sei offline. Le modifiche verranno sincronizzate quando tornerai online.');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Verifica all'avvio se ci sono richieste in sospeso da sincronizzare
    synchronizePendingRequests();
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return null;
};

function App() {
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme || 'light';
  });
  
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };
  
  useEffect(() => {
    document.body.className = theme;
  }, [theme]);
  
  useEffect(() => {
    // Gestione degli errori non catturati
    const handleError = (event) => {
      console.error('Errore non catturato:', event.error);
      toast.error('Si è verificato un errore inaspettato. Ricarica la pagina se l\'applicazione non risponde.');
    };
    
    // Gestione delle promesse non gestite
    const handleRejection = (event) => {
      console.error('Promessa non gestita:', event.reason);
    };
    
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);
  
  useEffect(() => {
    const checkBackend = async () => {
      try {
        // Commenta o modifica questa sezione per evitare richieste OPTIONS problematiche
        console.log('Backend check disabilitato temporaneamente');
        /*
        const isConnected = await wakeUpServer();
        if (isConnected) {
          console.log('Backend connesso correttamente');
        } else {
          console.warn('Backend potrebbe essere in fase di avvio');
          toast.info('Il server potrebbe richiedere qualche istante per avviarsi. Riprova tra poco se riscontri problemi.');
        }
        */
      } catch (error) {
        console.warn('Errore connessione backend:', error.message);
      }
    };
    
    checkBackend();
  }, []);
  
  useEffect(() => {
    // Inizializza il controllo del server
    initializeServerCheck();
    
    // Il resto del tuo codice...
  }, []);
  
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      try {
        const noteChanges = JSON.parse(sessionStorage.getItem('noteChanges') || '{}');
        
        if (Object.keys(noteChanges).length > 0) {
          const message = "Hai modifiche non salvate. Sei sicuro di voler uscire?";
          e.returnValue = message;
          return message;
        }
      } catch (error) {
        console.error('Errore nel controllo modifiche non salvate:', error);
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
  
  useEffect(() => {
    // Verifica e recupera il token CSRF all'avvio dell'applicazione
    const initializeApp = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          // Verifica se abbiamo già un token CSRF nella cache
          const csrfToken = CacheService.getCsrfToken();
          
          // Se non abbiamo un token CSRF valido, ne richiediamo uno nuovo
          if (!csrfToken) {
            console.log('Nessun token CSRF trovato all\'avvio, ne richiedo uno nuovo');
            await getCsrfToken(true);
          } else {
            console.log('Token CSRF trovato nella cache:', csrfToken);
          }
        } catch (error) {
          console.error('Errore durante l\'inizializzazione dell\'app:', error);
        }
      }
    };
    
    initializeApp();
  }, []);
  
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="app" data-theme={theme}>
        <ErrorBoundary>
          <OfflineManager />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route 
                path="/" 
                element={
                  <ProtectedRoute>
                    <Navigate to="/note/" replace />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/note/*" 
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <Notepad theme={theme} toggleTheme={toggleTheme} />
                    </ErrorBoundary>
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/note/:id" 
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <Notepad theme={theme} toggleTheme={toggleTheme} />
                    </ErrorBoundary>
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/e/*" 
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <Notepad theme={theme} toggleTheme={toggleTheme} />
                    </ErrorBoundary>
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </BrowserRouter>
  );
}

export default App
