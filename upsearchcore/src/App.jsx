import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, Outlet } from 'react-router-dom'
import { Container, Navbar, Nav, Button } from 'react-bootstrap'
import { authService } from './utils/api'
import Login from './Components/Auth/Login'
import Register from './Components/Auth/Register'
import Notepad from './Components/Notepad/notepad/Notepad'
import './App.css'
import { toast } from './utils/notification'
import axios from 'axios'
import { BrowserRouter } from 'react-router-dom'
import ErrorBoundary from './utils/ErrorBoundary';

// Configurazione base di axios
axios.defaults.baseURL = 'https://backend-upsearch.onrender.com'
axios.defaults.timeout = 20000 // 20 secondi di timeout di default
axios.defaults.headers.common['Content-Type'] = 'application/json'

// Intercettatore per aggiungere il token di autenticazione a ogni richiesta
axios.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// Intercettatore per la gestione unificata degli errori
axios.interceptors.response.use(
  response => response,
  error => {
    // Se il token è scaduto o non valido (401)
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      
      // Reindirizza al login solo se non siamo già nella pagina di login
      const currentPath = window.location.pathname
      if (currentPath !== '/login' && currentPath !== '/register') {
        toast.error('La sessione è scaduta. Effettua nuovamente l\'accesso.')
        window.location.href = '/login'
      }
    }
    
    return Promise.reject(error)
  }
)

// Modifica il componente AuthRedirect per gestire meglio l'uso di useNavigate
const AuthRedirect = ({ children }) => {
  // Invece di usare useNavigate direttamente, verifico se è disponibile il contesto
  const navigate = typeof window !== 'undefined' ? 
    (localStorage.getItem('token') ? null : window.location.pathname === '/login' || window.location.pathname === '/register' ? null : window.location.replace('/login')) 
    : null;
  
  return children;
};

// Componente per le rotte protette
const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  
  useEffect(() => {
    // Verifica se l'utente è autenticato
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);
  
  // Mostra un loader mentre verifichiamo l'autenticazione
  if (isAuthenticated === null) {
    return (
      <div className="loading-container">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Caricamento...</span>
        </div>
      </div>
    );
  }
  
  return isAuthenticated ? children : <Navigate to="/login" />;
};

// Layout per il notepad
const NotepadLayout = () => {
  return (
    <div className="notepad-layout">
      <Sidebar />
      <div className="notepad-content">
        <Toolbar />
        <Outlet /> {/* Qui verranno renderizzati i componenti figli */}
      </div>
    </div>
  );
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
      // Non mostriamo un toast qui per evitare duplicazioni con gli errori già gestiti
    };
    
    // Gestione dell'offline/online
    const handleOffline = () => {
      toast.warning('Sei offline. Le modifiche verranno sincronizzate quando tornerai online.');
    };
    
    const handleOnline = () => {
      toast.success('Sei tornato online. Sincronizzando le modifiche...');
    };
    
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);
  
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="app" data-theme={theme}>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route 
              path="/" 
              element={
                <PrivateRoute>
                  <Navigate to="/note/" replace />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/note/*" 
              element={
                <PrivateRoute>
                  <ErrorBoundary>
                    <Notepad theme={theme} toggleTheme={toggleTheme} />
                  </ErrorBoundary>
                </PrivateRoute>
              } 
            />
            <Route 
              path="/note/:id" 
              element={
                <PrivateRoute>
                  <ErrorBoundary>
                    <Notepad theme={theme} toggleTheme={toggleTheme} />
                  </ErrorBoundary>
                </PrivateRoute>
              } 
            />
          </Routes>
        </ErrorBoundary>
      </div>
    </BrowserRouter>
  );
}

export default App
