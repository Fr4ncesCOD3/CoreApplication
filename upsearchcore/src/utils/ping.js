import axios from 'axios';

// Definisci la variabile API_BASE_URL
const API_BASE_URL = import.meta.env.VITE_API_URL;

/**
 * Ping periodico per mantenere il server sveglio
 */
let pingInterval = null;
let isPinging = false;

/**
 * Gestisce il controllo dello stato del server con un endpoint accessibile
 */
export const pingServer = async () => {
  try {
    // Usa OPTIONS per verificare la disponibilità del server con richiesta leggera
    const response = await axios({
      method: 'OPTIONS',
      url: `${API_BASE_URL}/auth/login`,
      timeout: 15000, // 15 secondi di timeout
      headers: {} // Nessun header custom per evitare problemi CORS
    });
    
    console.log('Ping al server riuscito:', {
      status: response.status,
      headers: response.headers
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
    
    console.warn('Ping al server fallito:', message, error.message);
    
    return {
      online: false,
      message,
      error
    };
  }
};

/**
 * Tenta di "svegliare" il server con un approccio più robusto
 * Utilizza retry multipli con backoff esponenziale
 */
export const wakeUpServer = async () => {
  if (isPinging) {
    console.log('Risveglio del server già in corso...');
    return false;
  }
  
  isPinging = true;
  console.log('Avvio procedura di risveglio del server...');
  
  // Parametri per i tentativi
  const maxAttempts = 5;
  const initialTimeout = 15000; // 15 secondi
  let attempt = 0;
  let success = false;
  
  while (attempt < maxAttempts && !success) {
    attempt++;
    const timeout = initialTimeout * Math.pow(1.5, attempt - 1); // Backoff esponenziale
    
    console.log(`Tentativo ${attempt}/${maxAttempts} - Timeout: ${Math.round(timeout/1000)}s`);
    
    try {
      // Usa un endpoint sicuramente accessibile senza auth
      const response = await axios({
        method: 'OPTIONS',
        url: `${API_BASE_URL}/auth/register`,
        timeout: 60000, // 60 secondi di timeout (per gestire server lenti)
        headers: {} // Nessun header extra per evitare problemi CORS
      });
      
      console.log(`Server svegliato con successo al tentativo ${attempt}!`, {
        status: response.status,
        headers: response.headers
      });
      
      success = true;
      
      // Imposta un ping periodico per mantenere il server sveglio
      if (!pingInterval) {
        pingInterval = setInterval(async () => {
          await pingServer();
        }, 4 * 60 * 1000); // Ping ogni 4 minuti
        
        console.log('Ping periodico attivato per mantenere server sveglio');
      }
      
      break;
    } catch (error) {
      const errorMsg = error.response ? 
        `Errore HTTP: ${error.response.status}` : 
        (error.code || error.message || 'Errore sconosciuto');
      
      console.warn(`Tentativo ${attempt} fallito: ${errorMsg}`);
      
      if (attempt < maxAttempts) {
        console.log(`Attendo ${Math.round(timeout/1000)} secondi prima del prossimo tentativo...`);
        await new Promise(resolve => setTimeout(resolve, timeout));
      }
    }
  }
  
  isPinging = false;
  
  if (success) {
    console.log('Server risvegliato con successo!');
    return true;
  } else {
    console.error('Impossibile risvegliare il server dopo tutti i tentativi');
    return false;
  }
};

/**
 * Avvia la procedura di verifica e risveglio del server all'avvio dell'app
 */
export const initializeServerCheck = () => {
  console.log('Inizializzazione controllo del server...');
  
  // Verifica immediata dello stato del server
  pingServer().then(status => {
    if (status.online) {
      console.log('Server già attivo e connesso!');
      
      // Imposta il ping periodico
      if (!pingInterval) {
        pingInterval = setInterval(async () => {
          const status = await pingServer();
          console.log(`Stato server: ${status.online ? 'online' : 'offline'}`);
          
          // Emetti un evento personalizzato per informare l'app dello stato del server
          window.dispatchEvent(new CustomEvent('server-status-change', { 
            detail: status 
          }));
        }, 4 * 60 * 1000); // Ping ogni 4 minuti
      }
    } else {
      console.log('Server non disponibile, avvio procedura di risveglio...');
      wakeUpServer();
    }
  });
  
  // Pulizia interval quando l'app viene chiusa
  window.addEventListener('beforeunload', () => {
    if (pingInterval) {
      clearInterval(pingInterval);
    }
  });
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
