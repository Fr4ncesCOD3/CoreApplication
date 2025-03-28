import api from './api';
import axios from 'axios';

/**
 * Gestisce il controllo dello stato del server quando non esiste un endpoint ping
 * Usa un endpoing esistente che restituisca risposte leggere
 */
export const pingServer = async () => {
  try {
    // Usa OPTIONS per verificare la disponibilità del server con richiesta leggera
    const response = await api({
      method: 'OPTIONS',
      url: '/auth/register',
      timeout: 15000,
    });
    
    return {
      online: true,
      message: 'Server connesso',
      responseTime: response.headers['x-response-time'] || 'N/A'
    };
  } catch (error) {
    let message = 'Server non disponibile';
    
    if (error.code === 'ECONNABORTED') {
      message = 'Timeout della connessione';
    } else if (!error.response) {
      message = 'Errore di rete';
    } else {
      message = `Errore HTTP: ${error.response.status}`;
    }
    
    return {
      online: false,
      message,
      error
    };
  }
};

/**
 * Controlla se il server è in sleep mode su Render
 */
export const isServerSleeping = async () => {
  const start = Date.now();
  const status = await pingServer();
  const responseTime = Date.now() - start;
  
  // Se il tempo di risposta è superiore a 5 secondi, è probabile che il server si stia risvegliando
  return !status.online || responseTime > 5000;
};

/**
 * Modifica questa funzione per utilizzare un endpoint esistente
 */
export const wakeUpServer = async () => {
  try {
    // Usa un endpoint esistente che non richiede autenticazione
    const response = await axios.head(`${API_BASE_URL}/auth/login`, { 
      timeout: 10000,
      validateStatus: (status) => status < 500
    });
    return response.status < 500;
  } catch (error) {
    console.error('Errore nella connessione al server:', error);
    return false;
  }
};
