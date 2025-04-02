import React, { useState, useRef, useEffect } from 'react'
import { Container, Row, Col, Button, Form, Dropdown } from 'react-bootstrap'
import { FiMenu, FiSave, FiTrash2, FiDownload, FiTag, FiX, FiCheck, FiPlus } from 'react-icons/fi'
import './Toolbar.css'
import { toast } from '../../../utils/notification'
import { CacheService } from '../../../utils/cache'

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
  contentChanged = false,
  onContentChange
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
    const newTitle = e.target.value;
    setTitle(newTitle);
    
    // Aggiorna temporaneamente il titolo nella nota attiva
    // Questa modifica sarà visibile nella sidebar senza attendere il salvataggio
    if (note) {
      // Aggiorna in tempo reale il titolo nella sidebar
      const updatedNote = { ...note, title: newTitle };
      
      // Salva il titolo nella bozza in sessionStorage (verrà usato poi per il salvataggio)
      CacheService.saveDraft(note.id, note.content, newTitle);
      
      // Simuliamo un evento personalizzato per aggiornare il titolo nella sidebar
      const titleChangeEvent = new CustomEvent('noteTitleChanged', {
        detail: { noteId: note.id, newTitle }
      });
      window.dispatchEvent(titleChangeEvent);
    }
  }
  
  const handleTitleBlur = async () => {
    if (note && title !== note.title) {
      setLoading(true);
      try {
        await updateNote(note.id, { title });
        toast.success('Titolo aggiornato con successo');
      } catch (error) {
        console.error('Errore durante l\'aggiornamento del titolo:', error);
        // Ripristina il titolo originale in caso di errore
        setTitle(note.title || '');
        
        if (!navigator.onLine) {
          toast.warning('Impossibile aggiornare il titolo in modalità offline. Le modifiche saranno salvate quando tornerai online.');
        } else {
          toast.error('Errore durante l\'aggiornamento del titolo. Riprova più tardi.');
        }
      } finally {
        setLoading(false);
      }
    }
  }
  
  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.target.blur()
    }
  }
  
  const handleSaveNote = async () => {
    if (!note || loading) return;
    
    // Verifica se il contenuto è cambiato o se esiste una bozza
    if (!contentChanged && !CacheService.hasDraft(note.id)) {
      toast.info('Nessuna modifica da salvare');
      return;
    }
    
    setLoading(true);
    
    try {
      // Prepara l'oggetto di aggiornamento
      const updateData = {
        updatedAt: new Date().toISOString()
      };
      
      // Recupera bozza dal sessionStorage
      const draft = CacheService.getDraft(note.id);
      let contentToSave = null;
      
      if (draft) {
        // Controlla che ci sia effettivamente del contenuto da salvare
        if (draft.content && typeof draft.content === 'string') {
          // Limita la dimensione del contenuto per evitare problemi col server
          if (draft.content.length > 1000000) { // 1MB limite
            console.warn('Contenuto troppo grande, troncato per evitare errori');
            contentToSave = draft.content.substring(0, 1000000);
            toast.warning('Il contenuto è stato troncato perché troppo grande');
          } else {
            contentToSave = draft.content;
          }
          
          // Verifica che il contenuto non sia solo HTML vuoto o spazi
          const htmlStripped = contentToSave.replace(/<[^>]*>/g, '').trim();
          if (htmlStripped === '') {
            // Il contenuto è solo HTML vuoto, salva un contenuto minimo
            contentToSave = '<p></p>';
          }
          
          // Sanitizza nuovamente prima di inviare al server
          contentToSave = CacheService.sanitizeHtml(contentToSave);
          
          // Assegna il contenuto all'oggetto updateData
          updateData.content = contentToSave;
          
          // Se c'è anche il titolo nella bozza
          if (draft.title) {
            // Assicurati che il titolo non sia troppo lungo
            updateData.title = draft.title.substring(0, 255);
          }
        }
      }
      
      // Se il titolo corrente è diverso, aggiornalo
      if (title !== note.title) {
        updateData.title = title.substring(0, 255); // Limita lunghezza titolo
      }
      
      // Se non ci sono dati da aggiornare
      if (Object.keys(updateData).length <= 1) { // Solo updatedAt è presente
        setLoading(false);
        toast.info('Nessuna modifica da salvare');
        return;
      }
      
      // Log per debug
      console.log('Salvataggio nota con dimensione contenuto:', 
        updateData.content ? updateData.content.length : 0, 'caratteri');
      
      // Prima di salvare, verifica il token CSRF
      let csrfToken = CacheService.getCsrfToken();
      if (!csrfToken) {
        console.log('Token CSRF mancante, ottengo un nuovo token prima del salvataggio');
        try {
          if (typeof getCsrfToken === 'function') {
            await getCsrfToken(true);
          }
        } catch (err) {
          console.error('Errore ottenendo CSRF token:', err);
        }
      }
      
      // Effettua la chiamata di aggiornamento API con gestione errori migliorata
      let updatedNote = null;
      try {
        updatedNote = await updateNote(note.id, updateData);
      } catch (error) {
        // Gestisci in modo specifico l'errore 500
        if (error.response && error.response.status === 500) {
          console.error('Errore 500 dal server durante il salvataggio, provo una strategia alternativa');
          
          // Tenta di inviare solo il titolo se il contenuto è il problema
          if (updateData.content) {
            try {
              const titleOnlyUpdate = {
                title: updateData.title || note.title,
                updatedAt: updateData.updatedAt
              };
              console.log('Tentativo di aggiornare solo il titolo');
              updatedNote = await updateNote(note.id, titleOnlyUpdate);
              toast.warning('Contenuto non salvato a causa di un errore del server. Solo il titolo è stato aggiornato.');
              // Non rimuovere la bozza qui, in modo che l'utente possa riprovare più tardi
            } catch (titleError) {
              console.error('Anche l\'aggiornamento del solo titolo è fallito:', titleError);
              throw error; // Propaga l'errore originale
            }
          } else {
            throw error; // Propaga l'errore se non c'è contenuto
          }
        } else {
          throw error; // Propaga altri tipi di errore
        }
      }
      
      // Se il salvataggio è riuscito, rimuovi la bozza
      if (updatedNote) {
        CacheService.removeDraft(note.id);
        
        // Visualizza una notifica di successo
        toast.success('Nota salvata con successo');
        
        // Aggiorna lo stato delle modifiche
        if (contentChanged && typeof onContentChange === 'function') {
          onContentChange(false);
        }
        
        // Notifica il salvataggio completo
        if (onSave && typeof onSave === 'function') {
          onSave(updatedNote);
        }
        
        return updatedNote;
      }
    } catch (error) {
      console.error('Errore durante il salvataggio:', error);
      
      if (!navigator.onLine) {
        toast.warning('Sei offline. Le modifiche sono state salvate localmente e verranno sincronizzate quando tornerai online.');
        // Assicuriamoci che la bozza sia salvata
        return null;
      } else {
        toast.error('Errore durante il salvataggio. La bozza è stata conservata e puoi riprovare più tardi.');
        return null;
      }
    } finally {
      setLoading(false);
    }
  };
  
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

  const ConnectionStatus = ({ isOffline, lastSyncTime }) => {
    const [dots, setDots] = useState('.');
    
    useEffect(() => {
      if (isOffline) {
        const interval = setInterval(() => {
          setDots(prev => prev.length < 3 ? prev + '.' : '.');
        }, 500);
        return () => clearInterval(interval);
      }
    }, [isOffline]);
    
    if (isOffline) {
      return (
        <div className="connection-status offline">
          <span className="status-icon">🔴</span>
          <span className="status-text">Offline{dots}</span>
        </div>
      );
    }
    
    return (
      <div className="connection-status online">
        <span className="status-icon">🟢</span>
        <span className="status-text">
          Online {lastSyncTime && `(Ultimo salvataggio: ${formatTimestamp(lastSyncTime)})`}
        </span>
      </div>
    );
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
            
            {note && note.temporary && (
              <span className="badge bg-warning ms-2">Versione locale</span>
            )}
            
            {note && note.isTutorial && (
              <span className="badge bg-success ms-2">Tutorial</span>
            )}
          </Col>
          
          <Col xs="auto" className="toolbar-right d-flex align-items-center">
            <div className="toolbar-actions d-flex">
              <Button 
                variant="link" 
                className={`toolbar-btn save-btn ${contentChanged ? 'unsaved' : ''}`} 
                onClick={handleSaveNote}
                disabled={loading || !note}
                title={loading ? 'Salvataggio in corso...' : 'Salva nota'}
              >
                {loading ? (
                  <div className="spinner-border spinner-border-sm" role="status">
                    <span className="visually-hidden">Salvataggio in corso...</span>
                  </div>
                ) : (
                  <FiSave />
                )}
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
                  <Dropdown.Item onClick={exportNoteAsHtml}>Esporta come HTML</Dropdown.Item>
                  <Dropdown.Item onClick={exportNoteAsPdf}>Esporta come PDF</Dropdown.Item>
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
            
            <div className="toolbar-status">
              <ConnectionStatus isOffline={isOffline} lastSyncTime={lastSyncTime} />
              {isOffline && contentChanged && (
                <div className="pending-changes">
                  <span className="badge bg-warning">Modifiche in attesa di sincronizzazione</span>
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  )
}

export default Toolbar