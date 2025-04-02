/**
 * Sistema di cache per il supporto offline
 */
export class CacheService {
  static CACHE_PREFIX = 'upsearch_cache_';
  static NOTE_CACHE_KEY = `${CacheService.CACHE_PREFIX}notes`;
  static USER_CACHE_KEY = `${CacheService.CACHE_PREFIX}user`;
  static CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 ore in millisecondi
  
  /**
   * Salva dati nella cache
   * @param {string} key - Chiave della cache
   * @param {any} data - Dati da salvare
   * @param {number} expiryTime - Tempo di scadenza in ms (opzionale)
   */
  static saveToCache(key, data, expiryTime = CacheService.CACHE_EXPIRY) {
    const cacheData = {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + expiryTime
    };
    
    localStorage.setItem(key, JSON.stringify(cacheData));
  }
  
  /**
   * Recupera dati dalla cache
   * @param {string} key - Chiave della cache
   * @param {boolean} ignoreExpiry - Se ignorare la scadenza
   * @returns {any|null} - Dati dalla cache o null se non trovati o scaduti
   */
  static getFromCache(key, ignoreExpiry = false) {
    const cachedData = localStorage.getItem(key);
    
    if (!cachedData) return null;
    
    try {
      const parsed = JSON.parse(cachedData);
      
      // Verifica scadenza
      if (!ignoreExpiry && parsed.expiry < Date.now()) {
        localStorage.removeItem(key);
        return null;
      }
      
      return parsed.data;
    } catch (error) {
      console.error('Errore nel parsing dei dati della cache:', error);
      localStorage.removeItem(key);
      return null;
    }
  }
  
  /**
   * Salva le note nella cache
   * @param {Array} notes - Array di note
   */
  static cacheNotes(notes) {
    CacheService.saveToCache(CacheService.NOTE_CACHE_KEY, notes);
  }
  
  /**
   * Recupera le note dalla cache
   * @param {boolean} ignoreExpiry - Se ignorare la scadenza
   * @returns {Array} - Array di note o array vuoto
   */
  static getCachedNotes(ignoreExpiry = false) {
    return CacheService.getFromCache(CacheService.NOTE_CACHE_KEY, ignoreExpiry) || [];
  }
  
  /**
   * Aggiunge o aggiorna una nota nella cache
   * @param {Object} note - Nota da aggiungere/aggiornare
   */
  static updateNoteInCache(note) {
    const notes = CacheService.getCachedNotes(true);
    const index = notes.findIndex(n => n.id === note.id);
    
    if (index >= 0) {
      notes[index] = { ...notes[index], ...note };
    } else {
      notes.push(note);
    }
    
    CacheService.cacheNotes(notes);
  }
  
  /**
   * Rimuove una nota dalla cache
   * @param {string} noteId - ID della nota da rimuovere
   */
  static removeNoteFromCache(noteId) {
    const notes = CacheService.getCachedNotes(true);
    const filteredNotes = notes.filter(note => note.id !== noteId);
    CacheService.cacheNotes(filteredNotes);
  }
  
  /**
   * Ottiene note da cache con filtri
   * @param {Function} filterFn - Funzione di filtraggio (opzionale)
   * @returns {Array} - Array di note filtrate
   */
  static getFilteredNotes(filterFn = null) {
    const notes = CacheService.getCachedNotes(true);
    
    if (!filterFn) return notes;
    
    return notes.filter(filterFn);
  }
  
  /**
   * Controlla se una nota esiste nella cache
   * @param {string} noteId - ID della nota da cercare
   * @returns {boolean} - true se la nota esiste
   */
  static noteExistsInCache(noteId) {
    const notes = CacheService.getCachedNotes(true);
    return notes.some(note => note.id === noteId);
  }
  
  /**
   * Salva l'ultima richiesta API per evitare duplicazioni
   * @param {string} key - Chiave della richiesta
   * @param {number} timestamp - Timestamp della richiesta 
   */
  static saveLastRequest(key, timestamp = Date.now()) {
    const requests = JSON.parse(localStorage.getItem('lastApiRequests') || '{}');
    requests[key] = timestamp;
    localStorage.setItem('lastApiRequests', JSON.stringify(requests));
  }
  
  /**
   * Controlla se una richiesta è stata fatta recentemente
   * @param {string} key - Chiave della richiesta
   * @param {number} throttleTime - Tempo minimo tra richieste (ms)
   * @returns {boolean} - true se la richiesta è recente
   */
  static isRequestRecent(key, throttleTime = 5000) {
    const requests = JSON.parse(localStorage.getItem('lastApiRequests') || '{}');
    const lastTime = requests[key];
    
    if (!lastTime) return false;
    
    return (Date.now() - lastTime) < throttleTime;
  }
}
