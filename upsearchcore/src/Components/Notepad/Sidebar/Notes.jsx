import { useNavigate } from 'react-router-dom'
import { FiFile, FiFolder, FiFolderPlus, FiChevronDown, FiChevronRight } from 'react-icons/fi'
import { ListGroup, Button } from 'react-bootstrap'
import { useState, useEffect } from 'react'
import './Notes.css'

const Notes = ({ notes, activeNoteId, onNoteSelect, onCreateNote }) => {
  const navigate = useNavigate()
  const [expandedFolders, setExpandedFolders] = useState({})
  
  // Espandiamo automaticamente le cartelle contenenti la nota attiva
  useEffect(() => {
    if (activeNoteId) {
      const activeNote = notes.find(note => note.id === activeNoteId);
      if (activeNote && activeNote.parent) {
        setExpandedFolders(prev => ({
          ...prev,
          [activeNote.parent]: true
        }));
      }
    }
  }, [activeNoteId, notes]);
  
  const toggleFolder = (id, e) => {
    e.stopPropagation();
    setExpandedFolders(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  }
  
  const handleNoteClick = (id) => {
    onNoteSelect(id)
    navigate(`/note/${id}`)
  }
  
  // Trova tutte le note di primo livello o note senza parent
  const findRootNotes = () => {
    // Identifica i parent IDs esistenti
    const parentIds = new Set(
      notes.filter(note => note.parent).map(note => note.parent)
    );
    
    // Se non ci sono note con parent=null, trova le note che sono parent ma non sono figli di nessuno
    if (!notes.some(note => note.parent === null)) {
      // Trova le note che sono parent di altre ma non sono figli di nessuna nota
      const potentialRoots = notes.filter(note => 
        parentIds.has(note.id) && !parentIds.has(note.parent)
      );
      
      // Se ci sono potenziali radici, usale come primo livello
      if (potentialRoots.length > 0) {
        return potentialRoots;
      }
      
      // Altrimenti, prendi le prime 10 note come radici
      return notes.slice(0, 10);
    }
    
    return notes.filter(note => note.parent === null);
  };
  
  // Funzione per renderizzare la struttura gerarchica delle note
  const renderNoteTree = (parentId = null, level = 0) => {
    // Se siamo al primo livello e non ci sono note con parent=null
    let notesToRender;
    
    if (level === 0 && !notes.some(note => note.parent === null)) {
      notesToRender = findRootNotes();
    } else {
      notesToRender = notes.filter(note => note.parent === parentId);
    }
    
    console.log(`Notes.jsx: Rendering ${notesToRender.length} notes with parent ${parentId} at level ${level}`);
    
    if (notesToRender.length === 0) {
      return null;
    }
    
    return (
      <ListGroup variant="flush" className="notes-tree" style={{ paddingLeft: level > 0 ? `${level * 16}px` : '0' }}>
        {notesToRender.map(note => {
          const hasChildren = notes.some(n => n.parent === note.id);
          const isExpanded = expandedFolders[note.id];
          const isTutorial = note.isTutorial || (note.tags && note.tags.includes('tutorial'));
          const isTemporary = note.temporary === true;
          
          return (
            <ListGroup.Item 
              key={note.id} 
              className={`note-tree-item border-0 py-1 px-2 ${activeNoteId === note.id ? 'active' : ''} ${isTutorial ? 'tutorial' : ''}`}
              action
              onClick={() => handleNoteClick(note.id)}
            >
              <div className="note-tree-item-content d-flex align-items-center">
                {hasChildren ? (
                  <span 
                    className="p-0 me-2 toggle-btn" 
                    onClick={(e) => toggleFolder(note.id, e)}
                  >
                    {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                  </span>
                ) : (
                  <FiFile className="note-icon me-2" />
                )}
                
                <div className="note-details">
                  <span className="note-title">{note.title || 'Senza titolo'}</span>
                  {(isTutorial || isTemporary) && (
                    <div className="note-badges">
                      {isTemporary && <span className="badge bg-warning me-1">Locale</span>}
                      {isTutorial && <span className="badge bg-success">Tutorial</span>}
                    </div>
                  )}
                </div>
                
                <span 
                  className="create-child-note p-1 ms-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateNote(note.id);
                  }}
                  title="Crea sotto-nota"
                >
                  <FiFolderPlus />
                </span>
              </div>
              
              {hasChildren && isExpanded && renderNoteTree(note.id, level + 1)}
            </ListGroup.Item>
          );
        })}
      </ListGroup>
    );
  }
  
  return (
    <div className="notes-container">
      {notes.length === 0 ? (
        <div className="no-notes">
          Nessuna nota disponibile
        </div>
      ) : (
        renderNoteTree()
      )}
    </div>
  )
}

export default Notes
