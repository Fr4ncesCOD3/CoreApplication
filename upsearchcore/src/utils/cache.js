/**
 * Sistema di cache per il supporto offline e gestione bozze
 */
export class CacheService {
  static CACHE_PREFIX = 'upsearch_cache_';
  static NOTE_CACHE_KEY = `${CacheService.CACHE_PREFIX}notes`;
  static USER_CACHE_KEY = `${CacheService.CACHE_PREFIX}user`;
  static CSRF_TOKEN_KEY = `${CacheService.CACHE_PREFIX}csrf_token`;
  static DRAFT_PREFIX = 'draft_';
  static LAST_ACTIVE_NOTE_KEY = `${CacheService.CACHE_PREFIX}last_active_note`;
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
   * Salva una bozza di contenuto nota in sessionStorage
   * @param {string} noteId - ID della nota
   * @param {string} content - Contenuto da salvare
   * @param {string} title - Titolo della nota (opzionale)
   * @returns {boolean} - true se il salvataggio è avvenuto con successo
   */
  static saveDraft(noteId, content, title = null) {
    if (!noteId) {
      console.warn('Tentativo di salvare bozza senza ID nota');
      return false;
    }
    
    // Se il contenuto è vuoto o non è una stringa, non salvare
    if (!content || typeof content !== 'string') {
      console.warn(`Contenuto non valido per la bozza della nota ${noteId}`);
      return false;
    }
    
    try {
      // Verifica se esiste già una bozza più recente per evitare sovrascritture
      const existingDraft = CacheService.getDraft(noteId);
      if (existingDraft) {
        const now = Date.now();
        const draftAge = now - existingDraft.timestamp;
        
        // Se la bozza esistente è più recente di 5 secondi, confronta i contenuti
        if (draftAge < 5000 && existingDraft.content === content) {
          console.log(`Bozza nota ${noteId} invariata, salvataggio ignorato`);
          return true; // Consideriamo un successo poiché il contenuto è già salvato
        }
      }
      
      // Sanifica il contenuto HTML prima di salvarlo
      const sanitizedContent = CacheService.sanitizeHtml(content);
      
      const draftData = {
        content: sanitizedContent,
        timestamp: Date.now()
      };
      
      if (title) {
        draftData.title = title;
      }
      
      // Salva la bozza
      sessionStorage.setItem(`${CacheService.DRAFT_PREFIX}${noteId}`, JSON.stringify(draftData));
      
      // Verifica che il salvataggio sia avvenuto correttamente
      const savedDraft = sessionStorage.getItem(`${CacheService.DRAFT_PREFIX}${noteId}`);
      if (!savedDraft) {
        console.error(`Errore nella verifica della bozza salvata per nota ${noteId}`);
        return false;
      }
      
      console.log(`Bozza salvata per nota ${noteId} alle ${new Date().toLocaleTimeString()}`);
      return true;
    } catch (error) {
      console.error('Errore nel salvataggio della bozza:', error);
      return false;
    }
  }
  
