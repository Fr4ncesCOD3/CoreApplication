import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { FiSearch, FiPlus, FiMoon, FiSun, FiChevronDown, FiChevronRight, FiTrash2, FiX, FiClock } from 'react-icons/fi'
import { InputGroup, Form, Button, Spinner } from 'react-bootstrap'
import './Sidebar.css'
import { noteApi, getCsrfToken } from '../../../utils/api'
import { toast } from '../../../utils/notification'
import Notes from './Notes'

// Funzione di utility per estrarre testo da HTML
const stripHtml = (html) => {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

// Funzione per generare un'anteprima del contenuto
const generateContentPreview = (content, maxLength = 80) => {
  if (!content) return '';
  const textContent = stripHtml(content);
  return textContent.length > maxLength 
    ? textContent.substring(0, maxLength) + '...' 
    : textContent;
};

// Funzione per formattare la data
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  
  // Controlla se la data è oggi
  const today = new Date();
  const isToday = date.getDate() === today.getDate() && 
                 date.getMonth() === today.getMonth() && 
                 date.getFullYear() === today.getFullYear();
  
  if (isToday) {
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  
  // Se è negli ultimi 7 giorni, mostra il giorno della settimana
  const daysDiff = Math.floor((today - date) / (1000 * 60 * 60 * 24));
  if (daysDiff < 7) {
    return date.toLocaleDateString('it-IT', { weekday: 'short' }) + ' ' + 
           date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  
  // Altrimenti mostra la data completa
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const Sidebar = ({ 
  notes = [], 
  notesFromProps = [],
  activeNoteId = null, 
  setActiveNoteId = () => {}, 
  createNote = () => {}, 
  searchQuery = '', 
  setSearchQuery = () => {}, 
  theme = 'light', 
  toggleTheme = () => {},
  moveNote = () => {},
  closeSidebar = () => {},
  isOpen = false
}) => {
  const [expandedFolders, setExpandedFolders] = useState({})
  const navigate = useNavigate()
  const [filteredNotes, setFilteredNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [creatingNote, setCreatingNote] = useState(false)
  
  // Funzione helper per verificare i tag tutorial - spostala prima del suo utilizzo
  const hasTutorialTag = (tags) => {
    if (!tags) return false;
    
    if (Array.isArray(tags)) {
      return tags.some(tag => ['tutorial', 'benvenuto'].includes(tag));
    }
    
    if (typeof tags === 'string') {
      return tags.includes('tutorial') || tags.includes('benvenuto');
    }
    
    return false;
  };
  
  // Sincronizza searchTerm con searchQuery proveniente da Notepad
  useEffect(() => {
    if (searchQuery !== searchTerm) {
      setSearchTerm(searchQuery);
    }
  }, [searchQuery]);
  
  // Aggiungi una memoria delle note filtrate per prevenire calcoli ripetuti
  const memoizedFilterNotes = useCallback((notes, searchTerm, currentUser) => {
    // Crea una chiave unica per questa combinazione di input
    const key = `${searchTerm}_${notes.length}_${currentUser?.id || 'guest'}`;
    
    // Controlla se abbiamo già calcolato questo risultato
    if (window.filteredNotesCache && window.filteredNotesCache[key]) {
      console.log('Usando cache per il filtraggio delle note');
      return window.filteredNotesCache[key];
    }
    
    // Filtra le note per assicurarsi che le note tutorial siano sempre visibili
    const userNotes = notes.filter(note => {
      // Se la nota è undefined o null, saltala
      if (!note) return false;
      
      // Le note tutorial sono sempre visibili
      if (note.isTutorial === true) return true;
      
      // Controlla i tag per identificare note tutorial
      const hasTutorialTagLocal = note.tags && (
        Array.isArray(note.tags) 
          ? note.tags.some(tag => ['tutorial', 'benvenuto'].includes(tag))
          : typeof note.tags === 'string' && 
            (note.tags.includes('tutorial') || note.tags.includes('benvenuto'))
      );
      
      if (hasTutorialTagLocal) return true;
      
      // Mostra note dell'utente corrente o note senza userId (locali)
      if (currentUser.id && note.userId === currentUser.id) return true;
      if (!note.userId) return true;
      
      // Altrimenti non mostrare la nota
      return false;
    });
    
    // Ordina le note appropriate
    let sortedNotes = [...userNotes];
    
    // Se c'è un termine di ricerca, filtra ulteriormente
    if (searchTerm) {
      const lowerCaseSearch = searchTerm.toLowerCase();
      sortedNotes = sortedNotes.filter(note => 
        (note.title && note.title.toLowerCase().includes(lowerCaseSearch)) ||
        (note.content && typeof note.content === 'string' && 
         note.content.toLowerCase().includes(lowerCaseSearch))
      );
    } else {
      // Ordina le note: tutorial in cima, poi per data più recente
      sortedNotes.sort((a, b) => {
        // Note tutorial prima
        if ((a.isTutorial || hasTutorialTag(a.tags)) && 
            !(b.isTutorial || hasTutorialTag(b.tags))) return -1;
        if (!(a.isTutorial || hasTutorialTag(a.tags)) && 
            (b.isTutorial || hasTutorialTag(b.tags))) return 1;
        
        // Poi per data di aggiornamento
        const dateA = new Date(a.updatedAt || a.createdAt);
        const dateB = new Date(b.updatedAt || b.createdAt);
        return dateB - dateA;
      });
    }
    
    // Salva il risultato nella cache
    if (!window.filteredNotesCache) window.filteredNotesCache = {};
    window.filteredNotesCache[key] = sortedNotes;
    
    return sortedNotes;
  }, [hasTutorialTag]);

  // Modifica l'useEffect per il filtraggio note
  useEffect(() => {
    // Throttle l'elaborazione per evitare troppi aggiornamenti ravvicinati
    if (window.filteringTimeout) {
      clearTimeout(window.filteringTimeout);
    }
    
    window.filteringTimeout = setTimeout(() => {
      // Ottieni info utente
      let currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const token = localStorage.getItem('token');
      
      // Se non c'è un token valido, non filtrare le note
      if (!token) {
        console.log('Nessun utente autenticato, sidebar vuota');
        setFilteredNotes([]);
        return;
      }
      
      if (notes && notes.length > 0) {
        const filtered = memoizedFilterNotes(notes, searchTerm, currentUser);
        console.log(`Note filtrate: ${filtered.length}`);
        setFilteredNotes(filtered);
      } else {
        setFilteredNotes([]);
      }
    }, 250); // Throttle di 250ms
    
    return () => {
      if (window.filteringTimeout) {
        clearTimeout(window.filteringTimeout);
      }
    };
  }, [notes, searchTerm, searchQuery, setSearchQuery, memoizedFilterNotes]);
  
  // Espande automaticamente la cartella quando una nota al suo interno è attiva
  useEffect(() => {
    if (activeNoteId) {
      const activeNote = notes.find(note => note.id === activeNoteId);
      if (activeNote && activeNote.parent) {
        setExpandedFolders(prev => ({
          ...prev,
          [activeNote.parent]: true
        }));
        
        // Espande anche le cartelle genitori in modo ricorsivo
        let parentId = activeNote.parent;
        while (parentId) {
          const parentNote = notes.find(note => note.id === parentId);
          if (parentNote && parentNote.parent) {
            setExpandedFolders(prev => ({
              ...prev,
              [parentNote.parent]: true
            }));
            parentId = parentNote.parent;
          } else {
            break;
          }
        }
      }
    }
  }, [activeNoteId, notes]);
  
  const toggleFolder = (id) => {
    setExpandedFolders(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }
  
  const handleNoteClick = (id) => {
    console.log(`Nota selezionata: ${id}`);
    setActiveNoteId(id);
    navigate(`/note/${id}`);
    
    // Chiudi automaticamente la sidebar su dispositivi mobili
    if (window.innerWidth <= 768) {
      closeSidebar && closeSidebar();
    }
  }
  
  const handleCreateNewNote = async (parentId = null) => {
    // Previeni creazioni multiple rapide
    if (creatingNote) {
      console.log('Creazione nota già in corso, ignoro la richiesta');
      return;
    }
    
    setCreatingNote(true);
    
    try {
      // Aggiungi un piccolo ritardo per prevenire click multipli accidentali
      await new Promise(resolve => setTimeout(resolve, 300));
      
      console.log('Creazione nuova nota...');
      const newNote = await createNote(parentId);
      
      if (newNote && newNote.id) {
        console.log('Nota creata con successo:', newNote.id);
        handleNoteClick(newNote.id);
      } else {
        console.error('Creazione nota fallita: nessun ID restituito');
      }
    } catch (error) {
      console.error('Errore nella creazione della nota:', error);
      toast.error('Errore nella creazione della nota');
    } finally {
      setCreatingNote(false);
    }
  };
  
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  const handleClearSearch = () => {
    setSearchTerm('');
    setSearchQuery('');
  };
  
  const renderNoteItem = (note) => {
    const isTutorial = note.isTutorial || (note.tags && note.tags.includes('tutorial'));
    const isTemporary = note.temporary === true;
    const isActive = note.id === activeNoteId;
    const hasChildren = notes.some(n => n.parent === note.id);
    const isExpanded = expandedFolders[note.id];
    const contentPreview = generateContentPreview(note.content);
    
    return (
      <div 
        className={`note-card ${isActive ? 'active' : ''} ${isTutorial ? 'tutorial' : ''}`}
        onClick={() => handleNoteClick(note.id)}
      >
        <div className="note-card-header">
          <div className="note-title-container">
            {hasChildren && (
              <button 
                className="toggle-btn" 
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(note.id);
                }}
              >
                {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
              </button>
            )}
            <h3 className="note-title">{note.title || 'Senza titolo'}</h3>
          </div>
          <div className="note-meta">
            <span className="note-date"><FiClock /> {formatDate(note.updatedAt || note.createdAt)}</span>
          </div>
        </div>
        
        {note.tags && note.tags.length > 0 && (
          <div className="note-tags">
            {note.tags.map(tag => (
              <span key={tag} className="note-tag">{tag}</span>
            ))}
          </div>
        )}
        
        <div className="note-preview">
          {contentPreview}
        </div>
        
        {(isTutorial || isTemporary) && (
          <div className="note-badges">
            {isTemporary && <span className="badge local-badge">Locale</span>}
            {isTutorial && <span className="badge tutorial-badge">Tutorial</span>}
          </div>
        )}
      </div>
    );
  };
  
  const renderNotesContainer = () => {
    // Verifica se filteredNotes è definito e ha elementi
    if (!filteredNotes || filteredNotes.length === 0) {
      if (loading) {
        return (
          <div className="notes-loading">
            <Spinner animation="border" size="sm" />
            <span>Caricamento note...</span>
          </div>
        );
      }
      
      if (searchTerm) {
        return (
          <div className="no-notes">
            <p>Nessun risultato per "{searchTerm}"</p>
            <Button 
              variant="link" 
              className="clear-search" 
              onClick={handleClearSearch}
            >
              Cancella ricerca
            </Button>
          </div>
        );
      }
      
      return (
        <div className="no-notes">
          <p>Nessuna nota disponibile</p>
        </div>
      );
    }
    
    // Filtra solo le note radice
    const rootNotes = filteredNotes.filter(note => !note.parent);
    
    return (
      <div className="notes-list">
        {rootNotes.map(note => (
          <div key={note.id} className="note-item-container">
            {renderNoteItem(note)}
            
            {/* Renderizza le note figlie se la cartella è espansa */}
            {expandedFolders[note.id] && notes.some(n => n.parent === note.id) && (
              <div className="nested-notes" style={{ marginLeft: '12px' }}>
                {notes
                  .filter(n => n.parent === note.id)
                  .map(childNote => (
                    <div key={childNote.id} className="note-item-container">
                      {renderNoteItem(childNote)}
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Note</h2>
        <div className="sidebar-header-actions">
          <button 
            className="theme-toggle" 
            onClick={toggleTheme} 
            aria-label={theme === 'light' ? 'Passa al tema scuro' : 'Passa al tema chiaro'}
          >
            {theme === 'light' ? <FiMoon /> : <FiSun />}
          </button>
          <button 
            className="close-sidebar-btn d-md-none" 
            onClick={closeSidebar}
            aria-label="Chiudi sidebar"
          >
            <FiX />
          </button>
        </div>
      </div>
      
      <div className="search-container">
        <InputGroup>
          <Form.Control
            type="text"
            placeholder="Cerca note..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="search-input"
          />
          {searchTerm && (
            <Button 
              variant="link" 
              className="clear-search-btn"
              onClick={handleClearSearch}
            >
              <FiX />
            </Button>
          )}
        </InputGroup>
      </div>
      
      <div className="sidebar-actions">
        <Button 
          className="new-note-btn" 
          onClick={() => handleCreateNewNote()}
          disabled={creatingNote}
        >
          {creatingNote ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Creazione...
            </>
          ) : (
            <>
              <FiPlus className="me-2" />
              Nuova Nota
            </>
          )}
        </Button>
      </div>
      
      <div className="notes-container">
        {renderNotesContainer()}
      </div>
    </div>
  );
};

export default Sidebar;
