import React, { useState, useEffect, useRef } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { FiFile, FiEye, FiTrash2, FiMove, FiDownload, FiAlertTriangle, FiZoomIn, FiZoomOut, FiRotateCw, FiChevronLeft, FiChevronRight, FiFileText, FiImage, FiFilm, FiMusic, FiPackage } from 'react-icons/fi'
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
  
  const formatFileSize = size => {
    if (size < 1024) return size + ' B'
    else if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
    else if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + ' MB'
    else return (size / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }
  
  const getFileIcon = () => {
    const type = fileType.split('/')[0];
    
    switch (type) {
      case 'image':
        return <FiImage size={28} className="document-icon-svg" />;
      case 'video':
        return <FiFilm size={28} className="document-icon-svg" />;
      case 'audio':
        return <FiMusic size={28} className="document-icon-svg" />;
      case 'text':
        return <FiFileText size={28} className="document-icon-svg" />;
      case 'application':
        if (fileType.includes('pdf')) {
          return <FiFileText size={28} className="document-icon-svg pdf" />;
        }
        return <FiPackage size={28} className="document-icon-svg" />;
      default:
        return <FiFile size={28} className="document-icon-svg" />;
    }
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
    document.body.style.overflow = 'hidden'
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
      if (fileType.startsWith('image/')) {
        return (
          <div className="document-preview image-preview">
            <img 
              src={fileContent} 
              alt={fileName} 
              className="document-image" 
              loading="lazy"
            />
          </div>
        )
      } else if (fileType.startsWith('application/pdf')) {
        return (
          <div className="document-preview pdf-preview">
            <iframe 
              src={fileContent} 
              title={fileName} 
              className="pdf-viewer"
              loading="lazy"
            />
            <div className="pdf-fallback">
              <p>Se il PDF non si carica correttamente, puoi scaricarlo usando il pulsante qui sotto.</p>
              <Button 
                onClick={handleDownload}
                className="download-btn"
                variant="primary"
              >
                <FiDownload className="me-2" /> Scarica PDF
              </Button>
            </div>
          </div>
        )
      } else if (fileType.startsWith('text/')) {
        return (
          <div className="document-preview text-preview">
            <pre className="text-content">{fileContent}</pre>
          </div>
        )
      } else if (fileType.startsWith('video/')) {
        return (
          <div className="document-preview video-preview">
            <video 
              src={fileContent} 
              controls 
              className="video-player"
              preload="metadata"
            >
              Il tuo browser non supporta la riproduzione video.
            </video>
          </div>
        )
      } else if (fileType.startsWith('audio/')) {
        return (
          <div className="document-preview audio-preview">
            <audio 
              src={fileContent} 
              controls 
              className="audio-player"
              preload="metadata"
            >
              Il tuo browser non supporta la riproduzione audio.
            </audio>
          </div>
        )
      } else {
        return (
          <div className="document-preview generic-preview">
            <div className="file-icon-large">
              {getFileIcon()}
            </div>
            <p className="file-info">{fileName}</p>
            <Button 
              onClick={handleDownload}
              className="download-btn"
              variant="primary"
            >
              <FiDownload className="me-2" /> Scarica File
            </Button>
          </div>
        )
      }
    } catch (error) {
      console.error("Errore nel rendering del documento:", error);
      return (
        <div className="document-error-container">
          <div className="error-icon">
            <FiAlertTriangle size={48} />
          </div>
          <p className="error-message">Si è verificato un errore durante la visualizzazione del documento.</p>
          <p className="error-details">{error.message}</p>
          <Button 
            onClick={handleDownload}
            className="document-download-button"
            variant="outline-primary"
          >
            <FiDownload className="me-2" /> Prova a scaricare il file
          </Button>
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
        <div className="document-preview-thumbnail">
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
            aria-label="Visualizza documento"
          >
            <FiEye />
          </button>
          <button 
            className="document-action-btn download-btn" 
            onClick={handleDownload}
            title="Scarica documento"
            aria-label="Scarica documento"
          >
            <FiDownload />
          </button>
          <button 
            className="document-action-btn delete-btn" 
            onClick={handleRemoveDocument}
            title="Elimina documento"
            aria-label="Elimina documento"
          >
            <FiTrash2 />
          </button>
        </div>
        <div className="drag-handle" title="Trascina per riordinare">
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
          <div className="document-modal-actions">
            <Button 
              variant="outline-secondary" 
              size="sm" 
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="fullscreen-toggle"
            >
              {isFullscreen ? 'Esci da schermo intero' : 'Schermo intero'}
            </Button>
          </div>
        </Modal.Header>
        <Modal.Body className="document-modal-body">
          {renderDocumentContent()}
        </Modal.Body>
        <Modal.Footer>
          <Button 
            variant="primary" 
            onClick={handleDownload}
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