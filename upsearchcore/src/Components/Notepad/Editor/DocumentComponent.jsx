import React, { useState, useEffect, useRef } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { FiFile, FiEye, FiTrash2, FiMove, FiDownload, FiAlertTriangle, FiZoomIn, FiZoomOut, FiRotateCw, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { Modal, Button } from 'react-bootstrap'
import './DocumentComponent.css'

const DocumentComponent = ({ node, updateAttributes, editor, getPos }) => {
  const [showModal, setShowModal] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const viewerRef = useRef(null)
  
  const { fileName, fileType, fileSize, fileContent } = node.attrs
  
  // Resetta lo zoom e la rotazione quando il modale viene aperto
  useEffect(() => {
    if (showModal) {
      setZoomLevel(1)
      setRotation(0)
      setCurrentPage(1)
      setIsLoading(true)
      setPdfError(null)
      
      // Imposta il focus sul contenitore del visualizzatore
      if (viewerRef.current) {
        viewerRef.current.focus()
      }
    }
  }, [showModal])
  
  // Gestisce i tasti per la navigazione e lo zoom
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!showModal) return
      
      switch (e.key) {
        case 'ArrowRight':
          if (currentPage < totalPages) {
            setCurrentPage(prev => prev + 1)
          }
          break
        case 'ArrowLeft':
          if (currentPage > 1) {
            setCurrentPage(prev => prev - 1)
          }
          break
        case '+':
          handleZoomIn()
          break
        case '-':
          handleZoomOut()
          break
        case 'Escape':
          if (isFullscreen) {
            toggleFullscreen()
          } else {
            setShowModal(false)
          }
          break
        default:
          break
      }
    }
    
    if (showModal) {
      document.addEventListener('keydown', handleKeyDown)
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showModal, currentPage, totalPages, zoomLevel, isFullscreen])
  
  // Gestisce il fullscreen
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
    
    // Previeni lo scrolling del documento quando in fullscreen
    if (!isFullscreen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  }
  
  // Funzioni per lo zoom
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 3))
  }
  
  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5))
  }
  
  // Funzione per la rotazione
  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360)
  }
  
  // Funzione per cambiare pagina
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
    }
  }
  
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
  
  const getFileIcon = () => {
    if (fileType.includes('image')) {
      return <img 
        src={fileContent} 
        alt={fileName} 
        className="document-preview-image" 
      />
    }
    
    // Icone specifiche per diversi tipi di file
    if (fileType.includes('pdf')) {
      return <div className="file-icon pdf-icon">PDF</div>
    } else if (fileType.includes('word') || fileType.includes('document')) {
      return <div className="file-icon doc-icon">DOC</div>
    } else if (fileType.includes('excel') || fileType.includes('sheet')) {
      return <div className="file-icon xls-icon">XLS</div>
    } else if (fileType.includes('powerpoint') || fileType.includes('presentation')) {
      return <div className="file-icon ppt-icon">PPT</div>
    } else if (fileType.includes('text')) {
      return <div className="file-icon txt-icon">TXT</div>
    }
    
    return <FiFile size={24} />
  }
  
  const handleViewDocument = (e) => {
    e.stopPropagation();
    console.log("Apertura modale per il documento:", {
      fileName,
      fileType,
      fileSize,
      fileContentType: typeof fileContent,
      fileContentPreview: typeof fileContent === 'string' 
        ? fileContent.substring(0, 100) + '...' 
        : 'Non visualizzabile'
    });
    setShowModal(true);
  }
  
  const handleRemoveDocument = (e) => {
    e.stopPropagation()
    if (window.confirm('Sei sicuro di voler rimuovere questo documento?')) {
      if (editor && typeof getPos === 'function') {
        editor.commands.deleteNode('document')
      }
    }
  }
  
  const handleDragStart = (e) => {
    if (e.dataTransfer) {
      e.dataTransfer.setData('application/document-block', JSON.stringify({
        id: node.attrs.id,
        type: 'document'
      }))
      e.dataTransfer.effectAllowed = 'move'
      
      setTimeout(() => {
        setIsDragging(true)
      }, 0)
    }
  }
  
  const handleDragEnd = () => {
    setIsDragging(false)
  }
  
  function onDocumentLoadSuccess({ numPages }) {
    setTotalPages(numPages);
    setCurrentPage(1);
    setIsLoading(false);
  }
  
  function onDocumentLoadError(error) {
    console.error("Errore nel caricamento del PDF:", error);
    setPdfError(error);
    setIsLoading(false);
  }
  
  const getPdfSource = () => {
    try {
      if (typeof fileContent === 'string') {
        if (fileContent.startsWith('data:') || fileContent.startsWith('http')) {
          // Se è già un URL o un Data URL, usalo direttamente
          return { url: fileContent };
        } else {
          // Se è una stringa ma non un URL, assumiamo che sia base64
          // Creiamo un Blob dal base64 per una migliore compatibilità
          const binaryString = atob(fileContent);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes.buffer], { type: 'application/pdf' });
          return { url: URL.createObjectURL(blob) };
        }
      } else if (fileContent instanceof ArrayBuffer) {
        // Se è un ArrayBuffer, convertilo in Blob
        const blob = new Blob([fileContent], { type: 'application/pdf' });
        return { url: URL.createObjectURL(blob) };
      } else {
        throw new Error("Formato PDF non supportato");
      }
    } catch (error) {
      console.error("Errore nella preparazione del PDF:", error);
      setPdfError(error);
      return null;
    }
  };
  
  const renderPDFContent = () => {
    if (!fileContent) {
      return (
        <div className="document-error-container">
          <div className="error-icon">⚠️</div>
          <div className="error-message">Contenuto PDF non disponibile</div>
          <button className="document-download-button" onClick={handleDownload}>
            Scarica il file
          </button>
        </div>
      );
    }

    try {
      // Verifica se il contenuto è un URL o un Data URL
      const isPdfDataUrl = fileContent.startsWith('data:application/pdf');
      const isPdfUrl = fileContent.startsWith('http') && fileContent.toLowerCase().endsWith('.pdf');
      
      if (isPdfDataUrl || isPdfUrl) {
        return (
          <div className="document-pdf-container">
            <iframe
              src={fileContent}
              title={fileName}
              className="document-pdf-viewer"
              width="100%"
              height="100%"
            />
            <div className="pdf-navigation">
              <button 
                className="pdf-nav-btn" 
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                Precedente
              </button>
              <div className="pdf-page-indicator">
                Pagina <input 
                  type="number" 
                  className="pdf-page-input" 
                  value={currentPage} 
                  onChange={(e) => handlePageChange(parseInt(e.target.value))}
                  min="1" 
                  max={totalPages || 1} 
                /> di {totalPages || 1}
              </div>
              <button 
                className="pdf-nav-btn" 
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= (totalPages || 1)}
              >
                Successiva
              </button>
            </div>
          </div>
        );
      } else {
        // Fallback per contenuti PDF non standard
        return (
          <div className="document-error-container">
            <div className="error-icon">⚠️</div>
            <div className="error-message">Formato PDF non supportato</div>
            <button className="document-download-button" onClick={handleDownload}>
              Scarica il file
            </button>
          </div>
        );
      }
    } catch (error) {
      console.error("Errore nel rendering del PDF:", error);
      return (
        <div className="document-error-container">
          <div className="error-icon">⚠️</div>
          <div className="error-message">Errore nel caricamento del PDF</div>
          <button className="document-download-button" onClick={handleDownload}>
            Scarica il file
          </button>
        </div>
      );
    }
  };
  
  const renderDocumentContent = () => {
    if (!fileContent) {
      console.error("Contenuto del file non disponibile:", fileName);
      return <p className="error-message">Contenuto non disponibile</p>;
    }
    
    try {
      if (fileType.includes('image')) {
        // Assicuriamoci che il contenuto sia un URL valido
        const imgSrc = fileContent.startsWith('data:') || fileContent.startsWith('http') 
                      ? fileContent 
                      : `data:${fileType};base64,${fileContent}`;
        
        return (
          <div className="document-image-container">
            <img 
              src={imgSrc} 
              alt={fileName} 
              className="document-modal-image" 
              onError={(e) => {
                console.error("Errore nel caricamento dell'immagine:", fileName);
                e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23d63031' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/%3E%3Cline x1='12' y1='9' x2='12' y2='13'/%3E%3Cline x1='12' y1='17' x2='12.01' y2='17'/%3E%3C/svg%3E";
                e.target.className = "error-image";
              }}
            />
          </div>
        );
      }
      
      if (fileType.includes('text') || fileType.includes('json') || fileType.includes('xml') || 
          fileType.includes('javascript') || fileType.includes('html') || fileType.includes('css')) {
        // Per i file di testo, assicuriamoci che il contenuto sia una stringa
        let textContent;
        
        if (typeof fileContent === 'string') {
          // Se è già una stringa, usala direttamente
          textContent = fileContent;
        } else if (fileContent instanceof ArrayBuffer) {
          // Se è un ArrayBuffer, convertilo in stringa
          textContent = new TextDecoder().decode(fileContent);
        } else if (typeof fileContent === 'object') {
          // Se è un oggetto, convertilo in JSON
          textContent = JSON.stringify(fileContent, null, 2);
        } else {
          // Fallback
          textContent = String(fileContent);
        }
        
        return (
          <div className="document-text-container">
            <pre className="document-text-content">{textContent}</pre>
          </div>
        );
      }
      
      if (fileType.includes('pdf')) {
        return renderPDFContent();
      }
      
      // Per altri tipi di file
      return (
        <div className="document-generic-container">
          <div className="file-type-icon">
            <FiFile size={48} />
            <span className="file-extension">{fileType.split('/')[1]?.toUpperCase() || 'FILE'}</span>
          </div>
          <p className="mt-3">Anteprima non disponibile per questo tipo di file</p>
          <button 
            onClick={handleDownload}
            className="document-download-button"
          >
            <FiDownload className="me-2" /> Scarica il file
          </button>
        </div>
      );
    } catch (error) {
      console.error("Errore nel rendering del documento:", error);
      return (
        <div className="document-error-container">
          <div className="error-icon">
            <FiAlertTriangle size={48} />
          </div>
          <p className="error-message">Si è verificato un errore durante la visualizzazione del documento.</p>
          <p className="error-details">{error.message}</p>
          <button 
            onClick={handleDownload}
            className="document-download-button"
          >
            <FiDownload className="me-2" /> Prova a scaricare il file
          </button>
        </div>
      );
    }
  };
  
  const handleDownload = (e) => {
    e.stopPropagation();
    
    try {
      let downloadUrl;
      
      if (typeof fileContent === 'string' && (fileContent.startsWith('data:') || fileContent.startsWith('http'))) {
        // Se è già un URL o un Data URL, usalo direttamente
        downloadUrl = fileContent;
      } else if (typeof fileContent === 'string') {
        // Se è una stringa ma non un URL, assumiamo che sia base64
        downloadUrl = `data:${fileType || 'application/octet-stream'};base64,${fileContent}`;
      } else if (fileContent instanceof ArrayBuffer) {
        // Se è un ArrayBuffer, convertilo in base64
        const base64 = btoa(
          new Uint8Array(fileContent)
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        downloadUrl = `data:${fileType || 'application/octet-stream'};base64,${base64}`;
      } else if (typeof fileContent === 'object') {
        // Se è un oggetto, convertilo in JSON
        const blob = new Blob([JSON.stringify(fileContent, null, 2)], { type: 'application/json' });
        downloadUrl = URL.createObjectURL(blob);
      } else {
        // Fallback
        const blob = new Blob([String(fileContent)], { type: 'text/plain' });
        downloadUrl = URL.createObjectURL(blob);
      }
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Se abbiamo creato un URL.createObjectURL, rilasciamolo
      if (downloadUrl.startsWith('blob:')) {
        URL.revokeObjectURL(downloadUrl);
      }
      
      // Feedback tattile su dispositivi mobili
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    } catch (error) {
      console.error("Errore durante il download del file:", error);
      alert("Si è verificato un errore durante il download del file: " + error.message);
    }
  };
  
  return (
    <NodeViewWrapper 
      className={`document-component ${isDragging ? 'dragging' : ''}`}
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="document-container" onClick={handleViewDocument}>
        <div className="document-icon">
          {getFileIcon()}
        </div>
        <div className="document-info">
          <div className="document-name">{fileName}</div>
          <div className="document-meta">
            {formatFileSize(fileSize)} • {fileType.split('/')[1]?.toUpperCase() || fileType}
          </div>
        </div>
        <div className="document-actions">
          <button 
            className="document-action-btn view-btn" 
            onClick={handleViewDocument}
            title="Visualizza documento"
          >
            <FiEye />
          </button>
          <button 
            className="document-action-btn delete-btn" 
            onClick={handleRemoveDocument}
            title="Elimina documento"
          >
            <FiTrash2 />
          </button>
        </div>
        <div className="drag-handle">
          <FiMove />
        </div>
      </div>
      
      <Modal 
        show={showModal} 
        onHide={() => {
          setShowModal(false)
          setIsFullscreen(false)
          document.body.style.overflow = ''
        }} 
        size="lg" 
        centered
        fullscreen={isFullscreen}
        className={`document-modal ${isFullscreen ? 'fullscreen' : ''}`}
      >
        <Modal.Header closeButton>
          <Modal.Title>{fileName}</Modal.Title>
          <div className="document-controls">
            <button 
              className="document-control-btn" 
              onClick={handleZoomIn}
              title="Zoom in"
            >
              <FiZoomIn />
            </button>
            <button 
              className="document-control-btn" 
              onClick={handleZoomOut}
              title="Zoom out"
            >
              <FiZoomOut />
            </button>
            <button 
              className="document-control-btn" 
              onClick={handleRotate}
              title="Ruota"
            >
              <FiRotateCw />
            </button>
            <button 
              className="document-control-btn" 
              onClick={toggleFullscreen}
              title={isFullscreen ? "Esci da schermo intero" : "Schermo intero"}
            >
              {isFullscreen ? "Esci" : "Schermo intero"}
            </button>
          </div>
        </Modal.Header>
        <Modal.Body>
          <div 
            className="document-viewer-container" 
            ref={viewerRef}
            tabIndex={0} // Per permettere il focus e la gestione dei tasti
          >
            {renderDocumentContent()}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button 
            variant="primary" 
            onClick={handleDownload}
            className="download-btn"
          >
            <FiDownload className="me-2" /> Scarica
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => {
              setShowModal(false)
              setIsFullscreen(false)
              document.body.style.overflow = ''
            }}
          >
            Chiudi
          </Button>
        </Modal.Footer>
      </Modal>
    </NodeViewWrapper>
  )
}

export default DocumentComponent 