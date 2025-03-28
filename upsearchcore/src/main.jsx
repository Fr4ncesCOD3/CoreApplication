import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

// Inizializza l'app con gestione errori
const startApp = () => {
  try {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error('Errore durante l\'inizializzazione dell\'app:', error);
    
    // Mostra un messaggio di errore all'utente
    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">
          <h2>Si è verificato un errore</h2>
          <p>Non è stato possibile avviare l'applicazione. Ricarica la pagina o prova con un browser più recente.</p>
          <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">
            Ricarica pagina
          </button>
        </div>
      `;
    }
  }
};

// Avvia l'applicazione
startApp();
