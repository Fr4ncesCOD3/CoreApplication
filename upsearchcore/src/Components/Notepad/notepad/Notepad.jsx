import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import { useParams, useNavigate } from 'react-router-dom';
import { noteApi, wakeUpServer, getCachedNotes } from '../../../utils/api';
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
  
  useEffect(() => {
    // Verifica che l'utente sia autenticato
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (!token || !userStr) {
      showNotification({
        type: 'warning',
        message: 'Sessione non valida. Effettua il login per continuare.'
      });
      setTimeout(() => navigate('/login'), 500);
      return;
    }

    try {
      const userData = JSON.parse(userStr);
      if (!userData || !userData.id) {
        throw new Error('Dati utente non validi');
      }
      
      setIsLoading(true);
      
      // Carica le note dell'utente
      loadNotes().then(() => {
        // Se siamo all'endpoint /note/ senza ID, ma abbiamo note, reindirizza alla prima nota
        if (!id && notes.length > 0) {
          navigate(`/note/${notes[0].id}`);
        }
      }).catch(error => {
        console.error('Errore nel caricamento iniziale:', error);
      }).finally(() => {
        setIsLoading(false);
      });
    } catch (error) {
      console.error('Errore durante il caricamento del componente Notepad:', error);
      showNotification({
        type: 'error',
        message: 'Errore nei dati utente. Effettua il login per continuare.'
      });
      setTimeout(() => navigate('/login'), 500);
    }
  }, []);
  
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
  
  // Carica note dal server
  const loadNotes = async () => {
    if (!user.id) {
      console.log('Utente non autenticato, impossibile caricare le note');
      return;
    }
    
    setConnectionState(prev => ({ ...prev, status: 'connecting' }));
    
    try {
      console.log('Tentativo di caricamento note per utente:', user.id);
      
      // Verifica token
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Token di autenticazione mancante');
      }
      
      // Carica note dalla cache prima di fare la richiesta
      const cachedData = getCachedNotes();
      if (cachedData && cachedData.length > 0) {
        console.log('Note caricate dalla cache locale:', cachedData.length);
        setNotes(cachedData);
        sortNotes(cachedData);
      }
      
      // Richiedi note aggiornate dal server
      const response = await noteApi.getNotes();
      console.log('Note caricate con successo:', response.length);
      
      const sortedNotes = sortNotes(response);
      setNotes(sortedNotes);
      setConnectionState(prev => ({ ...prev, status: 'online' }));
      
      // Se ci sono note e nessuna è attualmente selezionata, seleziona la prima
      if (sortedNotes.length > 0 && !activeNote) {
        setActiveNote(sortedNotes[0]);
        navigate(`/note/${sortedNotes[0].id}`);
      }
      
      return sortedNotes;
    } catch (error) {
      console.error('Errore durante il caricamento delle note:', error);
      
      // Gestione errore timeout
      if (error.code === 'ECONNABORTED') {
        setConnectionState(prev => ({ ...prev, status: 'offline', lastError: 'timeout' }));
        toast.error('Impossibile caricare le note dal server. Usando la versione locale.', {
          autoClose: 5000
        });
        
        // Carica note dalla cache se non già fatto
        const cachedData = getCachedNotes();
        if (cachedData && cachedData.length > 0) {
          console.log('Note caricate dalla cache locale:', cachedData.length);
          setNotes(cachedData);
          sortNotes(cachedData);
          
          // Se ci sono note e nessuna è attualmente selezionata, seleziona la prima
          if (cachedData.length > 0 && !activeNote) {
            setActiveNote(cachedData[0]);
            navigate(`/note/${cachedData[0].id}`);
          }
        }
      } else {
        setConnectionState(prev => ({ ...prev, status: 'error', lastError: error.message }));
      }
      
      throw error;
    }
  };

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

  const createNote = useCallback(async (parentId = null) => {
    try {
      setIsLoading(true);
      
      const newNote = {
        title: 'Nuova nota',
        content: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parent: parentId,
        userId: user.id,
        tags: []
      };
      
      let createdNote;
      try {
        createdNote = await noteApi.createNote(newNote);
        console.log('Nota creata con successo:', createdNote);
      } catch (error) {
        console.error('Errore nella creazione della nota:', error);
        
        if (error.code === 'ECONNABORTED') {
          createdNote = {
            ...newNote,
            id: 'temp-' + Date.now(),
            temporary: true
          };
          
          toast.warning('Creata nota temporanea. Sarà sincronizzata quando il server sarà disponibile.');
        } else {
          throw error;
        }
      }
      
      // Aggiorna lo stato con la nuova nota
      setNotes(prev => [...prev, createdNote]);
      setActiveNote(createdNote);
      
      // Importante: aggiorna l'URL con l'ID della nuova nota
      navigate(`/note/${createdNote.id}`);
      
      // Aggiorna la cache locale
      const cachedNotes = getCachedNotes() || [];
      localStorage.setItem('cachedNotes', JSON.stringify([...cachedNotes, createdNote]));
      
      setIsLoading(false);
      toast.success('Nota creata con successo');
      return createdNote;
    } catch (error) {
      console.error('Errore nella creazione della nota:', error);
      toast.error('Impossibile creare la nota. Riprova più tardi.');
      setIsLoading(false);
      return null;
    }
  }, [navigate, user.id]);

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

  const handleSaveNote = useCallback(async (noteId) => {
    if (!noteId || isSaving) return;
    
    setIsSaving(true);
    try {
      // Aggiorna solo il campo updatedAt per indicare che la nota è stata salvata
      const note = notes.find(n => n.id === noteId);
      if (note) {
        await updateNote(noteId, { 
          content: activeNote.content,
          updatedAt: new Date().toISOString() 
        });
        setLastSyncTime(new Date());
        setContentChanged(false); // Resetta lo stato delle modifiche
        toast.success('Nota salvata con successo');
      }
    } catch (error) {
      console.error('Errore durante il salvataggio automatico:', error);
      toast.error('Errore durante il salvataggio della nota');
    } finally {
      setIsSaving(false);
    }
  }, [notes, isSaving, updateNote, activeNote]);

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

  const handleContentChange = useCallback((content) => {
    if (activeNote) {
      setActiveNote(prev => ({ ...prev, content }));
      setContentChanged(true); // Imposta lo stato delle modifiche a true
    }
  }, [activeNote]);

  const handleTitleChange = useCallback((title) => {
    if (activeNote) {
      setActiveNote(prev => ({ ...prev, title }));
      updateNote(activeNote.id, { title });
    }
  }, [activeNote, updateNote]);

  // Controlla lo stato della connessione
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      checkServerConnection();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setServerStatus('offline');
    };
    
    const checkServerConnection = async () => {
      try {
        // Assumi che il server sia online per evitare errori CORS continui
        // Durante lo sviluppo locale
        if (window.location.hostname === 'localhost') {
          setServerStatus('online');
          return;
        }
        
        setServerStatus('checking');
        // Usa l'API che è già configurata per CORS
        await noteApi.getNotes();
        setServerStatus('online');
      } catch (error) {
        console.warn('Errore nella connessione al server:', error);
        setServerStatus('connecting');
        // Riprova dopo 30 secondi (intervallo più lungo per ridurre errori)
        setTimeout(checkServerConnection, 30000);
      }
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Controlla lo stato iniziale
    checkServerConnection();
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Aggiungi questa funzione per gestire il passaggio tra note
  const handleNoteSelection = useCallback((id) => {
    // Se c'è una modifica non salvata nella nota corrente, chiedi conferma
    if (activeNote && contentChanged) {
      if (!window.confirm('Ci sono modifiche non salvate. Vuoi salvare prima di cambiare nota?')) {
        // Se l'utente non vuole salvare, procedi al cambio nota
        loadSelectedNote(id);
        return;
      } else {
        // Salva la nota corrente prima di cambiare
        handleSaveNote(activeNote.id).then(() => {
          loadSelectedNote(id);
        });
        return;
      }
    }
    
    // Non ci sono modifiche, carica direttamente la nuova nota
    loadSelectedNote(id);
  }, [activeNote, contentChanged]);

  // Funzione per caricare la nota selezionata
  const loadSelectedNote = (id) => {
    const note = notes.find(n => n.id === id);
    if (note) {
      console.log('Caricamento nota:', note.title);
      setActiveNote(note);
      setIsLoading(false);
      navigate(`/note/${id}`);
    } else {
      toast.error('Nota non trovata');
    }
  };

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
  
  return (
    <div className="notepad-container">
      <div className="notepad-wrapper d-flex">
        <Sidebar 
          notes={searchQuery ? (searchResults || []) : notes}
          notesFromProps={searchResults || []}
          activeNoteId={activeNote?.id}
          setActiveNoteId={handleActiveNoteChange}
          createNote={createNote}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          theme={theme}
          toggleTheme={toggleTheme}
          moveNote={moveNote}
          closeSidebar={closeSidebar || (() => {})}
          isOpen={isSidebarOpen}
        />
        
        <div className={`main-content flex-grow-1 d-flex flex-column ${isSidebarOpen ? 'sidebar-open' : ''}`}>
          {connectionState.status === 'connecting' && (
            <div className="connection-banner">
              <Spinner animation="border" size="sm" /> Connessione al server...
      </div>
          )}
          
          {connectionState.status === 'offline' && (
            <div className="connection-banner offline">
              <FiWifi style={{ color: 'red' }} /> Modalità offline
            </div>
          )}
          
          {activeNote ? (
            <>
              <Toolbar
                note={activeNote}
                updateNote={updateNote}
                deleteNote={deleteNote}
                addTag={addTag}
                removeTag={removeTag}
                createNote={createNote}
                onSave={() => handleSaveNote(activeNote.id)}
                toggleSidebar={toggleSidebar}
                lastSyncTime={lastSyncTime}
                isOffline={connectionState.status !== 'online'}
                contentChanged={contentChanged}
              />
              <div className="editor-wrapper flex-grow-1">
                <Editor
                  onContentChange={handleContentChange}
                  initialContent={activeNote.content || ''}
                  activeNote={activeNote}
                  onTitleChange={handleTitleChange}
                  onContentStatusChange={setContentChanged}
                />
      </div>
            </>
          ) : (
            <div className="no-note-selected d-flex flex-column align-items-center justify-content-center h-100">
              <h3>Seleziona una nota o creane una nuova</h3>
              <Button 
                variant="primary" 
                className="mt-3" 
                onClick={() => createNote()}
              >
                <FiPlus className="me-2" /> Nuova Nota
              </Button>
    </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Notepad;