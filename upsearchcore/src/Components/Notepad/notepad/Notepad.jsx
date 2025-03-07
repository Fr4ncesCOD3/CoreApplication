import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import { Row, Col, Button } from 'react-bootstrap'
import Sidebar from '../Sidebar/Sidebar'
import Editor from '../Editor/Editor'
import Toolbar from '../Toolbar/Toolbar'
import { v4 as uuidv4 } from 'uuid'
import { FiMenu } from 'react-icons/fi'
import './Notepad.css'

const Notepad = ({ theme, toggleTheme }) => {
  const [notes, setNotes] = useState(() => {
    const savedNotes = localStorage.getItem('notes')
    return savedNotes ? JSON.parse(savedNotes) : [
      {
        id: 'welcome',
        title: 'Benvenuto',
        content: '<h1>Benvenuto nel tuo Advanced Notepad!</h1><p>Inizia a scrivere le tue note qui.</p>',
        tags: ['benvenuto'],
        parent: null,
        children: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]
  })
  
  const [searchQuery, setSearchQuery] = useState('')
  const [activeNoteId, setActiveNoteId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  
  const navigate = useNavigate()
  
  useEffect(() => {
    localStorage.setItem('notes', JSON.stringify(notes))
  }, [notes])
  
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 767;
      setIsMobile(mobile);
      
      // Su desktop, la sidebar è sempre aperta
      // Su mobile, la sidebar è chiusa di default
      setSidebarOpen(!mobile);
    };
    
    // Imposta lo stato iniziale
    handleResize();
    
    // Aggiungi event listener per il resize
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const createNote = (parentId = null) => {
    const newNote = {
      id: uuidv4(),
      title: 'Nuova Nota',
      content: '',
      tags: [],
      parent: parentId,
      children: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    const updatedNotes = [...notes, newNote]
    
    if (parentId) {
      const parentIndex = updatedNotes.findIndex(note => note.id === parentId)
      if (parentIndex !== -1) {
        updatedNotes[parentIndex] = {
          ...updatedNotes[parentIndex],
          children: [...updatedNotes[parentIndex].children, newNote.id]
        }
      }
    }
    
    setNotes(updatedNotes)
    setActiveNoteId(newNote.id)
    navigate(`/note/${newNote.id}`)
    return newNote
  }
  
  const updateNote = (id, updates) => {
    const updatedNotes = notes.map(note => 
      note.id === id 
        ? { ...note, ...updates, updatedAt: new Date().toISOString() } 
        : note
    )
    setNotes(updatedNotes)
  }
  
  const deleteNote = (id) => {
    // Trova la nota da eliminare
    const noteToDelete = notes.find(note => note.id === id)
    if (!noteToDelete) return
    
    // Aggiorna il genitore rimuovendo questo figlio
    let updatedNotes = notes.map(note => {
      if (note.id === noteToDelete.parent) {
        return {
          ...note,
          children: note.children.filter(childId => childId !== id)
        }
      }
      return note
    })
    
    // Funzione ricorsiva per eliminare tutti i figli
    const deleteChildren = (noteId) => {
      const note = updatedNotes.find(n => n.id === noteId)
      if (!note) return
      
      // Elimina ricorsivamente tutti i figli
      if (note.children && note.children.length > 0) {
        note.children.forEach(childId => {
          deleteChildren(childId)
        })
      }
      
      // Rimuovi questa nota dall'array
      updatedNotes = updatedNotes.filter(n => n.id !== noteId)
    }
    
    // Elimina la nota e tutti i suoi figli
    deleteChildren(id)
    
    setNotes(updatedNotes)
    
    // Se la nota attiva è stata eliminata, naviga alla prima nota disponibile o alla home
    if (activeNoteId === id) {
      const firstAvailableNote = updatedNotes[0]
      if (firstAvailableNote) {
        setActiveNoteId(firstAvailableNote.id)
        navigate(`/note/${firstAvailableNote.id}`)
      } else {
        setActiveNoteId(null)
        navigate('/')
      }
    }
  }
  
  const moveNote = (noteId, newParentId) => {
    // Verifica che la nota esista
    const noteToMove = notes.find(note => note.id === noteId);
    if (!noteToMove) {
      console.warn(`Cannot move note: note with id ${noteId} not found`);
      return;
    }
    
    // Verifica che la destinazione esista (se non è root)
    if (newParentId !== null) {
      const parentNote = notes.find(note => note.id === newParentId);
      if (!parentNote) {
        console.warn(`Cannot move note: parent with id ${newParentId} not found`);
        return;
      }
      
      // Verifica che non si stia tentando di spostare una nota in uno dei suoi discendenti
      const isDescendant = (parentId, childId) => {
        if (parentId === childId) return true
        
        const parent = notes.find(note => note.id === parentId)
        if (!parent || !parent.children || parent.children.length === 0) return false
        
        return parent.children.some(id => isDescendant(id, childId))
      }
      
      if (isDescendant(noteId, newParentId)) {
        console.warn(`Cannot move note: would create circular reference`);
        return;
      }
    }
    
    // Procedi con lo spostamento
    setNotes(prevNotes => 
      prevNotes.map(note => 
        note.id === noteId 
          ? { ...note, parent: newParentId } 
          : note
      )
    );
  }
  
  const addTag = (noteId, tag) => {
    const updatedNotes = notes.map(note => {
      if (note.id === noteId) {
        const tags = note.tags || []
        if (!tags.includes(tag)) {
          return {
            ...note,
            tags: [...tags, tag],
            updatedAt: new Date().toISOString()
          }
        }
      }
      return note
    })
    setNotes(updatedNotes)
  }
  
  const removeTag = (noteId, tag) => {
    const updatedNotes = notes.map(note => {
      if (note.id === noteId) {
        return {
          ...note,
          tags: (note.tags || []).filter(t => t !== tag),
          updatedAt: new Date().toISOString()
        }
      }
      return note
    })
    setNotes(updatedNotes)
  }
  
  const searchNotes = (query) => {
    if (!query) return notes
    
    return notes.filter(note => 
      note.title.toLowerCase().includes(query.toLowerCase()) ||
      note.content.toLowerCase().includes(query.toLowerCase()) ||
      (note.tags && note.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())))
    )
  }
  
  const filteredNotes = searchQuery ? searchNotes(searchQuery) : notes
  
  return (
    <div className="notepad-container">
      {isMobile && (
        <button 
          className={`sidebar-toggle d-md-none ${sidebarOpen ? 'hidden' : ''}`}
          onClick={() => setSidebarOpen(true)}
          aria-label="Toggle sidebar"
        >
          <FiMenu />
        </button>
      )}
      
      <div 
        className={`sidebar-col ${isMobile ? (sidebarOpen ? 'show' : '') : ''}`}
      >
        <Sidebar 
          notes={notes}
          filteredNotes={filteredNotes}
          activeNoteId={activeNoteId}
          setActiveNoteId={setActiveNoteId}
          createNote={createNote}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          theme={theme}
          toggleTheme={toggleTheme}
          moveNote={moveNote}
          closeSidebar={() => isMobile && setSidebarOpen(false)}
          isOpen={sidebarOpen}
        />
      </div>
      
      {isMobile && sidebarOpen && (
        <div 
          className={`sidebar-overlay d-md-none ${sidebarOpen ? 'show' : ''}`} 
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}
      
      <div className={`content-area ${!isMobile && sidebarOpen ? 'with-sidebar' : ''}`}>
        <Routes>
          <Route path="/" element={
            <div className="welcome-screen">
              <h1>Benvenuto nel tuo Advanced Notepad</h1>
              <p>Seleziona una nota dalla barra laterale o crea una nuova nota per iniziare.</p>
              <button className="btn btn-primary" onClick={() => createNote()}>Crea Nuova Nota</button>
            </div>
          } />
          <Route path="/note/:id" element={
            <NoteEditor 
              notes={notes}
              updateNote={updateNote}
              deleteNote={deleteNote}
              addTag={addTag}
              removeTag={removeTag}
              createNote={createNote}
            />
          } />
        </Routes>
      </div>
    </div>
  )
}

const NoteEditor = ({ notes, updateNote, deleteNote, addTag, removeTag, createNote }) => {
  const { id } = useParams()
  const note = notes.find(note => note.id === id)
  
  if (!note) {
    return (
      <div className="note-not-found d-flex align-items-center justify-content-center h-100">
        <div className="text-center">
          <h3>Nota non trovata</h3>
          <p className="text-muted">La nota che stai cercando potrebbe essere stata eliminata o spostata.</p>
          <Button variant="primary" onClick={() => window.history.back()}>Torna indietro</Button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="d-flex flex-column h-100">
      <Toolbar 
        note={note}
        updateNote={updateNote}
        deleteNote={deleteNote}
        addTag={addTag}
        removeTag={removeTag}
        createNote={createNote}
      />
      <div className="flex-grow-1 overflow-hidden">
        <Editor 
          note={note}
          updateNote={updateNote}
        />
      </div>
    </div>
  )
}

export default Notepad