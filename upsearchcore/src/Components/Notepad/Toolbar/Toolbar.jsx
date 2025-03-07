import { useState } from 'react'
import { FiSave, FiTrash2, FiShare2, FiTag, FiDownload, FiUpload, FiPlus } from 'react-icons/fi'
import { Form, Button, Modal, InputGroup } from 'react-bootstrap'
import { jsPDF } from 'jspdf'
import { marked } from 'marked'
import './Toolbar.css'

const Toolbar = ({ note, updateNote, deleteNote, addTag, removeTag, createNote }) => {
  const [showTagInput, setShowTagInput] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [showShareModal, setShowShareModal] = useState(false)
  
  const handleTitleChange = (e) => {
    updateNote(note.id, { title: e.target.value })
  }
  
  const handleAddTag = () => {
    if (newTag.trim()) {
      addTag(note.id, newTag.trim())
      setNewTag('')
      setShowTagInput(false)
    }
  }
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleAddTag()
    }
  }
  
  const handleExportMarkdown = () => {
    // Converti il contenuto HTML in Markdown
    const tempElement = document.createElement('div')
    tempElement.innerHTML = note.content
    
    // Crea un blob e un link per il download
    const blob = new Blob([tempElement.textContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${note.title}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  const handleExportPDF = () => {
    const doc = new jsPDF()
    
    // Converti il contenuto HTML in testo semplice per il PDF
    const tempElement = document.createElement('div')
    tempElement.innerHTML = note.content
    
    doc.text(note.title, 20, 20)
    doc.text(tempElement.textContent, 20, 30)
    doc.save(`${note.title}.pdf`)
  }
  
  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target.result
      
      // Crea una nuova nota con il contenuto importato
      const newNote = createNote(note.parent)
      
      // Aggiorna il titolo e il contenuto
      const fileName = file.name.replace(/\.[^/.]+$/, "") // Rimuovi l'estensione
      updateNote(newNote.id, { 
        title: fileName,
        content: `<p>${content}</p>` // Converti in HTML semplice
      })
    }
    
    reader.readAsText(file)
  }
  
  const handleShare = () => {
    setShowShareModal(true)
  }
  
  const generateShareLink = () => {
    // In un'applicazione reale, questo genererebbe un link condivisibile
    // Per ora, creiamo un link fittizio
    return `${window.location.origin}/shared/${note.id}`
  }
  
  return (
    <div className="toolbar">
      <div className="container-fluid">
        <div className="toolbar-row">
          <div className="toolbar-left">
            <Form.Control
              type="text"
              value={note.title}
              onChange={handleTitleChange}
              className="note-title-input border-0 bg-transparent fw-bold"
              placeholder="Titolo della nota"
            />
            
            <div className="tags-container">
              {note.tags && note.tags.map(tag => (
                <div key={tag} className="tag">
                  <span>{tag}</span>
                  <Button 
                    variant="link"
                    className="remove-tag-btn"
                    onClick={() => removeTag(note.id, tag)}
                    aria-label="Rimuovi tag"
                  >
                    &times;
                  </Button>
                </div>
              ))}
              
              {showTagInput ? (
                <div className="tag-input-container d-flex align-items-center flex-wrap">
                  <Form.Control
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Nuovo tag"
                    autoFocus
                    className="tag-input me-1 mb-1"
                    size="sm"
                  />
                  <div className="d-flex mt-1 mt-sm-0">
                    <Button 
                      variant="outline-primary" 
                      size="sm" 
                      onClick={handleAddTag}
                      className="me-1"
                    >
                      Aggiungi
                    </Button>
                    <Button 
                      variant="outline-secondary" 
                      size="sm" 
                      onClick={() => setShowTagInput(false)}
                    >
                      Annulla
                    </Button>
                  </div>
                </div>
              ) : (
                <Button 
                  variant="dark"
                  className="toolbar-btn p-1 d-flex align-items-center justify-content-center"
                  onClick={() => setShowTagInput(true)}
                  title="Aggiungi tag"
                >
                  <FiTag />
                </Button>
              )}
            </div>
          </div>
          
          <div className="toolbar-right d-none d-md-flex">
            <Button 
              variant="dark"
              className="toolbar-btn p-1 d-flex align-items-center justify-content-center"
              onClick={() => createNote(note.id)}
              title="Crea sotto-nota"
            >
              <FiPlus />
            </Button>
            
            <Button 
              variant="dark"
              className="toolbar-btn p-1 d-flex align-items-center justify-content-center"
              onClick={handleShare}
              title="Condividi"
            >
              <FiShare2 />
            </Button>
            
            <div className="export-dropdown">
              <Button 
                variant="dark"
                className="toolbar-btn p-1 d-flex align-items-center justify-content-center"
                title="Esporta"
              >
                <FiDownload />
              </Button>
              <div className="export-dropdown-content">
                <Button 
                  variant="link" 
                  className="w-100 text-start"
                  onClick={handleExportMarkdown}
                >
                  Esporta come Markdown
                </Button>
                <Button 
                  variant="link" 
                  className="w-100 text-start"
                  onClick={handleExportPDF}
                >
                  Esporta come PDF
                </Button>
              </div>
            </div>
            
            <div className="import-container">
              <label htmlFor="file-import" className="toolbar-btn btn btn-light p-1 m-0 d-flex align-items-center justify-content-center" title="Importa">
                <FiUpload />
              </label>
              <input
                id="file-import"
                type="file"
                accept=".md,.txt"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
            </div>
            
            <Button 
              variant="dark"
              className="toolbar-btn delete-btn p-1 d-flex align-items-center justify-content-center"
              onClick={() => {
                if (window.confirm('Sei sicuro di voler eliminare questa nota? Questa azione non può essere annullata.')) {
                  deleteNote(note.id)
                }
              }}
              title="Elimina"
            >
              <FiTrash2 />
            </Button>
          </div>
          
          <div className="toolbar-buttons-container d-flex d-md-none">
            <Button 
              variant="dark"
              className="toolbar-btn p-1 d-flex align-items-center justify-content-center"
              onClick={() => createNote(note.id)}
              title="Crea sotto-nota"
            >
              <FiPlus />
            </Button>
            
            <Button 
              variant="dark"
              className="toolbar-btn p-1 d-flex align-items-center justify-content-center"
              onClick={handleShare}
              title="Condividi"
            >
              <FiShare2 />
            </Button>
            
            <div className="export-dropdown">
              <Button 
                variant="dark"
                className="toolbar-btn p-1 d-flex align-items-center justify-content-center"
                title="Esporta"
              >
                <FiDownload />
              </Button>
              <div className="export-dropdown-content">
                <Button 
                  variant="link" 
                  className="w-100 text-start"
                  onClick={handleExportMarkdown}
                >
                  Esporta come Markdown
                </Button>
                <Button 
                  variant="link" 
                  className="w-100 text-start"
                  onClick={handleExportPDF}
                >
                  Esporta come PDF
                </Button>
              </div>
            </div>
            
            <div className="import-container">
              <label htmlFor="file-import-mobile" className="toolbar-btn btn btn-light p-1 m-0 d-flex align-items-center justify-content-center" title="Importa">
                <FiUpload />
              </label>
              <input
                id="file-import-mobile"
                type="file"
                accept=".md,.txt"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
            </div>
            
            <Button 
              variant="dark"
              className="toolbar-btn delete-btn p-1 d-flex align-items-center justify-content-center"
              onClick={() => {
                if (window.confirm('Sei sicuro di voler eliminare questa nota? Questa azione non può essere annullata.')) {
                  deleteNote(note.id)
                }
              }}
              title="Elimina"
            >
              <FiTrash2 />
            </Button>
          </div>
        </div>
      </div>
      
      <Modal show={showShareModal} onHide={() => setShowShareModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Condividi Nota</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Usa questo link per condividere la tua nota:</p>
          <InputGroup className="mb-3">
            <Form.Control
              type="text"
              value={generateShareLink()}
              readOnly
            />
            <Button
              variant="primary"
              onClick={() => {
                navigator.clipboard.writeText(generateShareLink())
                alert('Link copiato negli appunti!')
              }}
            >
              Copia
            </Button>
          </InputGroup>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowShareModal(false)}>
            Chiudi
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

export default Toolbar