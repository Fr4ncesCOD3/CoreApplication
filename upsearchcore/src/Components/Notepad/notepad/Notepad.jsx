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
  
  // Funzione per caricare le note, definita con useCallback per poterla utilizzare in più punti
  const loadNotes = useCallback(async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!user.id) {
        navigate('/login');
        return;
      }
      
      setIsLoading(true);
      console.log("Tentativo di caricamento note per utente:", user.id);
      
      // Tenta un massimo di 3 volte con attesa crescente tra i tentativi
      const fetchWithRetry = async (retries = 3) => {
        try {
          const loadedNotes = await noteApi.getNotes();
          console.log("Note caricate con successo:", loadedNotes.length);
          setNotes(loadedNotes);
          setLastSyncTime(new Date());
          setConnectionState(prev => ({ ...prev, status: 'online' }));
          
          // Verifica e crea le note tutorial se necessario
          await checkAndCreateTutorialNotes(loadedNotes);
          
          // Se ci sono note ma nessuna è attiva, imposta la prima come attiva
          if (loadedNotes && loadedNotes.length > 0 && !activeNote) {
            setActiveNote(loadedNotes[0]);
            navigate(`/note/${loadedNotes[0].id}`);
          }
        } catch (error) {
          console.error("Errore nel caricamento delle note:", error);
          
          if (retries > 0) {
            const delay = Math.pow(2, 3 - retries) * 1000; // 1s, 2s, 4s
            console.log(`Ritentativo tra ${delay/1000} secondi...`);
            
            // Mostra un toast solo al primo tentativo
            if (retries === 3) {
              toast.info("Connessione al server in corso...");
            }
            
            setTimeout(() => fetchWithRetry(retries - 1), delay);
          } else {
            toast.error("Impossibile connettersi al server dopo ripetuti tentativi");
            setConnectionState(prev => ({ ...prev, status: 'offline' }));
            
            // Carica le note dalla cache come fallback
            const cachedNotes = getCachedNotes();
            if (cachedNotes && cachedNotes.length > 0) {
              console.log("Note caricate dalla cache locale:", cachedNotes.length);
              setNotes(cachedNotes);
              setLastSyncTime(new Date(parseInt(localStorage.getItem('noteCacheTimestamp') || Date.now())));
            } else {
              // Se non ci sono note in cache, crea una nota tutorial locale
              console.log("Nessuna nota disponibile, creazione di una nota tutorial locale");
              const localTutorialNotes = createLocalTutorialNotes();
              setNotes(localTutorialNotes);
              
              // Impostiamo la prima nota come attiva
              setActiveNote(localTutorialNotes[0]);
              navigate(`/note/${localTutorialNotes[0].id}`);
            }
          }
        }
      };
      
      await fetchWithRetry();
    } catch (error) {
      console.error("Errore generale:", error);
      toast.error("Si è verificato un errore inaspettato");
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);
  
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);
  
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

  // Modifica la funzione per verificare e creare le note tutorial se necessario
  const checkAndCreateTutorialNotes = useCallback(async (loadedNotes) => {
    try {
      // Se l'utente non ha note, crea una nota tutorial
      if (!loadedNotes || loadedNotes.length === 0) {
        console.log("Nessuna nota trovata per l'utente, creazione nota di benvenuto automatica...");
        
        // Crea una nota locale e la mostra subito
        const localNote = createLocalTutorialNote();
        setNotes([localNote]);
        setActiveNote(localNote);
        
        // Tenta di creare la nota sul server in background
        try {
          const welcomeNote = await createTutorialNote();
          if (welcomeNote) {
            console.log("Nota tutorial creata con successo sul server");
            // Sostituisci la nota locale con quella del server
            setNotes([welcomeNote]);
            setActiveNote(welcomeNote);
            navigate(`/note/${welcomeNote.id}`);
            toast.success('Nota di benvenuto creata con successo!');
          }
        } catch (error) {
          console.error("Errore nella creazione della nota tutorial sul server:", error);
          // Teniamo la nota locale, non mostriamo errori all'utente
        }
      } else {
        console.log("L'utente ha già delle note, nessuna nota tutorial necessaria");
      }
    } catch (error) {
      console.error("Errore durante la verifica/creazione delle note tutorial:", error);
    }
  }, [navigate]);

  // Nuova funzione che crea una singola nota tutorial salvata nel database
  const createTutorialNote = async () => {
    try {
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = currentUser?.id;
      
      if (!userId) {
        console.warn('Utente non autenticato, impossibile creare nota tutorial');
        return null;
      }
      
      console.log("Creazione nota tutorial permanente per utente:", userId);
      
      // Creiamo prima una nota base con contenuto minimale
      const welcomeNote = await noteApi.createNote({
        title: "Benvenuto in Upsearch Notepad",
        content: `<h1>Benvenuto in Upsearch Notepad!</h1>
        <p>Caricamento della guida completa in corso...</p>`,
        isTutorial: true,
        userId: userId,
        tags: ["tutorial", "guida"]
      });
      
      // Una volta creata la nota base, aggiorniamo con il contenuto completo
      if (welcomeNote && welcomeNote.id) {
        // Aggiorniamo il contenuto completo in una seconda chiamata
        const updatedNote = await noteApi.updateNote(welcomeNote.id, {
          content: `<h1 style="text-align: center; color: #3498db;">Benvenuto in Upsearch Notepad!</h1>
          <p>Questa guida ti mostrerà come utilizzare tutte le funzionalità dell'editor per rendere le tue note davvero efficaci.</p>
          
          <h2 style="color: #2ecc71;">Formattazione del testo</h2>
          <p>La barra degli strumenti in alto ti permette di formattare il testo in vari modi:</p>
          <ul>
            <li><strong>Grassetto</strong>: Seleziona il testo e clicca sul pulsante B o usa Ctrl+B</li>
            <li><em>Corsivo</em>: Seleziona il testo e clicca sul pulsante I o usa Ctrl+I</li>
            <li><u>Sottolineato</u>: Seleziona il testo e clicca sul pulsante U o usa Ctrl+U</li>
            <li><s>Barrato</s>: Seleziona il testo e clicca sul pulsante S</li>
          </ul>
          
          <h2 style="color: #e74c3c;">Titoli e paragrafi</h2>
          <p>Puoi utilizzare diversi livelli di titoli per organizzare i tuoi contenuti:</p>
          <h3>Questo è un titolo di livello 3</h3>
          <h4>Questo è un titolo di livello 4</h4>
          <p>I titoli aiutano a strutturare le tue note e renderle più leggibili.</p>

          <h2 style="color: #9b59b6;">Elenchi</h2>
          <p>Puoi creare elenchi puntati e numerati:</p>
          <ul>
            <li>Elemento 1</li>
            <li>Elemento 2</li>
            <li>Elemento 3</li>
      </ul>

          <p>Oppure elenchi numerati:</p>
          <ol>
            <li>Primo punto</li>
            <li>Secondo punto</li>
            <li>Terzo punto</li>
          </ol>

          <h2 style="color: #f39c12;">Allineamento del testo</h2>
          <p style="text-align: left;">Questo testo è allineato a sinistra</p>
          <p style="text-align: center;">Questo testo è centrato</p>
          <p style="text-align: right;">Questo testo è allineato a destra</p>

          <h2 style="color: #16a085;">Colori e dimensioni</h2>
          <p>Puoi cambiare il <span style="color: #e74c3c;">colore</span> del <span style="color: #3498db;">testo</span> utilizzando il selettore colori nella barra degli strumenti.</p>
          <p>E anche modificare la <span style="font-size: 18px;">dimensione</span> del <span style="font-size: 22px;">testo</span> secondo le tue <span style="font-size: 26px;">preferenze</span>.</p>

          <h2 style="color: #2980b9;">Funzionalità avanzate</h2>
          <p>Upsearch Notepad offre anche funzionalità avanzate:</p>
          <ul>
            <li><strong>Disegni</strong>: Puoi inserire disegni a mano libera direttamente nelle tue note</li>
            <li><strong>Documenti</strong>: Allega file alle tue note</li>
            <li><strong>Organizzazione</strong>: Trascina le note nella barra laterale per organizzarle in cartelle</li>
          </ul>

          <h2 style="color: #27ae60;">Scorciatoie da tastiera</h2>
          <table border="1" cellpadding="5" style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <tr style="background-color: #f2f2f2;">
              <th>Azione</th>
              <th>Scorciatoia</th>
            </tr>
            <tr>
              <td>Salva nota</td>
              <td>Ctrl+S</td>
            </tr>
            <tr>
              <td>Grassetto</td>
              <td>Ctrl+B</td>
            </tr>
            <tr>
              <td>Corsivo</td>
              <td>Ctrl+I</td>
            </tr>
            <tr>
              <td>Sottolineato</td>
              <td>Ctrl+U</td>
            </tr>
            <tr>
              <td>Elenco puntato</td>
              <td>Ctrl+Shift+8</td>
            </tr>
            <tr>
              <td>Elenco numerato</td>
              <td>Ctrl+Shift+7</td>
            </tr>
          </table>

          <h2 style="color: #d35400; margin-top: 20px;">Sincronizzazione</h2>
          <p>Upsearch Notepad funziona sia online che offline. Le modifiche fatte offline verranno sincronizzate automaticamente quando tornerai online.</p>

          <p style="text-align: center; margin-top: 30px; font-style: italic;">Inizia subito a creare note straordinarie!</p>
          <p style="text-align: center; color: #7f8c8d; font-size: 14px;">Puoi eliminare questa nota in qualsiasi momento quando non ti servirà più</p>
          `
        });
        
        return updatedNote || welcomeNote;
      }
      
      return welcomeNote;
    } catch (error) {
      console.error("Errore nella creazione della nota tutorial:", error);
      // Non rilanciare l'errore, gestiamo il fallimento silenziosamente
      return null;
    }
  };

  // Crea una singola nota tutorial locale con contenuto completo
  const createLocalTutorialNote = () => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = currentUser?.id || 'temp-user';
    
    return {
      id: 'tutorial-temp-' + Date.now(),
      title: "Benvenuto in Upsearch Notepad",
      content: `<h1 style="text-align: center; color: #3498db;">Benvenuto in Upsearch Notepad!</h1>
      <p>Questa guida ti mostrerà come utilizzare tutte le funzionalità dell'editor per rendere le tue note davvero efficaci.</p>
      
      <h2 style="color: #2ecc71;">Formattazione del testo</h2>
      <p>La barra degli strumenti in alto ti permette di formattare il testo in vari modi:</p>
      <ul>
        <li><strong>Grassetto</strong>: Seleziona il testo e clicca sul pulsante B o usa Ctrl+B</li>
        <li><em>Corsivo</em>: Seleziona il testo e clicca sul pulsante I o usa Ctrl+I</li>
        <li><u>Sottolineato</u>: Seleziona il testo e clicca sul pulsante U o usa Ctrl+U</li>
        <li><s>Barrato</s>: Seleziona il testo e clicca sul pulsante S</li>
      </ul>

      <h2 style="color: #e74c3c;">Titoli e paragrafi</h2>
      <p>Puoi utilizzare diversi livelli di titoli per organizzare i tuoi contenuti:</p>
      <h3>Questo è un titolo di livello 3</h3>
      <h4>Questo è un titolo di livello 4</h4>
      <p>I titoli aiutano a strutturare le tue note e renderle più leggibili.</p>

      <h2 style="color: #9b59b6;">Elenchi</h2>
      <p>Puoi creare elenchi puntati e numerati:</p>
      <ul>
        <li>Elemento 1</li>
        <li>Elemento 2</li>
        <li>Elemento 3</li>
      </ul>

      <p>Crea note efficaci con questi strumenti e organizzale come preferisci.</p>`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: userId,
      isTutorial: true,
      temporary: true,
      tags: ["tutorial", "guida"]
    };
  };

  // Funzione per creare note tutorial locali (senza API)
  const createLocalTutorialNotes = () => {
    const welcomeNote = {
      id: 'local-tutorial-1',
      title: "Benvenuto in Upsearch Notepad",
      content: `<h1>Benvenuto in Upsearch Notepad!</h1>
      <p>Questa è la tua guida rapida per iniziare a utilizzare Upsearch Notepad. Ecco come iniziare:</p>
      <h2>Funzionalità di base</h2>
      <ul>
        <li><strong>Creare una nota:</strong> Clicca sul pulsante "Nuova Nota" nella barra laterale.</li>
        <li><strong>Modificare una nota:</strong> Seleziona una nota dalla barra laterale e inizia a scrivere.</li>
        <li><strong>Salvare le modifiche:</strong> Le modifiche vengono salvate automaticamente, ma puoi anche cliccare sul pulsante "Salva" nella barra degli strumenti.</li>
        <li><strong>Organizzare le note:</strong> Trascina le note nella barra laterale per organizzarle in cartelle.</li>
      </ul>
      <p>Upsearch Notepad funziona sia online che offline. Le modifiche fatte offline verranno sincronizzate automaticamente quando tornerai online.</p>`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: user.id,
      isTutorial: true,
      temporary: true,
      tags: ["tutorial", "guida"]
    };
    
    const featuresNote = {
      id: 'local-tutorial-2',
      title: "Funzionalità avanzate",
      content: `<h1>Funzionalità avanzate di Upsearch Notepad</h1>
      <p>Scopri come sfruttare al massimo Upsearch Notepad con queste funzionalità avanzate:</p>
      <h2>Formattazione del testo</h2>
      <ul>
        <li><strong>Stili di testo:</strong> Usa i pulsanti nella barra degli strumenti per formattare il testo in grassetto, corsivo o come codice.</li>
        <li><strong>Titoli:</strong> Crea una struttura con i titoli di diversi livelli (H1, H2, H3).</li>
        <li><strong>Liste:</strong> Crea elenchi puntati o numerati per organizzare le tue informazioni.</li>
      </ul>
      <h2>Contenuti multimediali</h2>
      <ul>
        <li><strong>Disegni:</strong> Inserisci disegni a mano libera direttamente nelle tue note.</li>
        <li><strong>Documenti:</strong> Allega file PDF o altri documenti alle tue note.</li>
        <li><strong>Link:</strong> Inserisci collegamenti a siti web esterni.</li>
      </ul>
      <h2>Organizzazione</h2>
      <ul>
        <li><strong>Tag:</strong> Aggiungi tag alle tue note per una ricerca più veloce.</li>
        <li><strong>Ricerca:</strong> Cerca all'interno di tutte le tue note con la funzione di ricerca.</li>
        <li><strong>Esportazione:</strong> Esporta le tue note in formati come TXT, HTML o PDF.</li>
      </ul>
      <p>Esplora queste funzionalità per rendere le tue note più ricche e organizzate!</p>`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: user.id,
      isTutorial: true,
      temporary: true,
      tags: ["tutorial", "avanzato"]
    };
    
    return [welcomeNote, featuresNote];
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

  const createNote = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      
      setIsLoading(true);
      
      // Crea una nuova nota sul server
      const newNote = await noteApi.createNote({
        title: 'Nuova nota',
        content: '',
        userId: user.id,
        username: user.username
      });
      
      console.log("Nota creata con successo:", newNote);
      
      // Aggiorna lo stato con la nuova nota
      setNotes(prevNotes => [...prevNotes, newNote]);
      
      // Seleziona automaticamente la nuova nota
      setActiveNote(newNote);
      navigate(`/note/${newNote.id}`);
      
      return newNote;
    } catch (error) {
      console.error("Errore nella creazione della nota:", error);
      toast.error("Impossibile creare una nuova nota");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

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
  
  // Aggiungi questa funzione per gestire il passaggio tra note
  const handleNoteSelect = useCallback((id) => {
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
      {/* Sidebar a sinistra */}
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
      
      {/* Container per Toolbar ed Editor */}
      <div className="content-container">
        {/* Toolbar sopra l'editor */}
        <div className="toolbar-container">
              <Toolbar
                note={activeNote}
              updateNote={updateNote}
            deleteNote={deleteNote}
              addTag={addTag}
              removeTag={removeTag}
              createNote={createNote}
            onSave={handleSaveNote}
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                lastSyncTime={lastSyncTime}
                isOffline={connectionState.status !== 'online'}
                contentChanged={contentChanged}
              />
        </div>
        
        {/* Editor sotto la toolbar */}
        <div className="editor-container">
          {isLoading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Caricamento in corso...</p>
            </div>
          ) : activeNote ? (
                <Editor
              initialContent={activeNote.content}
                  onContentChange={handleContentChange}
                  activeNote={activeNote}
                  onTitleChange={handleTitleChange}
                  onContentStatusChange={setContentChanged}
                />
          ) : (
            <div className="no-note-selected">
              <p>Seleziona una nota dalla sidebar o crea una nuova nota</p>
              <Button variant="primary" onClick={createNote}>Crea Nuova Nota</Button>
    </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Notepad;