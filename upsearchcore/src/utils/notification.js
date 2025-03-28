// Miglioramento della gestione delle notifiche

// Stile per le notifiche
const notificationStyles = `
  .notification-container {
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 9999;
    max-width: 350px;
  }
  
  .notification {
    background-color: #fff;
    color: #333;
    border-radius: 4px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
    margin: 10px 0;
    padding: 15px;
    transition: all 0.3s ease;
    opacity: 0;
    transform: translateX(50px);
    position: relative;
    overflow: hidden;
  }
  
  .notification.show {
    opacity: 1;
    transform: translateX(0);
  }
  
  .notification.success {
    border-left: 5px solid #4CAF50;
  }
  
  .notification.error {
    border-left: 5px solid #f44336;
  }
  
  .notification.info {
    border-left: 5px solid #2196F3;
  }
  
  .notification.warning {
    border-left: 5px solid #ff9800;
  }
  
  .notification-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    width: 100%;
    background-color: rgba(0, 0, 0, 0.1);
  }
  
  .notification-progress-bar {
    height: 100%;
    width: 100%;
    background-color: rgba(0, 0, 0, 0.2);
    transition: width linear;
  }
  
  .notification-close {
    position: absolute;
    top: 5px;
    right: 5px;
    cursor: pointer;
    font-size: 14px;
    opacity: 0.5;
  }
  
  .notification-close:hover {
    opacity: 1;
  }
  
  .offline-indicator {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background-color: #ff9800;
    color: white;
    text-align: center;
    padding: 5px 0;
    z-index: 10000;
  }
`;

// Aggiungi gli stili al documento
const addStyles = () => {
  if (!document.getElementById('notification-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'notification-styles';
    styleEl.textContent = notificationStyles;
    document.head.appendChild(styleEl);
  }
  
  if (!document.getElementById('notification-container')) {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
  }
};

// Inizializza i contenitori per le notifiche
addStyles();

// ID univoco per le notifiche
let notificationId = 0;

// Gestione delle notifiche
class NotificationManager {
  constructor() {
    this.notifications = new Map();
    this.maxNotifications = 5;
  }
  
  getContainer() {
    return document.getElementById('notification-container');
  }
  
  createNotification(message, type, options = {}) {
    const id = ++notificationId;
    const autoClose = options.autoClose !== undefined ? options.autoClose : 5000;
    
    // Limite massimo di notifiche visualizzate contemporaneamente
    if (this.notifications.size >= this.maxNotifications) {
      // Rimuovi la notifica più vecchia
      const oldest = Math.min(...this.notifications.keys());
      this.dismiss(oldest);
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">${message}</div>
      <div class="notification-close">×</div>
      ${autoClose ? `
        <div class="notification-progress">
          <div class="notification-progress-bar"></div>
        </div>
      ` : ''}
    `;
    
    this.getContainer().appendChild(notification);
    
    // Animazione di entrata
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // Gestione chiusura manuale
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => this.dismiss(id));
    
    // Auto-chiusura se specificato
    let timeout;
    if (autoClose) {
      const progressBar = notification.querySelector('.notification-progress-bar');
      progressBar.style.transition = `width ${autoClose}ms linear`;
      
      // Avvia l'animazione della barra di progresso
      setTimeout(() => {
        progressBar.style.width = '0%';
      }, 10);
      
      timeout = setTimeout(() => {
        this.dismiss(id);
      }, autoClose);
    }
    
    // Salva riferimento alla notifica
    this.notifications.set(id, { element: notification, timeout });
    
    return id;
  }
  
  dismiss(id) {
    const notification = this.notifications.get(id);
    
    if (notification) {
      // Cancella il timeout se esiste
      if (notification.timeout) {
        clearTimeout(notification.timeout);
      }
      
      // Animazione di uscita
      notification.element.classList.remove('show');
      
      // Rimuovi elemento dopo l'animazione
      setTimeout(() => {
        if (notification.element.parentNode) {
          notification.element.parentNode.removeChild(notification.element);
        }
        this.notifications.delete(id);
      }, 300);
    }
  }
  
  success(message, options = {}) {
    return this.createNotification(message, 'success', options);
  }
  
  error(message, options = {}) {
    return this.createNotification(message, 'error', options);
  }
  
  info(message, options = {}) {
    return this.createNotification(message, 'info', options);
  }
  
  warning(message, options = {}) {
    return this.createNotification(message, 'warning', options);
  }
}

// Esporta una singola istanza del manager
export const toast = new NotificationManager();

/**
 * Funzione semplificata per mostrare notifiche
 * @param {Object} options - Opzioni della notifica
 * @param {string} options.type - Tipo di notifica (success, error, info, warning)
 * @param {string} options.message - Messaggio da mostrare
 * @param {number} [options.autoClose] - Durata in ms prima della chiusura automatica
 * @returns {number} ID della notifica
 */
export const showNotification = (options) => {
  const { type = 'info', message, autoClose = 5000 } = options;
  
  switch (type) {
    case 'success':
      toast.success(message, { autoClose });
      break;
    case 'error':
      toast.error(message, { autoClose });
      break;
    case 'warning':
      toast.warning(message, { autoClose });
      break;
    case 'info':
    default:
      toast.info(message, { autoClose });
      break;
  }
};
