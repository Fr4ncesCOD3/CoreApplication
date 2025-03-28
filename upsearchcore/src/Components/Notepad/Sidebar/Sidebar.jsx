import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { FiSearch, FiPlus, FiMoon, FiSun, FiChevronDown, FiChevronRight, FiTrash2, FiX } from 'react-icons/fi'
import { InputGroup, Form, Button } from 'react-bootstrap'
import './Sidebar.css'
import { noteApi } from '../../../utils/api'
import { toast } from '../../../utils/notification'

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
  
  // Utilizza le note filtrate da Notepad se disponibili, altrimenti filtra localmente
  useEffect(() => {
    if (searchTerm) {
      // Se notesFromProps contiene già risultati filtrati, usali
      if (notesFromProps && notesFromProps.length > 0 && searchQuery === searchTerm) {
        setFilteredNotes(notesFromProps);
      } else {
        // Altrimenti filtra localmente
        const lowerCaseSearch = searchTerm.toLowerCase();
        const filtered = notes.filter(note => 
          note.title.toLowerCase().includes(lowerCaseSearch) ||
          (note.content && typeof note.content === 'string' && note.content.toLowerCase().includes(lowerCaseSearch))
        );
        setFilteredNotes(filtered);
      }
      
      // Notifica il componente parent del cambio di ricerca
      if (setSearchQuery && searchTerm !== searchQuery) {
        setSearchQuery(searchTerm);
      }
    } else {
      setFilteredNotes(notes);
      if (setSearchQuery && searchQuery !== '') {
        setSearchQuery('');
      }
    }
  }, [notes, notesFromProps, searchTerm, searchQuery, setSearchQuery]);
  
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
    const notesToRender = filteredNotes.filter(note => note.parent === parentId);
    
    if (notesToRender.length === 0) return null;
    
    return (
      <ul className={`note-list ${level > 0 ? 'nested' : ''}`} style={{ paddingLeft: level > 0 ? `${level * 16}px` : '0' }}>
        {notesToRender.map(note => {
          const hasChildren = notes.some(n => n.parent === note.id)
          const isExpanded = expandedFolders[note.id]
          
          return (
            <li key={note.id}>
              <Draggable 
                draggableId={note.id} 
                index={notes.indexOf(note)} 
                isDragDisabled={isDragging}
                key={note.id}
              >
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`note-item ${activeNoteId === note.id ? 'active' : ''}`}
                  >
                    <div className="note-item-content" onClick={() => handleNoteClick(note.id)}>
                      {hasChildren && (
                        <button 
                          className="toggle-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFolder(note.id)
                          }}
                        >
                          {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                        </button>
                      )}
                      <span className="note-title">{note.title || 'Senza titolo'}</span>
                    </div>
                    
                    {hasChildren && isExpanded && (
                      <Droppable droppableId={note.id} type="note">
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
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
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="root" type="note">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="droppable-container"
              >
                {filteredNotes.length === 0 ? (
                  <div className="no-notes">
                    {searchTerm ? 'Nessun risultato trovato' : 'Nessuna nota disponibile'}
                  </div>
                ) : (
                  renderNoteTree(null, 0, snapshot.isDraggingOver)
                )}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
    </div>
  )
}

export default Sidebar