  /**
   * Sanitizza l'HTML per prevenire attacchi XSS e problemi di formattazione
   * @param {string} html - HTML da sanitizzare
   * @returns {string} - HTML sanitizzato
   */
  static sanitizeHtml(html) {
    if (!html) return '';
    
    try {
      // Limita dimensione massima per evitare problemi di memoria o carico
      if (html.length > 2000000) { // 2MB
        console.warn('HTML troppo grande, viene troncato per evitare problemi di performance');
        html = html.substring(0, 2000000);
      }
      
      // Verifica se il contenuto contiene già entità HTML ripetute
      // come &amp;lt; che indica un doppio escape
      if (html.includes('&amp;') || html.includes('&lt;') || 
          html.includes('&gt;') || html.includes('&quot;')) {
        console.warn('Rilevato potenziale escape multiplo, tentativo di correzione');
        // Prova a decodificare una volta per livello
        let decodedHtml = html;
        let previousHtml = '';
        let iterazioni = 0;
        
        // Tenta di riparare l'HTML con escape multipli (max 5 iterazioni)
        while (decodedHtml !== previousHtml && iterazioni < 5) {
          previousHtml = decodedHtml;
          iterazioni++;
          
          decodedHtml = decodedHtml
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x2F;/g, '/')
            .replace(/&#x60;/g, '`')
            .replace(/&#x3D;/g, '=');
        }
        
        console.log(`Correzione HTML completata dopo ${iterazioni} iterazioni`);
        html = decodedHtml;
      }
      
      // Rimuovi tutti i tag script
      html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      
      // Rimuovi attributi pericolosi
      html = html.replace(/\s(on\w+|onerror|formaction|xlink:href|href="javascript:|data-\w+)="[^"]*"/gi, ' ');
      
      // Rimuovi commenti HTML che potrebbero nascondere codice malevolo
      html = html.replace(/<!--[\s\S]*?-->/g, '');
      
      // Gestione iframe in modo più sicuro
      html = html.replace(/<iframe\b[^>]*>(.*?)<\/iframe>/gi, (match) => {
        // Consenti solo iframe da domini sicuri
        if (match.includes('youtube.com') || 
            match.includes('vimeo.com') || 
            match.includes('maps.google.com')) {
          return match;
        }
        return ''; // Rimuovi iframe da fonti non verificate
      });
      
      // Gestione dei tag vuoti o incompleti
      html = html.replace(/<([a-z][a-z0-9]*)[^>]*?\/\s*>/gi, '<$1></$1>');
      
      return html;
    } catch (error) {
      console.error('Errore durante la sanitizzazione HTML:', error);
      // In caso di errore, ritorna un contenuto sicuro
      return html ? html.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    }
  }
  
  /**
   * Recupera una bozza di nota da sessionStorage
   * @param {string} noteId - ID della nota
   * @returns {Object|null} - Bozza della nota o null se non trovata
   */
  static getDraft(noteId) {
    if (!noteId) return null;
    
    try {
      const draftData = sessionStorage.getItem(`${CacheService.DRAFT_PREFIX}${noteId}`);
      if (!draftData) return null;
      
      return JSON.parse(draftData);
    } catch (error) {
      console.error('Errore nel recupero della bozza:', error);
      return null;
    }
  }
  
  /**
   * Elimina una bozza da sessionStorage
   * @param {string} noteId - ID della nota
   */
  static removeDraft(noteId) {
    if (!noteId) return;
    
    sessionStorage.removeItem(`${CacheService.DRAFT_PREFIX}${noteId}`);
  }
  
  /**
   * Salva il token CSRF nella cache con scadenza breve
   * @param {string} token - Token CSRF
   */
  static saveCsrfToken(token) {
    if (!token) return;
    
    // Utilizza una scadenza più breve per il token CSRF (30 minuti)
    CacheService.saveToCache(CacheService.CSRF_TOKEN_KEY, token, 30 * 60 * 1000);
    
    // Salva anche in localStorage per retrocompatibilità con il resto del codice
    localStorage.setItem('csrfToken', token);
  }
  
  /**
   * Recupera il token CSRF dalla cache
   * @returns {string|null} - Token CSRF o null se non trovato o scaduto
   */
  static getCsrfToken() {
    // Tenta di recuperare dalla nuova cache
    const token = CacheService.getFromCache(CacheService.CSRF_TOKEN_KEY);
    if (token) return token;
    
    // Fallback: usa la chiave in localStorage per retrocompatibilità
    return localStorage.getItem('csrfToken');
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
  
  /**
   * Salva l'ultima nota attiva
   * @param {Object} note - Nota attiva
   */
  static saveLastActiveNote(note) {
    if (!note || !note.id) return;
    
    try {
      localStorage.setItem(CacheService.LAST_ACTIVE_NOTE_KEY, note.id);
    } catch (error) {
      console.error('Errore nel salvataggio dell\'ultima nota attiva:', error);
    }
  }
  
  /**
   * Recupera l'ID dell'ultima nota attiva
   * @returns {string|null} - ID dell'ultima nota attiva
   */
  static getLastActiveNoteId() {
    try {
      return localStorage.getItem(CacheService.LAST_ACTIVE_NOTE_KEY);
    } catch (error) {
      console.error('Errore nel recupero dell\'ultima nota attiva:', error);
      return null;
    }
  }
  
  /**
   * Verifica se una nota ha bozze non salvate
   * @param {string} noteId - ID della nota
   * @returns {boolean} - true se esistono bozze
   */
  static hasDraft(noteId) {
    if (!noteId) return false;
    
    try {
      return !!sessionStorage.getItem(`${CacheService.DRAFT_PREFIX}${noteId}`);
    } catch {
      return false;
    }
  }
  
  /**
   * Verifica se ci sono bozze non salvate per qualunque nota
   * @returns {boolean} - true se esistono bozze non salvate
   */
  static hasAnyDrafts() {
    try {
      // Controlla tutte le chiavi in sessionStorage
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key.startsWith(CacheService.DRAFT_PREFIX)) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Errore nel controllo delle bozze:', error);
      return false;
    }
  }
  
  /**
   * Ottiene tutte le bozze salvate
   * @returns {Array} - Array di oggetti {noteId, draftData}
   */
  static getAllDrafts() {
    try {
      const drafts = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key.startsWith(CacheService.DRAFT_PREFIX)) {
          const noteId = key.substring(CacheService.DRAFT_PREFIX.length);
          const draftData = JSON.parse(sessionStorage.getItem(key));
          drafts.push({ noteId, draftData });
        }
      }
      return drafts;
    } catch (error) {
      console.error('Errore nel recupero delle bozze:', error);
      return [];
    }
  }
  
  /**
   * Salva una bozza con un timeout per evitare troppe operazioni di scrittura
   * @param {string} noteId - ID della nota
   * @param {string} content - Contenuto da salvare
   * @param {object} options - Opzioni aggiuntive
   */
  static saveDraftWithThrottle(noteId, content, options = {}) {
    if (!noteId) return;
    
    // Usa un worker asincrono per non bloccare l'UI
    if (window.draftSaveTimeouts === undefined) {
      window.draftSaveTimeouts = {};
    }
    
    // Cancella il timeout precedente per questo noteId
    if (window.draftSaveTimeouts[noteId]) {
      clearTimeout(window.draftSaveTimeouts[noteId]);
    }
    
    // Imposta un nuovo timeout
    window.draftSaveTimeouts[noteId] = setTimeout(() => {
      CacheService.saveDraft(noteId, content, options.title);
      delete window.draftSaveTimeouts[noteId];
    }, options.delay || 1000); // Throttle di 1 secondo
  }
}
