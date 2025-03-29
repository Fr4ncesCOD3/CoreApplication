import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { FiSearch, FiPlus, FiMoon, FiSun, FiChevronDown, FiChevronRight, FiTrash2, FiX } from 'react-icons/fi'
import { InputGroup, Form, Button } from 'react-bootstrap'
import './Sidebar.css'
import { noteApi } from '../../../utils/api'
import { toast } from '../../../utils/notification'
import Notes from './Notes'

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
  
  // Sincronizza searchTerm con searchQuery proveniente da Notepad
  useEffect(() => {
    if (searchQuery !== searchTerm) {
      setSearchTerm(searchQuery);
    }
  }, [searchQuery]);
  
  // Aggiorna questo useEffect per filtrare per utente e ordinare meglio le note
  useEffect(() => {
    // Ottieni info utente
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = currentUser?.id;
    
    if (!userId) {
      console.warn('Nessun utente autenticato, impossibile filtrare le note');
      setFilteredNotes([]);
      return;
    }
    
    console.log(`Filtraggio note per utente ${userId}, totale note: ${notes.length}`);
    
    // Filtra le note per utente corrente in modo RIGOROSO
    const userNotes = notes.filter(note => {
      // Verifica che la nota appartenga all'utente corrente o sia una nota tutorial esplicita
      return (note.userId === userId) || (note.isTutorial === true);
    });
    
    console.log(`Note filtrate per utente: ${userNotes.length}`);
    
    // Se non ci sono note dell'utente, mostra una nota temporanea SOLO se non ci sono già tentativi in corso
    if (userNotes.length === 0 && !notes.some(note => note.temporary === true)) {
      const tutorialNote = {
        id: 'tutorial-temp',
        title: 'Guida di benvenuto a Upsearch Notepad',
        content: 'Benvenuto in Upsearch Notepad! Questa nota contiene consigli utili per iniziare a utilizzare l\'applicazione.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isTutorial: true,
        userId: userId,
        temporary: true
      };
      
      console.log('Creata nota tutorial temporanea in attesa della nota reale');
      setFilteredNotes([tutorialNote]);
      return;
    }
    
    // Se ci sono già delle note (reali o temporanee), mostrare quelle
    setFilteredNotes(userNotes);
    
    // Se non c'è un termine di ricerca, ordina le note per data
    if (!searchTerm) {
      const sortedNotes = [...userNotes].sort((a, b) => {
        // Metti le note tutorial in cima
        if (a.isTutorial && !b.isTutorial) return -1;
        if (!a.isTutorial && b.isTutorial) return 1;
        
        // Per le altre note, ordina per data di aggiornamento (dalla più recente)
        const dateA = new Date(a.updatedAt || a.createdAt);
        const dateB = new Date(b.updatedAt || b.createdAt);
        return dateB - dateA;
      });
      
      setFilteredNotes(sortedNotes);
      return;
    }
    
    // Se c'è un termine di ricerca, filtra le note dell'utente
    const lowerCaseSearch = searchTerm.toLowerCase();
    const filtered = userNotes.filter(note => 
      (note.title && note.title.toLowerCase().includes(lowerCaseSearch)) ||
      (note.content && typeof note.content === 'string' && note.content.toLowerCase().includes(lowerCaseSearch))
    );
    
    console.log(`Note filtrate per ricerca "${searchTerm}": ${filtered.length}`);
    setFilteredNotes(filtered);
    
    // Notifica il componente parent del cambio di ricerca
    if (setSearchQuery && searchTerm !== searchQuery) {
      setSearchQuery(searchTerm);
    }
  }, [notes, searchTerm, searchQuery, setSearchQuery]);
  
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
    setActiveNoteId(id);
    navigate(`/note/${id}`);
    
    // Chiudi automaticamente la sidebar su dispositivi mobili
    if (window.innerWidth <= 768) {
      closeSidebar && closeSidebar();
    }
  }
  
  const handleDragEnd = (result) => {
    if (!result.destination) return
    
    const { draggableId, destination } = result
    const destinationId = destination.droppableId === 'root' ? null : destination.droppableId
    
    const draggedNote = notes.find(note => note.id === draggableId)
    if (!draggedNote) {
      console.warn(`Note with id ${draggableId} not found`);
      return;
    }
    
    if (destinationId !== null) {
      const destinationNote = notes.find(note => note.id === destinationId)
      if (!destinationNote) {
        console.warn(`Destination note with id ${destinationId} not found`);
        return;
      }
    }
    
    moveNote(draggableId, destinationId)
  }
  
  const renderNoteTree = (parentId = null, level = 0, isDragging = false) => {
    // Filtriamo le note che hanno il parent specificato
    const notesToRender = filteredNotes.filter(note => note.parent === parentId);
    
    // Aggiungiamo un log per debug
    console.log(`Rendering notes with parent ${parentId}: ${notesToRender.length} notes found`);
    
    if (notesToRender.length === 0) return null;
    
    return (
      <ul className={`note-list ${level > 0 ? 'nested' : ''}`} style={{ paddingLeft: level > 0 ? `${level * 16}px` : '0' }}>
        {notesToRender.map(note => {
          const hasChildren = notes.some(n => n.parent === note.id);
          const isExpanded = expandedFolders[note.id];
          const isTutorial = note.isTutorial || (note.tags && note.tags.includes('tutorial'));
          const isTemporary = note.temporary === true;
          
          // Formattazione della data per maggiore leggibilità
          const updatedAt = note.updatedAt || note.createdAt;
          const formattedDate = updatedAt ? new Date(updatedAt).toLocaleDateString() : '';
          
          return (
            <li key={note.id} className="note-item-container">
              <Draggable 
                draggableId={note.id} 
                index={notes.indexOf(note)} 
                isDragDisabled={isDragging || isTutorial || isTemporary || note.id === 'tutorial-temp' || note.id.startsWith('tutorial-temp-')}
                key={note.id}
              >
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`note-item ${activeNoteId === note.id ? 'active' : ''} ${isTutorial ? 'tutorial' : ''} ${isTemporary ? 'temporary' : ''}`}
                  >
                    <div className="note-item-content" onClick={() => handleNoteClick(note.id)}>
                      {hasChildren && (
                        <span 
                          className="toggle-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFolder(note.id);
                          }}
                        >
                          {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                        </span>
                      )}
                      <div className="note-details">
                        <span className={`note-title ${isTutorial ? 'tutorial-title' : ''} ${isTemporary ? 'temporary-title' : ''}`}>
                          {note.title || 'Senza titolo'}
                          {isTemporary && <span className="badge badge-warning ms-1">(locale)</span>}
                          {isTutorial && <span className="badge badge-success ms-1">(tutorial)</span>}
                        </span>
                        <span className="note-date">{formattedDate}</span>
                      </div>
                    </div>
                    
                    {hasChildren && isExpanded && (
                      <Droppable droppableId={note.id} type="note">
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className="nested-notes"
                          >
                            {renderNoteTree(note.id, level + 1, isDragging)}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    )}
                  </div>
                )}
              </Draggable>
            </li>
          )
        })}
      </ul>
    )
  }
  
  const handleCreateNote = async () => {
    setLoading(true)
    try {
      await createNote()
    } catch (error) {
      toast.error('Errore nella creazione della nota')
      console.error('Errore nella creazione della nota:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const handleDeleteNote = async (noteId, event) => {
    event.stopPropagation()
    
    if (!window.confirm('Sei sicuro di voler eliminare questa nota?')) {
      return
    }
    
    setLoading(true)
    try {
      await noteApi.deleteNote(noteId)
      toast.success('Nota eliminata con successo')
    } catch (error) {
      toast.error('Errore nell\'eliminazione della nota')
      console.error('Errore nell\'eliminazione della nota:', error)
    } finally {
      setLoading(false)
    }
  }
  
  // Aggiungi questa funzione helper al componente Sidebar per le props di default
  const getDefaultDraggableProps = (draggableProps = {}) => {
    return {
      isDragDisabled: false,
      ...draggableProps
    };
  };
  
  return (
    <div className={`sidebar h-100 d-flex flex-column ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header d-flex align-items-center justify-content-between p-3">
        <h2 className="m-0">Upsearch Notepad</h2>
        <div className="sidebar-header-actions d-flex align-items-center">
          <Button 
            variant="link" 
            className="theme-toggle p-1" 
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <FiSun /> : <FiMoon />}
          </Button>
          {closeSidebar && (
            <Button 
              variant="link" 
              className="close-sidebar-btn d-md-none p-1" 
              onClick={closeSidebar} 
              aria-label="Chiudi sidebar"
            >
              <FiX />
            </Button>
          )}
        </div>
      </div>
      
      <div className="search-container p-3">
        <InputGroup>
          <InputGroup.Text className="bg-transparent border-end-0">
            <FiSearch className="search-icon" />
          </InputGroup.Text>
          <Form.Control
            type="text"
            placeholder="Cerca note..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input border-start-0"
          />
          {searchTerm && (
            <Button 
              variant="link" 
              className="clear-search" 
              onClick={() => setSearchTerm('')}
            >
              <FiX />
            </Button>
          )}
        </InputGroup>
      </div>
      
      <div className="sidebar-actions px-3 pb-3">
        <Button 
          variant="primary" 
          className="new-note-btn w-100 d-flex align-items-center justify-content-center"
          onClick={handleCreateNote}
          disabled={loading}
        >
          <FiPlus className="me-2" /> {loading ? '...' : 'Nuova Nota'}
        </Button>
      </div>
      
      <div className="notes-container flex-grow-1 overflow-auto px-2">
        <Notes 
          notes={filteredNotes} 
          activeNoteId={activeNoteId} 
          onNoteSelect={handleNoteClick} 
          onCreateNote={(parentId) => createNote({ parent: parentId })} 
        />
      </div>
    </div>
  )
}

export default Sidebar
