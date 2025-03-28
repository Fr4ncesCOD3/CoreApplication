import React, { useState, useRef, useEffect } from 'react'
import { Container, Row, Col, Button, Form, Dropdown } from 'react-bootstrap'
import { FiMenu, FiSave, FiTrash2, FiDownload, FiTag, FiX, FiCheck, FiPlus } from 'react-icons/fi'
import './Toolbar.css'
import { toast } from '../../../utils/notification'

const Toolbar = ({ 
  note, 
  updateNote, 
  deleteNote, 
  addTag, 
  removeTag, 
  createNote, 
  onSave,
  toggleSidebar,
  lastSyncTime,
  isOffline,
  contentChanged = false
}) => {
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)
  const [loading, setLoading] = useState(false)
  const tagInputRef = useRef(null)
  
  useEffect(() => {
    if (note) {
      setTitle(note.title || '')
      setTags(note.tags || [])
    }
  }, [note])
  
  // Focus sul campo di input tag quando viene mostrato
  useEffect(() => {
    if (showAddTag && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [showAddTag])
  
  const handleTitleChange = (e) => {
    const newTitle = e.target.value
    setTitle(newTitle)
  }
  
  const handleTitleBlur = () => {
    if (note && title !== note.title) {
      updateNote(note.id, { title })
    }
  }
  
  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.target.blur()
    }
  }
  
  const handleSaveNote = async () => {
    if (!note) return
    
    setLoading(true)
    try {
      await onSave()
      toast.success('Nota salvata con successo')
    } catch (error) {
      toast.error('Errore durante il salvataggio della nota')
    } finally {
      setLoading(false)
    }
  }
  
  const handleDeleteNote = async () => {
    if (!note) return
    
    try {
      const confirmed = await deleteNote(note.id)
      if (confirmed) {
        toast.success('Nota eliminata con successo')
      }
    } catch (error) {
      toast.error('Errore durante l\'eliminazione della nota')
    }
  }
  
  const handleTagSubmit = (e) => {
    e.preventDefault()
    
    if (tagInput.trim() && note) {
      addTag(note.id, tagInput.trim())
      setTagInput('')
      setShowAddTag(false)
    }
  }
  
  const handleRemoveTag = (tag) => {
    if (note) {
      removeTag(note.id, tag)
    }
  }
  
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return ''
    
    const date = new Date(timestamp)
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  const exportNoteAsText = () => {
    if (!note) return
    
    const content = note.content || ''
    const textContent = content // Estrai il testo dal contenuto JSON o HTML
    
    const blob = new Blob([textContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = `${note.title || 'Nota'}.txt`
    document.body.appendChild(a)
    a.click()
    
    // Pulizia
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
  }
  
  const shareNote = () => {
    if (!note) return;
    
    // Crea un URL per la condivisione diretta
    const shareUrl = `${window.location.origin}/note/${note.id}`;
    
    // Prova a usare l'API di condivisione nativa se disponibile
    if (navigator.share) {
      navigator.share({
        title: note.title || 'Nota condivisa',
        text: 'Dai un\'occhiata a questa nota',
        url: shareUrl,
      })
      .catch((error) => {
        console.error('Errore nella condivisione:', error);
        // Fallback: copia negli appunti
        copyToClipboard(shareUrl);
      });
    } else {
      // Se l'API Share non è disponibile, copia l'URL negli appunti
      copyToClipboard(shareUrl);
    }
  };
  
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        toast.success('Link copiato negli appunti');
      })
      .catch((err) => {
        console.error('Errore nella copia:', err);
        toast.error('Impossibile copiare il link');
      });
  };
  
  return (
    <div className="toolbar">
      <Container fluid>
        <Row className="toolbar-row">
          <Col xs="auto" className="toolbar-left d-flex align-items-center">
            <Button 
              variant="link" 
              className="toolbar-btn menu-btn d-md-none"
              onClick={toggleSidebar}
            >
              <FiMenu />
            </Button>
            
            <Form.Control
              type="text"
              className="note-title-input"
              placeholder="Titolo nota..."
              value={title}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
            />
          </Col>
          
          <Col xs="auto" className="toolbar-right d-flex align-items-center">
            <div className="toolbar-actions d-flex">
              <Button 
                variant="link" 
                className={`toolbar-btn save-btn ${contentChanged ? 'unsaved' : ''}`} 
                onClick={handleSaveNote}
                disabled={loading || !note}
                title="Salva nota"
              >
                <FiSave />
                {contentChanged && <span className="unsaved-indicator"></span>}
              </Button>
              
              <Button 
                variant="link" 
                className="toolbar-btn share-btn" 
                onClick={shareNote}
                disabled={!note}
                title="Condividi nota"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"></circle>
                  <circle cx="6" cy="12" r="3"></circle>
                  <circle cx="18" cy="19" r="3"></circle>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
              </Button>
              
              <Button 
                variant="link" 
                className="toolbar-btn delete-btn" 
                onClick={handleDeleteNote}
                disabled={!note}
                title="Elimina nota"
              >
                <FiTrash2 />
              </Button>
              
              <Dropdown className="export-dropdown">
                <Dropdown.Toggle as={Button} variant="link" className="toolbar-btn">
                  <FiDownload />
                </Dropdown.Toggle>
                
                <Dropdown.Menu>
                  <Dropdown.Item onClick={exportNoteAsText}>Esporta come TXT</Dropdown.Item>
                  <Dropdown.Item onClick={() => exportNoteAsHtml()}>Esporta come HTML</Dropdown.Item>
                  <Dropdown.Item onClick={() => exportNoteAsPdf()}>Esporta come PDF</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
              
              <Button 
                variant="link" 
                className="toolbar-btn" 
                onClick={() => setShowAddTag(!showAddTag)}
                disabled={!note}
                title="Gestisci tag"
              >
                <FiTag />
              </Button>
            </div>
            
            {note && (
              <div className="tags-container d-flex align-items-center flex-wrap">
                {tags.map(tag => (
                  <div key={tag} className="tag">
                    {tag}
                    <button
                      className="remove-tag-btn"
                      onClick={() => handleRemoveTag(tag)}
                      aria-label={`Rimuovi tag ${tag}`}
                    >
                      <FiX />
                    </button>
                  </div>
                ))}
                
                {showAddTag && (
                  <Form onSubmit={handleTagSubmit} className="d-flex">
                    <Form.Control
                      ref={tagInputRef}
                      type="text"
                      className="tag-input"
                      placeholder="Nuovo tag..."
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onBlur={() => setShowAddTag(false)}
                    />
                    <Button variant="link" className="toolbar-btn" type="submit">
                      <FiCheck />
                    </Button>
                  </Form>
                )}
                
                {!showAddTag && tags.length === 0 && (
                  <Button 
                    variant="link" 
                    className="add-tag-btn" 
                    onClick={() => setShowAddTag(true)}
                  >
                    <FiPlus /> Aggiungi tag
                  </Button>
                )}
              </div>
            )}
            
            {lastSyncTime && (
              <div className="sync-info ms-2">
                <small className={`text-muted ${contentChanged ? 'text-warning' : ''}`}>
                  {isOffline ? '🔴 Offline' : (contentChanged ? '🟠 Modificato' : '🟢 Salvato')}
                  {!contentChanged && <span className="ms-1">{formatTimestamp(lastSyncTime)}</span>}
                </small>
              </div>
            )}
          </Col>
        </Row>
      </Container>
    </div>
  )
}

const exportNoteAsHtml = () => {
  if (!note || !note.content) return;
  
  // Crea un documento HTML completo
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${note.title || 'Nota esportata'}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; }
        h1, h2, h3 { margin-top: 20px; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h1>${note.title || 'Nota esportata'}</h1>
      ${note.content}
    </body>
    </html>
  `;
  
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${note.title || 'Nota'}.html`;
  document.body.appendChild(a);
  a.click();
  
  // Pulizia
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

const exportNoteAsPdf = () => {
  if (!note) return;
  
  toast.info('Preparazione PDF in corso...');
  
  // Questo è un approccio semplificato - in produzione potresti voler usare una libreria PDF
  // o un servizio backend per la conversione
  
  const printWindow = window.open('', '_blank');
  
  if (!printWindow) {
    toast.error('Il blocco dei popup ha impedito la generazione del PDF');
    return;
  }
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${note.title || 'Nota esportata'}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        @media print {
          body { margin: 0; padding: 15mm; }
        }
      </style>
    </head>
    <body>
      <h1>${note.title || 'Nota esportata'}</h1>
      ${note.content || ''}
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 500);
        }
      </script>
    </body>
    </html>
  `);
  
  printWindow.document.close();
};

export default Toolbar