import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { FiSearch, FiPlus, FiMoon, FiSun, FiChevronDown, FiChevronRight, FiTrash2, FiX } from 'react-icons/fi'
import { InputGroup, Form, Button } from 'react-bootstrap'
import './Sidebar.css'

const Sidebar = ({ 
  notes, 
  filteredNotes, 
  activeNoteId, 
  setActiveNoteId, 
  createNote, 
  searchQuery, 
  setSearchQuery, 
  theme, 
  toggleTheme,
  moveNote,
  closeSidebar = null,
  isOpen = false
}) => {
  const [expandedFolders, setExpandedFolders] = useState({})
  const navigate = useNavigate()
  
  const toggleFolder = (id) => {
    setExpandedFolders(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }
  
  const handleNoteClick = (id) => {
    setActiveNoteId(id)
    navigate(`/note/${id}`)
    if (window.innerWidth <= 480) {
      closeSidebar && closeSidebar()
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
    const notesToRender = searchQuery 
      ? filteredNotes.filter(note => note.parent === parentId)
      : notes.filter(note => note.parent === parentId)
    
    if (notesToRender.length === 0) return null
    
    return (
      <ul className={`note-list ${level > 0 ? 'nested' : ''}`} style={{ paddingLeft: level > 0 ? `${level * 16}px` : '0' }}>
        {notesToRender.map(note => {
          const hasChildren = note.children && note.children.length > 0
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
                      <span className="note-title">{note.title}</span>
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
  
  return (
    <div className={`sidebar h-100 d-flex flex-column ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header d-flex align-items-center justify-content-between p-3">
        <h2 className="m-0">Advanced Notepad</h2>
        <div className="sidebar-header-actions d-flex">
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input border-start-0"
          />
        </InputGroup>
      </div>
      
      <div className="sidebar-actions px-3 pb-3">
        <Button 
          variant="primary" 
          className="new-note-btn w-100 d-flex align-items-center justify-content-center"
          onClick={() => createNote()}
        >
          <FiPlus className="me-2" /> Nuova Nota
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
                {renderNoteTree(null, 0, snapshot.isDraggingOver)}
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
