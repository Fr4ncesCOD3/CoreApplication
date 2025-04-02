import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import { useParams, useNavigate } from 'react-router-dom';
import { noteApi, wakeUpServer, getCachedNotes, getCsrfToken } from '../../../utils/api';
import { toast, showNotification } from '../../../utils/notification';
import Editor from '../Editor/Editor';
import Sidebar from '../Sidebar/Sidebar';
import Toolbar from '../Toolbar/Toolbar';
import './Notepad.css';
import axios from 'axios';
import { FiPlus } from 'react-icons/fi';
import { Button } from 'react-bootstrap';
import { Spinner } from 'react-bootstrap';
import { FiWifi } from 'react-icons/fi';
import { checkAndRefreshToken } from '../../../utils/auth';
import { pingServer } from '../../../utils/ping';
import { FiMenu } from 'react-icons/fi';
import { CacheService } from '../../../utils/cache';

const Notepad = ({ theme, toggleTheme }) => {
  const [notes, setNotes] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredNotes, setFilteredNotes] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fontSize, setFontSize] = useState(16);
  const [textColor, setTextColor] = useState('#000000');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { id } = useParams();
  const navigate = useNavigate();
  const [saveInterval, setSaveInterval] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverStatus, setServerStatus] = useState('checking');
  const [connectionState, setConnectionState] = useState({
    status: 'unknown', // 'unknown', 'connecting', 'connected', 'error'
    lastSyncAt: null,
    syncAttempts: 0
  });
  const [contentChanged, setContentChanged] = useState(false);
  const autoSaveTimeoutRef = React.useRef(null);
  const [searchResults, setSearchResults] = useState([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [loadingNote, setLoadingNote] = useState(true);
  const [activeNoteId, setActiveNoteId] = useState(null);
  
  // Ottiene l'utente corrente dal localStorage con gestione dell'undefined
  const user = (() => {
    try {
      const userString = localStorage.getItem('user');
      return userString ? JSON.parse(userString) : {};
    } catch (error) {
      console.error('Errore nel parsing dei dati utente:', error);
      return {};
    }
  })();
  
  // IMPORTANTE: Sposta la definizione di createTutorialNote qui, prima del suo utilizzo
  const createTutorialNote = useCallback(async () => {
    // Evita chiamate multiple
    if (window.tutorialCreationInProgress) {
      console.log('Creazione nota tutorial già in corso');
      return null;
    }
    
    window.tutorialCreationInProgress = true;
    
    try {
      // Controlla se esiste già una nota tutorial prima di crearne una nuova
      const existingNotes = await noteApi.getNotes();
      const hasTutorial = existingNotes.some(note => 
        note.isTutorial === true || 
        (note.tags && Array.isArray(note.tags) &&
         note.tags.some(tag => ['tutorial', 'benvenuto'].includes(tag)))
      );
      
      if (hasTutorial) {
        console.log('Nota tutorial già esistente, non creo una nuova');
        window.tutorialCreationInProgress = false;
        return null;
      }
      
      // Crea la nota tutorial con contenuto semplificato
      const tutorialContent = `
      <h1>Benvenuto in Upsearch Notepad!</h1>
      <p>Questa è la tua guida rapida per iniziare a utilizzare Upsearch Notepad.</p>
      <p>Clicca sul pulsante "Nuova Nota" per creare una nuova nota.</p>
      `;
      
      const tutorialData = {
        title: 'Benvenuto in Upsearch Notepad',
        content: tutorialContent,
        tags: ['tutorial'],
        isTutorial: true
      };
      
      const response = await noteApi.createNote(tutorialData);
      
      if (response) {
        console.log('Nota tutorial creata con successo:', response.id);
        setNotes(prev => [response, ...prev]);
        return response;
      }
      
      return null;
    } catch (error) {
      console.error('Errore nella creazione della nota tutorial:', error);
      return null;
    } finally {
      window.tutorialCreationInProgress = false;
    }
  }, []);
  
  // Aggiungi questa funzione per creare note locali quando offline
  const createLocalNote = (data = {}) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNote = {
      id: tempId,
      title: data.title || 'Nuova Nota',
      content: data.content || '',
      temporary: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data
    };
    
    // Aggiorna il riferimento alla nota nelle note
    setNotes(prev => [newNote, ...prev]);
    
    // Imposta la nota come attiva usando setActiveNote invece di setActiveNoteId
    setActiveNote(newNote);
    
    // Salva in localStorage
    const localNotes = JSON.parse(localStorage.getItem('offlineNotes') || '[]');
    localStorage.setItem('offlineNotes', JSON.stringify([...localNotes, newNote]));
    
    return newNote;
  };
  
  // Ottimizza la funzione di caricamento delle note
  const loadNotes = useCallback(async (forceRefresh = false) => {
    // Evita di iniziare un nuovo caricamento se uno è già in corso
    if (window.notesLoadInProgress) {
      console.log('Caricamento note già in corso, ignorando richiesta duplicata');
      return window.cachedNotes || [];
    }
    
    // Non eseguire se abbiamo già note caricate di recente
    if (notes.length > 0 && !forceRefresh) {
      const lastLoadTime = sessionStorage.getItem('lastNotesLoadTime');
      if (lastLoadTime && (Date.now() - parseInt(lastLoadTime)) < 60000) { // 1 minuto
        console.log('Note caricate di recente, utilizzo cache locale');
        return notes;
      }
    }
    
    window.notesLoadInProgress = true;
    setIsLoading(true);
    
    try {
      // Verifica token e autenticazione
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('Utente non autenticato, reindirizzamento al login...');
        navigate('/login');
        return [];
        }
        
        // Carica le note
      const notesData = await noteApi.getNotes(forceRefresh);
        
      // Aggiorna lo stato
        if (notesData) {
          setNotes(notesData);
          setLastSyncTime(new Date());
          setConnectionState(prev => ({ ...prev, status: 'online' }));
          
        // Memorizza il timestamp dell'ultimo caricamento
        sessionStorage.setItem('lastNotesLoadTime', Date.now().toString());
        // Memorizza le note in una variabile globale per evitare richieste ripetute
        window.cachedNotes = notesData;
        
        // Verifica se l'utente ha già utilizzato l'app prima
        // e crea note tutorial solo per i nuovi utenti
        const isFirstTimeUser = !localStorage.getItem('notesLoaded');
        const hasTutorialNotes = notesData.some(note => 
          note.isTutorial === true || 
          (note.tags && Array.isArray(note.tags) &&
           note.tags.some(tag => ['tutorial', 'benvenuto'].includes(tag)))
        );
        
        if (isFirstTimeUser && !hasTutorialNotes && !window.tutorialNotesChecked) {
          // Imposta il flag prima di iniziare la creazione per evitare duplicati
          window.tutorialNotesChecked = true;
          localStorage.setItem('notesLoaded', 'true');
          
          console.log('Primo accesso utente e nessuna nota tutorial, creazione...');
          setTimeout(() => createTutorialNote(), 1000);
        }
        
        return notesData;
      }
      
      return [];
    } catch (error) {
      console.error("Errore nel caricamento delle note:", error);
      
      // Prova a caricare dalla cache in caso di errore
      const cachedNotes = CacheService.getCachedNotes();
      if (cachedNotes.length > 0) {
        console.log('Usando note dalla cache dopo errore di caricamento');
        setNotes(cachedNotes);
        return cachedNotes;
      }
      
      return [];
    } finally {
      window.notesLoadInProgress = false;
      setIsLoading(false);
    }
  }, [navigate, setNotes, setLastSyncTime, setConnectionState, setIsLoading, createTutorialNote]);
  
  useEffect(() => {
    // Evita di ricaricare le note se abbiamo già note
    if (notes.length === 0) {
    loadNotes();
    }
  }, [loadNotes, notes.length]);
  
  useEffect(() => {
    if (id && notes.length > 0) {
      const note = notes.find(note => note.id === id);
      if (note) {
        setActiveNote(note);
      } else if (notes.length > 0) {
        // Se l'ID nella URL non esiste, reindirizza alla prima nota
        navigate(`/note/${notes[0].id}`);
      }
    } else if (notes.length > 0 && !activeNote) {
      // Se non c'è un ID e non c'è una nota attiva, seleziona la prima nota
      setActiveNote(notes[0]);
      navigate(`/note/${notes[0].id}`);
    }
  }, [id, notes, navigate]);

    const handleResize = () => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
    }
  };

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Aggiungi questa funzione per chiudere la sidebar
  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);
  
  // Aggiungi anche questa funzione per il toggleSidebar se non esiste già
  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);
  
  // Aggiungi questa funzione per ordinare le note (mancante)
  const sortNotes = useCallback((notesToSort) => {
    if (!notesToSort || notesToSort.length === 0) return notesToSort;
    
    // Ordina le note per data di aggiornamento (dalla più recente)
    return [...notesToSort].sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt);
      const dateB = new Date(b.updatedAt || b.createdAt);
      return dateB - dateA;
    });
  }, []);
  
  // Funzione per verificare se le note tutorial sono presenti
  const checkTutorialNotes = (notes) => {
    if (!notes || notes.length === 0) return false;
    
    // Verifica se esistono note con tag 'tutorial' o con isTutorial=true
    const tutorialNotes = notes.filter(note => 
      note.isTutorial === true || 
      (note.tags && note.tags.includes('tutorial'))
    );
    
    // Considera che le note tutorial esistono se ce ne sono almeno 2
    return tutorialNotes.length >= 2;
  };

  // Modifica useEffect per loadNotes
  useEffect(() => {
    const loadNotesAndInit = async () => {
      try {
        if (notes.length > 0) return; // Evita caricamenti multipli
        
        setIsLoading(true);
        await loadNotes();
        
        // Controlla se è la prima volta che l'utente usa l'app
        const isFirstTimeUser = !localStorage.getItem('notesLoaded');
        if (isFirstTimeUser) {
          localStorage.setItem('notesLoaded', 'true');
          // Ritarda la creazione della nota tutorial per evitare race conditions
          setTimeout(() => loadNotes(), 1000);
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    loadNotesAndInit();
  }, [loadNotes, notes.length]);

  // Aggiungi un listener per gli aggiornamenti delle note dal background
  useEffect(() => {
    const handleNotesUpdated = (event) => {
      console.log('Note aggiornate dal background:', event.detail.length);
      if (event.detail) {
        // Aggiorna le note ma mantieni la nota attiva
        setNotes(event.detail);
        
        // Aggiorna la nota attiva se esiste tra le nuove note
        if (activeNote) {
          const updatedActiveNote = event.detail.find(note => note.id === activeNote.id);
          if (updatedActiveNote) {
            setActiveNote(updatedActiveNote);
          }
        }
        
        setFilteredNotes(event.detail);
        setLastSyncTime(new Date());
      }
    };
    
    window.addEventListener('notesUpdated', handleNotesUpdated);
    
    return () => {
      window.removeEventListener('notesUpdated', handleNotesUpdated);
    };
  }, [activeNote]);

  // Sposto syncPendingChanges all'inizio, prima di createNote
  // Definisco un riferimento alle funzioni che verranno definite dopo
  const syncPendingChanges = useCallback(async () => {
    if (pendingChanges.length === 0) return;
    
    toast.info(`Sincronizzazione di ${pendingChanges.length} modifiche pendenti...`);
    
    // Crea una copia per evitare modifiche durante l'iterazione
    const changes = [...pendingChanges];
    
    // Resetta pendingChanges prima di iniziare (per evitare duplicati)
    setPendingChanges([]);
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const change of changes) {
      try {
        // Esegui la chiamata API appropriata in base al tipo di modifica
        if (change.type === 'update' && updateNote) {
          await updateNote(change.id, change.data);
        } 
        else if (change.type === 'create') {
          // Chiamiamo direttamente l'API invece di usare createNote per evitare dipendenze circolari
          if (change.data) {
            const response = await noteApi.createNote(change.data);
            if (response) {
              setNotes(prev => [response, ...prev]);
            }
          }
        }
        else if (change.type === 'delete' && deleteNote) {
          await deleteNote(change.id);
        }
        successCount++;
      } catch (error) {
        console.error(`Errore sincronizzando modifica ${change.type} per id ${change.id}:`, error);
        failureCount++;
        // Riaggiungi alla coda le modifiche fallite
        setPendingChanges(prev => [...prev, change]);
      }
    }
    
    if (successCount > 0) {
      toast.success(`Sincronizzate con successo ${successCount} modifiche`);
    }
    
    if (failureCount > 0) {
      toast.warning(`Non è stato possibile sincronizzare ${failureCount} modifiche. Verranno ritentate automaticamente.`);
    }
  }, [pendingChanges, setPendingChanges, setNotes]);

  // Rimuovo le occorrenze di syncPendingChanges nell'useEffect che monitora la connessione
  useEffect(() => {
    const handleConnectionChange = () => {
      const isCurrentlyOffline = !navigator.onLine;
      setIsOffline(isCurrentlyOffline);
      
      if (!isCurrentlyOffline && pendingChanges.length > 0) {
        // Invece di chiamare syncPendingChanges direttamente, impostiamo un flag
        // o usiamo un dispatch di un evento personalizzato
        window.dispatchEvent(new CustomEvent('connection-restored'));
      }
    };
    
    const handleConnectionRestored = () => {
      if (pendingChanges.length > 0) {
        syncPendingChanges();
      }
    };
    
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
    window.addEventListener('connection-restored', handleConnectionRestored);
    
    return () => {
      window.removeEventListener('online', handleConnectionChange);
      window.removeEventListener('offline', handleConnectionChange);
      window.removeEventListener('connection-restored', handleConnectionRestored);
    };
  }, [pendingChanges, syncPendingChanges]);

  const createNote = useCallback(async (parentId = null) => {
    setIsLoading(true);
    
    try {
      // Verifica che il token CSRF sia presente
      const csrfToken = localStorage.getItem('csrfToken');
      if (!csrfToken) {
        try {
          console.log('Nessun token CSRF trovato, richiesta nuovo token...');
          await getCsrfToken(true);
        } catch (error) {
          console.warn('Errore nel recupero del token CSRF:', error);
        }
      }
      
      // Prepara i dati della nota
      const noteData = {
        title: 'Nuova Nota',
        content: '<p>Inizia a scrivere qui...</p>',
        parentId: parentId
      };
      
      // Se siamo offline, crea una nota locale
      if (!navigator.onLine) {
        console.log('Creazione nota in modalità offline...');
        const localNote = createLocalNote(noteData);
        
        // Salva nella lista delle modifiche pendenti
        const pendingCreates = JSON.parse(localStorage.getItem('pendingCreates') || '[]');
        pendingCreates.push({
          type: 'create',
          data: noteData,
          tempId: localNote.id,
          timestamp: Date.now()
        });
        localStorage.setItem('pendingCreates', JSON.stringify(pendingCreates));
        
        setIsLoading(false);
        
        // Rende attiva la nuova nota
        setActiveNote(localNote);
        navigate(`/note/${localNote.id}`);
        
        return localNote;
      }
      
      // Se siamo online, crea la nota sul server
      console.log('Creazione nota sul server con dati:', noteData);
      const response = await noteApi.createNote(noteData);
      
      // Se abbiamo ottenuto una risposta valida dal server
      if (response && response.id) {
        console.log('Nota creata con successo sul server, ID:', response.id);
        
        // Aggiungi la nuova nota all'array di note
        setNotes(prevNotes => [response, ...prevNotes]);
        
        // Imposta la nuova nota come attiva
        setActiveNote(response);
        
        // Naviga alla nuova nota
        navigate(`/note/${response.id}`);
        
        return response;
      } else {
        console.warn('Risposta server non valida:', response);
        throw new Error('Risposta server non valida');
      }
    } catch (error) {
      console.error('Errore nella creazione della nota:', error);
      
      // Se c'è un errore di rete, crea comunque una nota locale
      if (!navigator.onLine || error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
        console.log('Fallback: creazione nota locale dopo errore di rete');
        
        const localNote = createLocalNote({
          title: 'Nuova Nota',
          content: '<p>Inizia a scrivere qui...</p>',
          parentId: parentId
        });
        
        setActiveNote(localNote);
        navigate(`/note/${localNote.id}`);
        
        return localNote;
      }
      
      toast.error('Errore nella creazione della nota');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [navigate, setNotes, setActiveNote, setIsLoading]);

  const updateNote = useCallback(async (id, updates) => {
    try {
      const updatedNote = await noteApi.updateNote(id, {
        ...updates,
      updatedAt: new Date().toISOString()
      });
      
      setNotes(prev => prev.map(note => 
        note.id === id ? { ...note, ...updatedNote } : note
      ));
      
      if (activeNote && activeNote.id === id) {
        setActiveNote(prev => ({ ...prev, ...updatedNote }));
      }
      
      return updatedNote;
    } catch (error) {
      console.error('Errore nell\'aggiornamento della nota:', error);
      toast.error('Impossibile aggiornare la nota. Riprova più tardi.');
      return null;
    }
  }, [activeNote]);

  const deleteNote = useCallback(async (id) => {
    if (!window.confirm('Sei sicuro di voler eliminare questa nota?')) {
      return false;
    }
    
    try {
      // Prima, elimina eventuali note figlie in modo ricorsivo
      deleteChildren(id);
      
      // Quindi elimina la nota selezionata
      await noteApi.deleteNote(id);
      
      // Aggiorna lo stato delle note
      const updatedNotes = notes.filter(note => note.id !== id);
      setNotes(updatedNotes);
      
      // Se la nota attiva è stata eliminata, seleziona un'altra nota
      if (activeNote && activeNote.id === id) {
        if (updatedNotes.length > 0) {
          navigate(`/note/${updatedNotes[0].id}`);
        } else {
          setActiveNote(null);
          navigate('/');
        }
      }
      
      toast.success('Nota eliminata con successo');
      return true;
    } catch (error) {
      console.error('Errore nell\'eliminazione della nota:', error);
      toast.error('Impossibile eliminare la nota. Riprova più tardi.');
      return false;
    }
  }, [activeNote, notes, navigate]);

  const deleteChildren = useCallback((noteId) => {
    // Trova tutte le note figlie
    const children = notes.filter(note => note.parent === noteId);
    
    // Elimina ricorsivamente le note figlie
    for (const child of children) {
      deleteChildren(child.id);
      noteApi.deleteNote(child.id);
    }
  }, [notes]);

  const handleSaveNote = useCallback(async (noteId, content) => {
    if (!noteId || !activeNote) return;
    
    try {
    setIsSaving(true);
      
      // Utilizza il contenuto passato, altrimenti prende il contenuto corrente dell'activeNote
      let contentToSave = content;
      
      // Se non è stato fornito un contenuto ma esiste una bozza in sessionStorage, usa quella
      if (!contentToSave) {
        try {
          const draftData = sessionStorage.getItem(`draft_${noteId}`);
          if (draftData) {
            const draft = JSON.parse(draftData);
            contentToSave = draft.content;
            // Rimuovi la bozza dopo l'uso
            sessionStorage.removeItem(`draft_${noteId}`);
          } else {
            // Altrimenti usa il contenuto attuale della nota
            contentToSave = activeNote.content;
          }
        } catch (error) {
          console.error('Errore nel recupero della bozza:', error);
          contentToSave = activeNote.content;
        }
      }
      
      // Salva la nota sul server
      const updatedNote = await updateNote(noteId, { 
        content: contentToSave,
        updatedAt: new Date().toISOString() 
      });
      
      if (updatedNote) {
        setLastSyncTime(new Date());
        setContentChanged(false); // Resetta lo stato delle modifiche
        
        // Aggiorna la nota nella lista locale
        setNotes(prevNotes => prevNotes.map(n => 
          n.id === noteId ? { ...n, ...updatedNote } : n
        ));
        
        // Aggiorna la nota attiva
        setActiveNote(prev => ({ ...prev, ...updatedNote }));
        
        return updatedNote;
      }
    } catch (error) {
      console.error('Errore durante il salvataggio:', error);
      
      // Se siamo offline, salva localmente
      if (!navigator.onLine) {
        toast.warning('Modalità offline. Le modifiche saranno sincronizzate quando tornerai online.');
      } else {
        toast.error('Errore durante il salvataggio della nota. Riprova più tardi.');
      }
      
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [notes, isSaving, updateNote, activeNote, setNotes]);

  const moveNote = useCallback(async (noteId, newParentId) => {
    // Verifica che il nuovo parent non sia un discendente della nota
    if (newParentId) {
      // Controlla se il nuovo parent è un discendente della nota da spostare
      if (isDescendant(noteId, newParentId)) {
        toast.error('Non puoi spostare una nota in una sua sotto-nota');
        return false;
      }
    }
    
    try {
      const updatedNote = await noteApi.updateNote(noteId, { parent: newParentId });
      
      setNotes(prev => prev.map(note => 
        note.id === noteId ? { ...note, parent: newParentId } : note
      ));
      
      toast.success('Nota spostata con successo');
      return updatedNote;
    } catch (error) {
      console.error('Errore nello spostamento della nota:', error);
      toast.error('Impossibile spostare la nota. Riprova più tardi.');
      return null;
    }
  }, []);

  const isDescendant = useCallback((parentId, childId) => {
    // Funzione ricorsiva per controllare se childId è un discendente di parentId
    if (parentId === childId) return true;
    
    const children = notes.filter(note => note.parent === parentId);
    
    for (const child of children) {
      if (isDescendant(child.id, childId)) {
        return true;
      }
    }
    
    return false;
  }, [notes]);

  const addTag = useCallback(async (noteId, tag) => {
    try {
      const note = notes.find(n => n.id === noteId);
      
      if (!note) {
        throw new Error('Nota non trovata');
      }
      
      const tags = note.tags || [];
      if (tags.includes(tag)) {
        return note; // Il tag esiste già
      }
      
      const updatedTags = [...tags, tag];
      const updatedNote = await updateNote(noteId, { tags: updatedTags });
      
      toast.success(`Tag "${tag}" aggiunto`);
      return updatedNote;
    } catch (error) {
      console.error('Errore nell\'aggiunta del tag:', error);
      toast.error('Impossibile aggiungere il tag. Riprova più tardi.');
      return null;
    }
  }, [notes, updateNote]);

  const removeTag = useCallback(async (noteId, tag) => {
    try {
      const note = notes.find(n => n.id === noteId);
      
      if (!note) {
        throw new Error('Nota non trovata');
      }
      
      const tags = note.tags || [];
      const updatedTags = tags.filter(t => t !== tag);
      const updatedNote = await updateNote(noteId, { tags: updatedTags });
      
      toast.success(`Tag "${tag}" rimosso`);
      return updatedNote;
    } catch (error) {
      console.error('Errore nella rimozione del tag:', error);
      toast.error('Impossibile rimuovere il tag. Riprova più tardi.');
      return null;
    }
  }, [notes, updateNote]);

  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    const lowerCaseQuery = query.toLowerCase();
    const results = notes.filter(note => 
      note.title?.toLowerCase().includes(lowerCaseQuery) ||
      (note.content && typeof note.content === 'string' && note.content.toLowerCase().includes(lowerCaseQuery))
    );
    
    setSearchResults(results);
    console.log(`Trovate ${results.length} note per la ricerca: ${query}`);
  }, [notes]);

  useEffect(() => {
    if (searchQuery) {
      handleSearch(searchQuery);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, handleSearch]);

  // Funzione per gestire i cambiamenti di contenuto dell'editor
  const handleContentChange = useCallback((content) => {
    // Se il parametro è un booleano, significa che stiamo aggiornando lo stato di contentChanged
    if (typeof content === 'boolean') {
      setContentChanged(content);
      return;
    }
    
    // Evita aggiornamenti non necessari
    if (activeNote && activeNote.content === content) return;
    
    setActiveNote(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        content,
        updatedAt: new Date().toISOString()
      };
    });
    
    // Imposta lo stato che indica che ci sono modifiche non salvate
    setContentChanged(true);
  }, [activeNote]);

  // Funzione per gestire il cambio di titolo
  const handleTitleChange = useCallback((title) => {
    if (activeNote && activeNote.title !== title) {
      setActiveNote(prev => ({
        ...prev,
        title,
        updatedAt: new Date().toISOString()
      }));
      
      // Aggiorna le note visualizzate nella sidebar con il nuovo titolo
      setNotes(prevNotes => prevNotes.map(note => 
        note.id === activeNote.id 
          ? { ...note, title, updatedAt: new Date().toISOString() } 
          : note
      ));
      
      setContentChanged(true);
    }
  }, [activeNote, setNotes]);

  // Controlla lo stato della connessione
  useEffect(() => {
    // Verifica connessione e mostra indicatore appropriato
    const handleConnectionChange = () => {
      const isOnline = navigator.onLine;
      setIsOnline(isOnline);
      
      if (isOnline) {
        // Se torniamo online, sincronizziamo i dati
        toast.success('Connessione ripristinata. Sincronizzazione in corso...');
        loadNotes().catch(err => {
          console.error('Errore durante la sincronizzazione:', err);
        });
      } else {
        toast.warning('Connessione offline. Utilizzo dati locali.');
        setConnectionState(prev => ({ ...prev, status: 'offline' }));
      }
    };
    
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
    
    // Controlla lo stato attuale
    handleConnectionChange();
    
    return () => {
      window.removeEventListener('online', handleConnectionChange);
      window.removeEventListener('offline', handleConnectionChange);
    };
  }, [loadNotes]);
  
  // Modifica loadSelectedNote per recuperare le modifiche non salvate
  const loadSelectedNote = useCallback((id) => {
    console.log('Caricamento nota:', id);
    const note = notes.find(n => n.id === id);
    
    if (note) {
      console.log('Caricamento nota esistente:', note.title);
      
      // Verifica se ci sono modifiche non salvate in sessionStorage
      try {
        const noteChanges = JSON.parse(sessionStorage.getItem('noteChanges') || '{}');
        const unsavedChanges = noteChanges[id];
        
        if (unsavedChanges && unsavedChanges.content) {
          // Ci sono modifiche non salvate
          const modifiedNote = {
            ...note,
            content: unsavedChanges.content,
            hasUnsavedChanges: true
          };
          
          setActiveNote(modifiedNote);
          setContentChanged(true);
          toast.info('Riprese modifiche non salvate');
      } else {
          // Nessuna modifica non salvata
          setActiveNote(note);
          setContentChanged(false);
        }
      } catch (error) {
        console.error('Errore nel recupero delle modifiche non salvate:', error);
        setActiveNote(note);
        setContentChanged(false);
      }
      
      navigate(`/note/${id}`);
    } else {
      // Resto del codice esistente per caricare la nota dal server
    }
  }, [notes, navigate]);
  
  // Aggiungi questa funzione per gestire il passaggio tra note
  const handleNoteSelect = useCallback(async (noteId) => {
    // Verifica se stiamo già visualizzando questa nota
    if (activeNote && activeNote.id === noteId) return;
    
    // Se ci sono modifiche non salvate, chiedi conferma
    if (contentChanged) {
      const shouldSave = window.confirm('Ci sono modifiche non salvate. Vuoi salvare prima di cambiare nota?');
      if (shouldSave) {
        try {
          await handleSaveNote(activeNote.id);
        } catch (error) {
          console.error('Errore durante il salvataggio:', error);
        }
      }
      // Resetta lo stato delle modifiche
      setContentChanged(false);
    }
    
    // Carica la nota selezionata
    const selectedNote = notes.find(note => note.id === noteId);
    if (selectedNote) {
      setActiveNote(selectedNote);
      navigate(`/note/${noteId}`);
    }
  }, [activeNote, contentChanged, handleSaveNote, notes, navigate]);

  // Aggiungi questa funzione per gestire il cambio di nota attiva
  const handleActiveNoteChange = useCallback((noteId) => {
    const selectedNote = notes.find(note => note.id === noteId);
    
    if (selectedNote) {
      setActiveNote(selectedNote);
      navigate(`/note/${noteId}`);
      console.log(`Nota attiva cambiata: ${selectedNote.title}`);
      
      // Se siamo su mobile, chiudi la sidebar dopo la selezione
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      }
    } else {
      console.warn(`Nota con ID ${noteId} non trovata`);
    }
  }, [notes, navigate]);
  
  // Sostituiscilo con un useEffect che gestisce solo il monitoraggio delle modifiche
  useEffect(() => {
    // Avvisa quando ci sono modifiche non salvate tramite UI
    if (activeNote && contentChanged) {
      // Aggiorna UI per mostrare modifiche non salvate (gestito da contentChanged state)
    }
    
    return () => {
      // Non salvare automaticamente all'uscita
    };
  }, [activeNote, contentChanged]);

  // Funzione per caricare una nota specifica per ID
  const loadNote = async (id) => {
    if (!id) {
      console.log('Nessun ID nota fornito');
      setLoadingNote(false);
      return;
    }
    
    // Se la nota è già caricata, usa quella
    if (activeNote && activeNote.id === id) {
      console.log('Nota già caricata:', id);
      setLoadingNote(false);
      return;
    }
    
    console.log('Caricamento nota:', id);
    setLoadingNote(true);
    
    try {
      // Controlla prima nella cache locale
      const cachedNotes = CacheService.getCachedNotes();
      const cachedNote = cachedNotes.find(note => note.id === id);
      
      if (cachedNote) {
        console.log('Nota trovata nella cache:', id);
        setActiveNote(cachedNote);
        setActiveNoteId(id);
        setLoadingNote(false);
        return;
      }
      
      // Se non è nella cache, recuperala dal server
      const note = await noteApi.getNoteById(id);
      setActiveNote(note);
      setActiveNoteId(id);
      
      // Registra la visita della nota
      const recentNotes = JSON.parse(localStorage.getItem('recentNotes') || '[]');
      if (!recentNotes.includes(id)) {
        recentNotes.unshift(id);
        localStorage.setItem('recentNotes', JSON.stringify(recentNotes.slice(0, 10)));
      }
    } catch (error) {
      console.error('Errore nel caricamento della nota:', error);
      
      // Gestione specifica dell'errore 404
      if (error.response && error.response.status === 404) {
        toast.error('La nota richiesta non è disponibile');
        console.log('Reindirizzamento alla lista delle note');
        navigate('/note/');
        
        // Se siamo offline, potremmo non trovare la nota perché non è nella cache
      if (!navigator.onLine) {
          toast.warning('Sei offline. Alcune note potrebbero non essere disponibili.');
        }
      } else {
        // Gestione di altri errori
        toast.error('Errore nel caricamento della nota. Riprova più tardi.');
        
        // Se siamo offline e la nota non è nella cache
        if (!navigator.onLine) {
          toast.warning('Sei offline e questa nota non è disponibile localmente.');
        }
      }
      
      // Se l'errore è 404, crea una nota vuota invece di visualizzare errore
      if (error.response && error.response.status === 404) {
        console.log('Nota non trovata, creazione nuova nota...');
        const newNote = await createEmptyNote();
        setActiveNote(newNote);
        setActiveNoteId(newNote.id);
        navigate(`/note/${newNote.id}`);
      }
    } finally {
      setLoadingNote(false);
    }
  };

  return (
    <div className="notepad-container">
      {/* Sidebar con gestione dell'apertura/chiusura */}
      <div className={`sidebar-container ${isSidebarOpen ? 'open' : ''}`}>
        <Sidebar 
          notes={notes}
          activeNoteId={activeNote?.id}
          setActiveNoteId={handleNoteSelect}
          createNote={createNote}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          theme={theme}
          toggleTheme={toggleTheme}
          moveNote={moveNote}
          closeSidebar={() => setIsSidebarOpen(false)}
          isOpen={isSidebarOpen}
        />
      </div>
      
      {/* Pulsante per aprire la sidebar su mobile */}
      {!isSidebarOpen && (
        <button className="sidebar-toggle-btn d-md-none" onClick={toggleSidebar}>
          <FiMenu />
        </button>
      )}
      
      {/* Contenitore principale per editor e toolbar */}
      <div className="content-container">
        {/* Toolbar con le funzionalità principali */}
        <div className="toolbar-container">
              <Toolbar
                note={activeNote}
                updateNote={updateNote}
                deleteNote={deleteNote}
                addTag={addTag}
                removeTag={removeTag}
                createNote={createNote}
            onSave={handleSaveNote}
            toggleSidebar={toggleSidebar}
                lastSyncTime={lastSyncTime}
            isOffline={isOffline}
                contentChanged={contentChanged}
                onContentChange={handleContentChange}
              />
        </div>
        
        {/* Area dell'editor */}
        <div className="editor-container">
          {isLoading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Caricamento note in corso...</p>
            </div>
          ) : !activeNote ? (
            <div className="no-note-selected">
              <p>Seleziona una nota dalla barra laterale o crea una nuova nota</p>
              <Button variant="primary" onClick={createNote} className="mt-3">
                <FiPlus className="me-2" />
                Crea Nuova Nota
              </Button>
            </div>
          ) : (
            <div className="editor-wrapper">
                <Editor
                  onContentChange={handleContentChange}
                  initialContent={activeNote.content}
                  activeNote={activeNote}
                  onTitleChange={handleTitleChange}
                  onContentStatusChange={setContentChanged}
                  onSaveContent={handleSaveNote}
                />
    </div>
          )}
        </div>
      </div>
      
      {/* Indicatore di connessione */}
      {connectionState.status === 'connecting' && (
        <div className="connection-status connecting">
          <Spinner animation="border" size="sm" /> 
          Connessione al server...
        </div>
      )}
    </div>
  );
};

export default Notepad;