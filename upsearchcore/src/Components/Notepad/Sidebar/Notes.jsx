import { useNavigate } from 'react-router-dom'
import { FiFile, FiFolder, FiFolderPlus } from 'react-icons/fi'
import { ListGroup, Button } from 'react-bootstrap'
import './Notes.css'

const Notes = ({ notes, activeNoteId, onNoteSelect, onCreateNote }) => {
  const navigate = useNavigate()
  
  const handleNoteClick = (id) => {
    onNoteSelect(id)
    navigate(`/note/${id}`)
  }
  
  // Funzione per renderizzare la struttura gerarchica delle note
  const renderNoteTree = (parentId = null, level = 0) => {
    const childNotes = notes.filter(note => note.parent === parentId)
    
    if (childNotes.length === 0) {
      return null
    }
    
    return (
      <ListGroup variant="flush" className="notes-tree" style={{ paddingLeft: level > 0 ? `${level * 16}px` : '0' }}>
        {childNotes.map(note => {
          const hasChildren = notes.some(n => n.parent === note.id)
          
          return (
            <ListGroup.Item 
              key={note.id} 
              className={`note-tree-item border-0 py-1 px-2 ${activeNoteId === note.id ? 'active' : ''}`}
              action
              onClick={() => handleNoteClick(note.id)}
            >
              <div className="note-tree-item-content d-flex align-items-center">
                {hasChildren ? <FiFolder className="note-icon me-2" /> : <FiFile className="note-icon me-2" />}
                <span className="note-title">{note.title}</span>
                
                <Button 
                  variant="link"
                  className="create-child-note p-1 ms-auto"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCreateNote(note.id)
                  }}
                  title="Crea sotto-nota"
                >
                  <FiFolderPlus />
                </Button>
              </div>
              
              {renderNoteTree(note.id, level + 1)}
            </ListGroup.Item>
          )
        })}
      </ListGroup>
    )
  }
  
  return (
    <div className="notes-container">
      {renderNoteTree()}
    </div>
  )
}

export default Notes
