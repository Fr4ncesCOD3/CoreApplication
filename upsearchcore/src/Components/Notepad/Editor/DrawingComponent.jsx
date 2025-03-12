import React, { useState, useRef, useEffect } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { FiX, FiEdit2, FiTrash2, FiMove, FiSave, FiMaximize, FiMinimize } from 'react-icons/fi'
import { BsPencil, BsEraser, BsCircleFill } from 'react-icons/bs'
import { IoColorPaletteOutline } from 'react-icons/io5'
import { BsDot, BsCircle, BsRecordCircle, BsRecordCircleFill } from 'react-icons/bs'
import './DrawingComponent.css'

const DrawingComponent = ({ node, updateAttributes, editor, getPos }) => {
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentStroke, setCurrentStroke] = useState([])
  const [strokes, setStrokes] = useState(node.attrs.strokes || [])
  const [isEditing, setIsEditing] = useState(false)
  const [color, setColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [tool, setTool] = useState('pencil') // 'pencil' o 'eraser'
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [touchStartY, setTouchStartY] = useState(0)
  const [canvasHeight, setCanvasHeight] = useState(300)
  const [isResizing, setIsResizing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  
  // Colori predefiniti ridotti e organizzati in modo più efficiente
  const predefinedColors = [
    // Colori essenziali: nero, bianco, grigio
    '#000000', '#FFFFFF', '#9E9E9E',
    // Colori primari
    '#F44336', '#2196F3', '#4CAF50', 
    // Colori secondari
    '#FFC107', '#9C27B0', '#FF9800'
  ]
  
  // Rileva se il dispositivo è mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => {
      window.removeEventListener('resize', checkMobile)
    }
  }, [])
  
  // Inizializza il canvas
  useEffect(() => {
    if (!canvasRef.current) return
    
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    
    // Imposta le dimensioni del canvas
    const resizeCanvas = () => {
      const container = containerRef.current
      if (!container) return
      
      const { width, height } = container.getBoundingClientRect()
      canvas.width = width
      canvas.height = height
      
      // Ridisegna tutti i tratti
      drawAllStrokes(context)
    }
    
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    
    return () => {
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])
  
  // Aggiorna il canvas quando cambiano i tratti
  useEffect(() => {
    if (!canvasRef.current) return
    
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    
    drawAllStrokes(context)
    
    // Salva i tratti nell'attributo del nodo
    updateAttributes({ strokes })
  }, [strokes, updateAttributes])
  
  // Funzione per disegnare tutti i tratti
  const drawAllStrokes = (context) => {
    if (!context) return
    
    // Pulisci il canvas
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    
    // Disegna tutti i tratti
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return
      
      context.beginPath()
      context.moveTo(stroke.points[0].x, stroke.points[0].y)
      
      for (let i = 1; i < stroke.points.length; i++) {
        context.lineTo(stroke.points[i].x, stroke.points[i].y)
      }
      
      context.strokeStyle = stroke.color
      context.lineWidth = stroke.width
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.stroke()
    })
  }
  
  // Funzione ottimizzata per trovare i tratti da cancellare
  const eraseStrokes = (x, y, radius) => {
    // Crea una copia dell'array strokes
    let newStrokes = [...strokes];
    let hasChanges = false;
    
    // Per ogni tratto, controlla se interseca con il cerchio della gomma
    newStrokes = newStrokes.map(stroke => {
      // Se il tratto ha meno di 2 punti, non può essere disegnato, quindi lo saltiamo
      if (stroke.points.length < 2) return stroke;
      
      // Filtra i punti che sono all'interno del raggio della gomma
      const filteredPoints = stroke.points.filter(point => {
        const distance = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
        return distance > radius;
      });
      
      // Se abbiamo rimosso dei punti, segna che ci sono cambiamenti
      if (filteredPoints.length !== stroke.points.length) {
        hasChanges = true;
      }
      
      // Se rimangono abbastanza punti, restituisci il tratto modificato
      if (filteredPoints.length >= 2) {
        return { ...stroke, points: filteredPoints };
      }
      
      // Altrimenti, segna che ci sono cambiamenti e restituisci null per rimuovere il tratto
      hasChanges = true;
      return null;
    }).filter(Boolean); // Rimuovi i tratti null
    
    // Aggiorna lo stato solo se ci sono cambiamenti
    if (hasChanges) {
      setStrokes(newStrokes);
    }
    
    return hasChanges;
  };
  
  // Gestori degli eventi touch/mouse
  const handlePointerDown = (e) => {
    if (!isEditing) return
    
    // Previeni il comportamento predefinito per evitare conflitti
    e.preventDefault()
    
    setIsDrawing(true)
    
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    
    // Ottieni le coordinate corrette sia per touch che per mouse
    const clientX = e.clientX || (e.touches && e.touches[0].clientX)
    const clientY = e.clientY || (e.touches && e.touches[0].clientY)
    
    // Calcola le coordinate relative al canvas
    const x = clientX - rect.left
    const y = clientY - rect.top
    
    console.log('Inizio disegno a:', x, y) // Debug
    
    if (tool === 'pencil') {
      setCurrentStroke([{ x, y }])
    } else if (tool === 'eraser') {
      // Trova il tratto più vicino e rimuovilo
      const { strokeIndex } = findNearestStroke(x, y, strokeWidth * 3)
      if (strokeIndex !== -1) {
        setStrokes(prev => prev.filter((_, index) => index !== strokeIndex))
      }
    }
  }
  
  // Modifica la funzione handlePointerMove per usare il nuovo algoritmo della gomma
  const handlePointerMove = (e) => {
    if (!isDrawing || !isEditing) return;
    
    // Previeni il comportamento predefinito
    e.preventDefault();
    
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    // Ottieni le coordinate corrette sia per touch che per mouse
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    // Calcola le coordinate relative al canvas
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    if (tool === 'pencil') {
      // Aggiorna lo stato del tratto corrente
      setCurrentStroke(prev => [...prev, { x, y }])
      
      // Disegna il tratto corrente direttamente sul canvas
      if (currentStroke.length > 0) {
        const lastPoint = currentStroke[currentStroke.length - 1]
        
        context.beginPath()
        context.moveTo(lastPoint.x, lastPoint.y)
        context.lineTo(x, y)
        context.strokeStyle = color
        context.lineWidth = strokeWidth
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.stroke()
        
        console.log('Disegno da', lastPoint.x, lastPoint.y, 'a', x, y) // Debug
      }
    } else if (tool === 'eraser') {
      // Usa il nuovo algoritmo della gomma
      const eraserRadius = strokeWidth * 3;
      const hasChanges = eraseStrokes(x, y, eraserRadius);
      
      // Ridisegna il canvas con i tratti aggiornati
      drawAllStrokes(context);
      
      // Disegna il cursore della gomma
      context.beginPath();
      context.arc(x, y, eraserRadius, 0, Math.PI * 2);
      context.strokeStyle = '#ff0000';
      context.lineWidth = 1.5;
      context.stroke();
      context.fillStyle = 'rgba(255, 0, 0, 0.1)';
      context.fill();
    }
  }
  
  const handlePointerUp = () => {
    if (!isDrawing || !isEditing) return
    
    setIsDrawing(false)
    
    if (tool === 'pencil' && currentStroke.length > 0) {
      setStrokes(prev => [...prev, { 
        points: currentStroke, 
        color, 
        width: strokeWidth 
      }])
      setCurrentStroke([])
    }
  }
  
  // Modifica la funzione handleExitDrawing per migliorare il focus
  const handleExitDrawing = () => {
    setIsEditing(false);
    setShowColorPicker(false);
    setShowConfirmDelete(false);
    
    // Salva lo stato espanso nell'attributo del nodo
    if (isExpanded) {
      setIsExpanded(false);
      updateAttributes({ expanded: false });
    }
    
    // Importante: ritarda leggermente il focus per garantire che il DOM sia aggiornato
    setTimeout(() => {
      // Posiziona il cursore dopo il blocco di disegno
      if (editor && typeof getPos === 'function') {
        const pos = getPos() + 1;
        editor.commands.setTextSelection(pos);
        editor.commands.focus();
      }
      
      // Feedback tattile su dispositivi mobili
      if (isMobile && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 50);
  };
  
  // Gestione della cancellazione del disegno
  const handleClearDrawing = () => {
    if (isMobile && !showConfirmDelete) {
      setShowConfirmDelete(true)
      return
    }
    
    setStrokes([])
    setShowConfirmDelete(false)
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    context.clearRect(0, 0, canvas.width, canvas.height)
  }
  
  // Gestione della rimozione del blocco di disegno
  const handleRemoveDrawingBlock = () => {
    if (typeof getPos === 'function') {
      editor.chain().focus().deleteNode('drawing').run()
    }
  }
  
  // Cambia lo strumento corrente
  const handleToolChange = (newTool) => {
    setTool(newTool)
    setShowColorPicker(false)
    
    // Feedback tattile quando si cambia strumento su dispositivi mobili
    if (isMobile && window.navigator && window.navigator.vibrate) {
      if (newTool === 'eraser') {
        // Vibrazione più lunga per la gomma
        window.navigator.vibrate([50, 30, 50]);
      } else {
        // Vibrazione singola per la matita
        window.navigator.vibrate(50);
      }
    }
  }
  
  // Gestione del cambio colore
  const handleColorChange = (newColor) => {
    setColor(newColor)
    
    // Feedback tattile quando si cambia colore su dispositivi mobili
    if (isMobile && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(30);
    }
    
    // Su mobile, non chiudiamo automaticamente il color picker
    if (!isMobile) {
      setShowColorPicker(false)
    }
  }
  
  // Chiudi il color picker quando si tocca fuori
  const handleCloseColorPicker = () => {
    setShowColorPicker(false)
  }
  
  // Modifica il componente per assicurarsi che il canvas abbia le dimensioni corrette
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return
    
    const canvas = canvasRef.current
    const container = containerRef.current
    const context = canvas.getContext('2d')
    
    // Imposta le dimensioni del canvas in base al container
    const resizeCanvas = () => {
      const { width, height } = container.getBoundingClientRect()
      
      // Imposta le dimensioni effettive del canvas (non solo lo stile)
      canvas.width = width
      canvas.height = height
      
      console.log('Canvas ridimensionato a:', width, height) // Debug
      
      // Ridisegna tutti i tratti dopo il ridimensionamento
      drawAllStrokes(context)
    }
    
    resizeCanvas()
    
    // Aggiungi un listener per il ridimensionamento
    const resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(container)
    
    return () => {
      resizeObserver.disconnect()
    }
  }, [strokes])
  
  // Gestione del touch per il ridimensionamento del canvas
  const handleResizeStart = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    setIsResizing(true)
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    setTouchStartY(clientY)
  }
  
  const handleResizeMove = (e) => {
    if (!isResizing) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const deltaY = clientY - touchStartY
    
    // Aggiorna l'altezza con un minimo di 150px e un massimo di 600px
    const newHeight = Math.max(150, Math.min(600, canvasHeight + deltaY))
    setCanvasHeight(newHeight)
    setTouchStartY(clientY)
    
    // Aggiorna l'altezza del container
    if (containerRef.current) {
      containerRef.current.style.height = `${newHeight}px`
    }
  }
  
  const handleResizeEnd = () => {
    setIsResizing(false)
    
    // Ridisegna il canvas con le nuove dimensioni
    if (canvasRef.current && containerRef.current) {
      const canvas = canvasRef.current
      const context = canvas.getContext('2d')
      
      // Aggiorna le dimensioni del canvas
      canvas.width = containerRef.current.clientWidth
      canvas.height = containerRef.current.clientHeight
      
      // Ridisegna tutti i tratti
      drawAllStrokes(context)
      
      // Salva l'altezza negli attributi del nodo
      updateAttributes({ height: `${canvasHeight}px` })
    }
  }
  
  // Inizializza l'altezza del canvas dagli attributi del nodo
  useEffect(() => {
    if (node.attrs.height) {
      const height = parseInt(node.attrs.height, 10) || 300
      setCanvasHeight(height)
      
      if (containerRef.current) {
        containerRef.current.style.height = `${height}px`
      }
    }
  }, [node.attrs.height])
  
  // Ottimizzazione per il touch su mobile
  const handleTouchStart = (e) => {
    // Previeni lo scroll della pagina durante il disegno
    if (isEditing) {
      e.preventDefault()
    }
    
    handlePointerDown(e)
  }
  
  const handleTouchMove = (e) => {
    // Previeni lo scroll della pagina durante il disegno
    if (isEditing && isDrawing) {
      e.preventDefault()
    }
    
    handlePointerMove(e)
  }
  
  // Gestione del doppio tap per entrare/uscire dalla modalità di modifica
  const [lastTap, setLastTap] = useState(0)
  
  const handleDoubleTap = (e) => {
    const currentTime = new Date().getTime()
    const tapLength = currentTime - lastTap
    
    if (tapLength < 300 && tapLength > 0) {
      // Doppio tap rilevato
      if (isEditing) {
        handleExitDrawing()
      } else {
        setIsEditing(true)
      }
      
      e.preventDefault()
    }
    
    setLastTap(currentTime)
  }
  
  // Funzione per espandere/contrarre il canvas
  const toggleCanvasExpansion = (e) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
    
    // Quando si espande, assicurati che sia in modalità editing
    if (!isExpanded && !isEditing) {
      setIsEditing(true);
    }
    
    // Ridimensiona il canvas dopo l'animazione
    setTimeout(() => {
      if (canvasRef.current && containerRef.current) {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        
        // Ridisegna tutti i tratti
        const context = canvas.getContext('2d');
        drawAllStrokes(context);
      }
    }, 300);
    
    // Feedback tattile
    if (isMobile && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }
  };
  
  // Impedisci lo scroll della pagina quando si disegna
  useEffect(() => {
    const preventScroll = (e) => {
      if (isEditing && isDrawing) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('touchmove', preventScroll, { passive: false });
    
    return () => {
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [isEditing, isDrawing]);
  
  // Gestisci la chiusura della modalità espansa con il tasto Escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isExpanded]);
  
  // Impedisci lo scroll del documento quando il canvas è espanso
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isExpanded]);
  
  // Aggiungi una funzione per gestire il click sul blocco quando non è in modalità editing
  const handleDrawingClick = (e) => {
    if (!isEditing) {
      // Se non siamo in modalità editing, previeni la propagazione
      // per evitare che il click attivi altri handler
      e.stopPropagation();
      setIsEditing(true);
    }
  };
  
  // Aggiungi una funzione per gestire il drag del blocco di disegno
  const handleDragStart = (e) => {
    if (!isEditing) {
      // Aggiungi dati per il drag and drop
      if (e.dataTransfer) {
        e.dataTransfer.setData('application/drawing-block', JSON.stringify({
          id: node.attrs.id || 'drawing-' + Date.now(),
          type: 'drawing'
        }));
        e.dataTransfer.effectAllowed = 'move';
        
        // Aggiungi una classe per lo stile durante il drag
        setTimeout(() => {
          const element = e.target.closest('.drawing-component');
          if (element) {
            element.classList.add('dragging');
          }
        }, 0);
      }
    } else {
      // Se siamo in modalità editing, previeni il drag
      e.preventDefault();
    }
  };
  
  const handleDragEnd = (e) => {
    const element = e.target.closest('.drawing-component');
    if (element) {
      element.classList.remove('dragging');
    }
  };
  
  return (
    <NodeViewWrapper 
      className="drawing-component" 
      draggable={!isEditing}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      data-drag-handle
    >
      <div 
        ref={containerRef} 
        className={`drawing-container ${isEditing ? 'editing' : ''} ${isExpanded ? 'expanded' : ''}`}
        style={{ height: `${canvasHeight}px` }}
        onClick={!isEditing ? () => setIsEditing(true) : undefined}
        onTouchEnd={handleDoubleTap}
      >
        <canvas
          ref={canvasRef}
          className="drawing-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handlePointerUp}
          style={{ 
            cursor: isEditing 
              ? tool === 'pencil' 
                ? 'crosshair' 
                : 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'red\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'10\'/%3E%3Cline x1=\'8\' y1=\'12\' x2=\'16\' y2=\'12\'/%3E%3C/svg%3E") 12 12, auto'
              : 'pointer' 
          }}
        />
        
        {/* Pulsante per espandere/contrarre il canvas su mobile */}
        {isMobile && isEditing && (
          <button 
            className="expand-canvas-button"
            onClick={toggleCanvasExpansion}
            title={isExpanded ? "Riduci canvas" : "Espandi canvas"}
          >
            {isExpanded ? <FiMinimize /> : <FiMaximize />}
          </button>
        )}
        
        {isEditing && (
          <div className={`drawing-toolbar ${isMobile ? 'mobile' : ''}`}>
            <div className="drawing-tools">
              <button 
                className={`tool-button ${tool === 'pencil' ? 'active' : ''}`}
                onClick={() => handleToolChange('pencil')}
                title="Matita"
              >
                <BsPencil />
              </button>
              
              <button 
                className={`tool-button ${tool === 'eraser' ? 'active' : ''}`}
                onClick={() => handleToolChange('eraser')}
                title="Gomma"
              >
                <BsEraser />
              </button>
              
              {tool === 'pencil' && (
                <div className="color-tool">
                  <button 
                    className={`color-button ${showColorPicker ? 'active' : ''}`}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    style={{ 
                      backgroundColor: color,
                      border: color === '#FFFFFF' ? '1px solid #ddd' : 'none'
                    }}
                    title="Colore"
                  >
                    <IoColorPaletteOutline style={{ color: getContrastColor(color) }} />
                  </button>
                  
                  {showColorPicker && (
                    <>
                      {/* Overlay per chiudere il color picker toccando fuori */}
                      <div className="color-picker-overlay" onClick={handleCloseColorPicker}></div>
                      
                      <div className="color-picker-dropdown compact">
                        <div className="color-grid">
                          {predefinedColors.map((c, index) => (
                            <button 
                              key={c} 
                              className={`color-option ${c === color ? 'active' : ''}`}
                              style={{ 
                                backgroundColor: c,
                                border: c === '#FFFFFF' ? '2px solid #ddd' : '2px solid transparent'
                              }}
                              onClick={() => handleColorChange(c)}
                              aria-label={`Colore ${index + 1}`}
                            />
                          ))}
                        </div>
                        <div className="color-input-container">
                          <input 
                            type="color" 
                            value={color} 
                            onChange={(e) => handleColorChange(e.target.value)} 
                            className="color-input"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              
              <div className="stroke-width-buttons">
                <button 
                  className={`width-button ${strokeWidth === 2 ? 'active' : ''}`}
                  onClick={() => setStrokeWidth(2)}
                  title="Sottile"
                >
                  <BsDot size={16} />
                </button>
                <button 
                  className={`width-button ${strokeWidth === 5 ? 'active' : ''}`}
                  onClick={() => setStrokeWidth(5)}
                  title="Medio"
                >
                  <BsCircle size={16} />
                </button>
                <button 
                  className={`width-button ${strokeWidth === 8 ? 'active' : ''}`}
                  onClick={() => setStrokeWidth(8)}
                  title="Spesso"
                >
                  <BsRecordCircleFill size={20} />
                </button>
              </div>
              
              <button 
                className="clear-button" 
                onClick={handleClearDrawing}
                title="Cancella disegno"
              >
                <FiTrash2 />
              </button>
            </div>
            
            <button 
              className="save-drawing-button" 
              onClick={handleExitDrawing}
              title="Salva disegno"
              aria-label="Salva disegno"
            >
              <FiSave />
            </button>
          </div>
        )}
        
        {showConfirmDelete && (
          <div className="confirm-delete-overlay">
            <div className="confirm-delete-dialog">
              <p>Sei sicuro di voler cancellare il disegno?</p>
              <div className="confirm-buttons">
                <button onClick={() => setShowConfirmDelete(false)}>Annulla</button>
                <button onClick={handleClearDrawing} className="confirm-delete">Cancella</button>
              </div>
            </div>
          </div>
        )}
        
        {!isEditing && strokes.length > 0 && (
          <div className="drawing-info-overlay">
            <div className="drawing-info-message">
              <span>Tocca per modificare il disegno o continua a scrivere nella nota</span>
            </div>
          </div>
        )}
        
        {/* Aggiungi un indicatore di drag and drop quando non è in modalità editing */}
        {!isEditing && (
          <div className="drag-handle-indicator">
            <FiMove />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

// Funzione di utilità per determinare il colore del testo in base al colore di sfondo
function getContrastColor(hexColor) {
  // Converte il colore esadecimale in RGB
  const r = parseInt(hexColor.substr(1, 2), 16)
  const g = parseInt(hexColor.substr(3, 2), 16)
  const b = parseInt(hexColor.substr(5, 2), 16)
  
  // Calcola la luminosità (formula approssimativa)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  
  // Restituisce bianco o nero in base alla luminosità
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

export default DrawingComponent 