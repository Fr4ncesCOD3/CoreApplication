import React, { useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { FiFile, FiEye, FiTrash2, FiMove, FiDownload } from 'react-icons/fi'
import { Modal, Button } from 'react-bootstrap'
import './DocumentComponent.css'

const DocumentComponent = ({ node, updateAttributes, editor, getPos }) => {
  const [showModal, setShowModal] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  
  const { fileName, fileType, fileSize, fileContent } = node.attrs
  
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
    
    return <FiFile size={24} />
  }
  
  const handleViewDocument = (e) => {
    e.stopPropagation()
    setShowModal(true)
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
  
  const renderDocumentContent = () => {
    if (!fileContent) return <p>Contenuto non disponibile</p>
    
    if (fileType.includes('image')) {
      return (
        <div className="document-image-container">
          <img src={fileContent} alt={fileName} className="document-modal-image" />
        </div>
      )
    }
    
    if (fileType.includes('text') || fileType.includes('json') || fileType.includes('xml') || 
        fileType.includes('javascript') || fileType.includes('html') || fileType.includes('css')) {
      return (
        <div className="document-text-container">
          <pre className="document-text-content">{fileContent}</pre>
        </div>
      )
    }
    
    if (fileType.includes('pdf')) {
      return (
        <div className="document-pdf-container">
          <iframe 
            src={fileContent} 
            title={fileName} 
            width="100%" 
            height="500px" 
            className="document-pdf-viewer"
          />
        </div>
      )
    }
    
    return (
      <div className="document-generic-container">
        <p>Anteprima non disponibile per questo tipo di file</p>
        <a 
          href={fileContent} 
          download={fileName} 
          className="document-download-link"
          onClick={(e) => e.stopPropagation()}
        >
          Scarica il file
        </a>
      </div>
    )
  }
  
  const handleDownload = (e) => {
    e.stopPropagation()
    
    const link = document.createElement('a')
    link.href = fileContent
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
  
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
        onHide={() => setShowModal(false)} 
        size="lg" 
        centered
        className="document-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>{fileName}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {renderDocumentContent()}
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
            onClick={() => setShowModal(false)}
          >
            Chiudi
          </Button>
        </Modal.Footer>
      </Modal>
    </NodeViewWrapper>
  )
}

export default DocumentComponent 