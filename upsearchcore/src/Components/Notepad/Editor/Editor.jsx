import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Heading from '@tiptap/extension-heading'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Code from '@tiptap/extension-code'
import CodeBlock from '@tiptap/extension-code-block'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import History from '@tiptap/extension-history'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import TextStyle from '@tiptap/extension-text-style'
import { Button, ButtonGroup, ButtonToolbar, Dropdown, Form, Modal, OverlayTrigger, Popover, Tooltip } from 'react-bootstrap'
import { FiBold, FiItalic, FiCode, FiType, FiList, FiLink, FiX, FiDroplet } from 'react-icons/fi'
import { MdFormatSize, MdArrowDropDown } from 'react-icons/md'
import { IoColorPaletteOutline } from 'react-icons/io5'
import './Editor.css'

// Funzione di utilità per il debounce
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Definizione dell'estensione FontSize
export const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return {
      types: ['textStyle'],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: fontSize => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize: fontSize + "px" })
          .run();
      },
      unsetFontSize: () => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize: null })
          .removeEmptyTextStyle()
          .run();
      },
    };
  },
});

// Componente Editor
const Editor = ({ onContentChange, initialContent }) => {
  // Stati per gestire i vari aspetti dell'editor
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [showFontSizeSlider, setShowFontSizeSlider] = useState(false)
  const [fontSize, setFontSize] = useState(() => {
    // Recupera la dimensione del testo salvata o usa il valore predefinito
    const savedSize = localStorage.getItem('editorFontSize')
    return savedSize ? parseInt(savedSize, 10) : 16
  })
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [currentSelection, setCurrentSelection] = useState(null)
  const [isMobileDevice, setIsMobileDevice] = useState(false)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [showMobileOptions, setShowMobileOptions] = useState(false)
  const [isEditorFocused, setIsEditorFocused] = useState(false)
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const editorRef = useRef(null)
  
  // Riferimenti per gli elementi DOM
  const linkInputRef = useRef(null)
  const fontSizeRef = useRef(null)
  
  // Aggiungi queste funzioni al componente Editor
  const [showMobileFontSizeTool, setShowMobileFontSizeTool] = useState(false)
  const [showMobileColorPicker, setShowMobileColorPicker] = useState(false)
  const [selectedColor, setSelectedColor] = useState(null)
  const [currentFontSize, setCurrentFontSize] = useState(16)
  const colorPickerRef = useRef(null)
  const fontSizeToolRef = useRef(null)
  
  // Colori predefiniti per la palette mobile
  const colorOptions = [
    '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc',
    '#d50000', '#e67c73', '#f4511e', '#f6bf26', '#33b679', '#0b8043',
    '#039be5', '#3f51b5', '#7986cb', '#8e24aa', '#d81b60', '#ad1457',
    '#c0ca33', '#e4c441', '#fb8c00', '#fa573c', '#a52714', '#0097a7'
  ]
  
  // Dimensioni di testo predefinite
  const fontSizePresets = [12, 14, 16, 18, 20, 24, 28, 32, 36, 42]
  
  // Aggiungi uno stato per tracciare l'ultima azione
  const [lastAction, setLastAction] = useState(null);
  
  // Configurazione dell'editor TipTap
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Heading.configure({
        levels: [1, 2, 3],
      }),
      Bold,
      Italic,
      Code,
      CodeBlock,
      BulletList,
      OrderedList,
      ListItem,
      History,
      Placeholder.configure({
        placeholder: 'Inizia a scrivere...',
      }),
      Link.configure({
        openOnClick: true,
        validate: href => /^https?:\/\//.test(href),
      }),
      TextStyle,
      FontSize,
      Extension.create({
        name: 'fontSizePersistence',
        
        addStorage() {
          return {
            fontSize: localStorage.getItem('editorFontSize') 
              ? parseInt(localStorage.getItem('editorFontSize'), 10) 
              : 16
          };
        },
        
        onTransaction({ transaction }) {
          // Verifica se è stata inserita una nuova riga
          if (transaction.docChanged) {
            // Recupera la dimensione del testo corrente
            const fontSize = this.editor.storage.fontSize || 16;
            
            // Applica la dimensione del testo in modo sicuro
            requestAnimationFrame(() => {
              if (this.editor && this.editor.isActive) {
                this.editor
                  .chain()
                  .focus()
                  .setMark('textStyle', { fontSize: `${fontSize}px` })
                  .run();
              }
            });
          }
        }
      }),
      Extension.create({
        name: 'mobileEditing',
        
        addKeyboardShortcuts() {
          return {
            // Disabilita alcuni shortcut che potrebbero interferire con la tastiera mobile
            'Mod-b': () => isMobileDevice ? true : this.editor.commands.toggleBold(),
            'Mod-i': () => isMobileDevice ? true : this.editor.commands.toggleItalic(),
            'Mod-u': () => isMobileDevice ? true : this.editor.commands.toggleUnderline(),
          };
        },
        
        // Aggiungi opzioni specifiche per mobile
        addOptions() {
          return {
            // Aumenta la dimensione del cursore su mobile
            cursorWidth: isMobileDevice ? 2 : 1,
          };
        },
      }),
    ],
    editorProps: {
      // Migliora la gestione degli eventi touch
      handleDOMEvents: {
        touchstart: (view, event) => {
          // Quando l'utente tocca l'editor, consideriamo che ha interagito con esso
          setHasInteracted(true);
          setIsEditorFocused(true);
          return false;
        },
        focus: () => {
          setIsEditorFocused(true);
          setHasInteracted(true);
          return false;
        },
        blur: (view, event) => {
          // Verifica se il blur è causato da un click su un elemento dell'interfaccia
          // e non da un vero e proprio abbandono dell'editor
          const relatedTarget = event.relatedTarget;
          
          // Non resettare isEditorFocused se il focus è passato a un elemento dell'interfaccia
          // come pulsanti della toolbar, popover, ecc.
          if (relatedTarget && 
              (relatedTarget.closest('.mobile-toolbar') || 
               relatedTarget.closest('.popover') || 
               relatedTarget.closest('.mobile-format-options'))) {
            return false;
          }
          
          // Se l'utente ha già interagito con l'editor, non mostrare più il pulsante
          if (hasInteracted) {
            return false;
          }
          
          setIsEditorFocused(false);
          return false;
        },
      },
      attributes: {
        class: 'mobile-optimized',
      },
    },
    content: initialContent || '',
    onUpdate: ({ editor }) => {
      if (onContentChange) {
        onContentChange(editor.getHTML())
      }
    },
  })
  
  // Effetto per applicare la dimensione del testo salvata quando l'editor viene inizializzato
  useEffect(() => {
    if (editor) {
      document.body.style.setProperty('--current-font-size', `${fontSize}px`);
    }
  }, [editor, fontSize]);
  
  // Effetto per salvare la dimensione del testo quando cambia
  useEffect(() => {
    localStorage.setItem('editorFontSize', fontSize.toString());
  }, [fontSize]);
  
  // Funzione per mostrare i tooltip
  const renderTooltip = (props, text) => (
    <Tooltip id={`tooltip-${text.toLowerCase().replace(/\s+/g, '-')}`} {...props}>
      {text}
    </Tooltip>
  )
  
  // Gestione dell'inserimento dei link
  const handleSetLink = useCallback(() => {
    if (!editor) return
    
    const previousUrl = editor.getAttributes('link').href
    setLinkUrl(previousUrl || '')
    setShowLinkModal(true)
    
    // Focus sull'input URL quando il modale si apre
    setTimeout(() => {
      if (linkInputRef.current) {
        linkInputRef.current.focus()
      }
    }, 100)
  }, [editor])
  
  // Applicazione del link al testo selezionato
  const applyLink = useCallback(() => {
    if (!editor) return
    
    // Validazione dell'URL
    const isValidUrl = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(linkUrl)
    
    if (linkUrl && isValidUrl) {
      // Assicurati che l'URL abbia il protocollo
      const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`
      
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: url })
        .run()
    } else if (linkUrl) {
      // Se l'URL non è valido, mostra un avviso
      alert('Per favore, inserisci un URL valido')
      return
    } else {
      // Se l'URL è vuoto, rimuovi il link
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .unsetLink()
        .run()
    }
    
    setShowLinkModal(false)
    setLinkUrl('')
  }, [editor, linkUrl])
  
  // Funzione per applicare il colore al testo
  const applyTextColor = (color) => {
    if (!editor) return;
    
    editor.chain().focus().run();
    
    // Implementazione per applicare il colore
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, color);
    } catch (e) {
      console.warn('Errore nell\'applicare il colore:', e);
    }
  };
  
  // Modifica la funzione applyFontSize per salvare la dimensione corrente
  const applyFontSize = (size) => {
    if (!editor) return;
    
    // Converti il valore numerico in pixel
    const fontSizePx = `${size}px`;
    
    // Salva la dimensione corrente per il testo futuro
    document.body.style.setProperty('--current-font-size', fontSizePx);
    localStorage.setItem('editorFontSize', size.toString());
    
    // Salva la dimensione nell'editor storage
    editor.storage.fontSize = size;
    
    // Ottieni la selezione corrente
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    
    if (hasSelection) {
      // Applica al testo selezionato
      editor
        .chain()
        .focus()
        .setMark('textStyle', { fontSize: fontSizePx })
        .run();
    } else {
      // Se non c'è selezione, imposta la dimensione per il testo futuro
      editor
        .chain()
        .focus()
        .setMark('textStyle', { fontSize: fontSizePx })
        .run();
    }
  }
  
  // Aggiungi questa nuova funzione per rilevare la dimensione del testo selezionato
  const detectFontSize = () => {
    if (!editor) return 16 // Dimensione predefinita
    
    const selection = window.getSelection()
    if (!selection.rangeCount) return 16
    
    const range = selection.getRangeAt(0)
    const selectedNode = range.startContainer
    
    // Trova l'elemento più vicino con una dimensione del testo definita
    let currentNode = selectedNode.nodeType === Node.TEXT_NODE ? selectedNode.parentNode : selectedNode
    let fontSize = 16 // Valore predefinito
    
    while (currentNode && currentNode !== editor.view.dom) {
      const computedStyle = window.getComputedStyle(currentNode)
      if (computedStyle.fontSize) {
        // Estrai il valore numerico dalla stringa (es. "16px" -> 16)
        const extractedSize = parseInt(computedStyle.fontSize, 10)
        if (!isNaN(extractedSize)) {
          fontSize = extractedSize
          break
        }
      }
      currentNode = currentNode.parentNode
    }
    
    return fontSize
  }
  
  // Modifica la funzione handleFontSizeButtonClick per rilevare la dimensione attuale
  const handleFontSizeButtonClick = () => {
    if (isMobileDevice) {
      // Su mobile, mostra il tool dedicato
      setShowFontSizeSlider(!showFontSizeSlider);
      
      // Se stiamo aprendo il tool, salva la selezione corrente
      if (!showFontSizeSlider && editor) {
        const { from, to } = editor.state.selection;
        if (from !== to) {
          // Rileva la dimensione del testo selezionato
          const detectedSize = detectFontSize();
          setFontSize(detectedSize);
        }
      }
    } else {
      // Su desktop, usa il comportamento esistente
      // ... existing desktop behavior ...
    }
  }
  
  // Aggiungi un listener per il click nell'editor per rilevare la dimensione del testo
  useEffect(() => {
    if (editor) {
      const handleClick = () => {
        // Aggiorna la dimensione del testo visualizzata nel pulsante
        const detectedSize = detectFontSize()
        setFontSize(detectedSize)
      }
      
      // Aggiungi l'event listener all'editor
      const editorElement = editor.view.dom
      editorElement.addEventListener('click', handleClick)
      
      // Cleanup
      return () => {
        editorElement.removeEventListener('click', handleClick)
      }
    }
  }, [editor])
  
  // Aggiungi un effetto per ripristinare la selezione quando il popover si chiude
  useEffect(() => {
    if (!showFontSizeSlider && currentSelection) {
      // Resetta la selezione memorizzata quando il popover si chiude
      setCurrentSelection(null)
    }
  }, [showFontSizeSlider])
  
  // Gestione del cambio di dimensione del testo
  const handleFontSizeChange = (e) => {
    const newSize = parseInt(e.target.value, 10)
    setFontSize(newSize)
    applyFontSize(newSize)
  }
  
  // Modifica la funzione handleFontSizeInput per evitare manipolazioni DOM dirette
  const handleFontSizeInput = (e) => {
    const newSize = parseInt(e.target.value, 10);
    setFontSize(newSize);
    
    if (!editor) return;
    
    // Salva la dimensione corrente per il testo futuro
    document.body.style.setProperty('--current-font-size', `${newSize}px`);
    localStorage.setItem('editorFontSize', newSize.toString());
    
    // Salva la dimensione nell'editor storage
    editor.storage.fontSize = newSize;
    
    // Applica la dimensione del testo usando l'API di TipTap
    editor
      .chain()
      .focus()
      .setMark('textStyle', { fontSize: `${newSize}px` })
      .run();
  };
  
  // Sostituisci la funzione setupParagraphHandler con questa versione più sicura
  const setupParagraphHandler = () => {
    if (!editor) return;
    
    // Usa l'API di TipTap per gestire gli eventi della tastiera
    const handleKeyDown = ({ event }) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        // Salva la dimensione del testo corrente
        const currentFontSize = editor.storage.fontSize || 16;
        
        // Lascia che TipTap gestisca l'inserimento del nuovo paragrafo
        // Non interrompere il flusso normale
        
        // Dopo che il nuovo paragrafo è stato creato, applica la dimensione del testo
        // Usa requestAnimationFrame per assicurarsi che il DOM sia stato aggiornato
        requestAnimationFrame(() => {
          editor
            .chain()
            .focus()
            .setMark('textStyle', { fontSize: `${currentFontSize}px` })
            .run();
        });
      }
    };
    
    // Aggiungi l'event listener usando l'API di TipTap
    editor.on('keydown', handleKeyDown);
    
    return () => {
      editor.off('keydown', handleKeyDown);
    };
  };
  
  // Aggiungi questo effetto per inizializzare il gestore dei paragrafi
  useEffect(() => {
    if (editor) {
      const cleanup = setupParagraphHandler();
      return cleanup;
    }
  }, [editor]);
  
  // Aggiungi un osservatore ottimizzato per mantenere la dimensione del testo
  useEffect(() => {
    if (!editor) return;
    
    // Crea un osservatore per le mutazioni DOM con debounce
    const debouncedUpdate = debounce(() => {
      const currentFontSize = editor.storage.fontSize || 16;
      
      // Applica la dimensione del testo in modo sicuro
      if (editor && editor.isActive) {
        editor
          .chain()
          .focus()
          .setMark('textStyle', { fontSize: `${currentFontSize}px` })
          .run();
      }
    }, 50); // Piccolo ritardo per evitare troppe chiamate
    
    const observer = new MutationObserver((mutations) => {
      let needsUpdate = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          needsUpdate = true;
        }
      });
      
      if (needsUpdate) {
        debouncedUpdate();
      }
    });
    
    // Configura l'osservatore con opzioni ottimizzate
    observer.observe(editor.view.dom, {
      childList: true,
      subtree: true,
      attributes: false // Riduci il carico osservando solo i cambiamenti nella struttura
    });
    
    // Cleanup
    return () => {
      observer.disconnect();
    };
  }, [editor]);
  
  // Aggiungi un gestore per il focus sui paragrafi
  const setupParagraphFocusHandler = () => {
    if (!editor) return;
    
    // Ottieni l'elemento DOM dell'editor
    const editorElement = editor.view.dom;
    
    // Funzione per gestire il click sui paragrafi
    const handleParagraphClick = (event) => {
      const paragraph = event.target.closest('p');
      if (paragraph) {
        // Ottieni la dimensione del testo dal paragrafo
        const fontSize = paragraph.getAttribute('data-font-size') || 
                        window.getComputedStyle(paragraph).fontSize.replace('px', '') || 
                        editor.storage.fontSize || 
                        16;
        
        // Aggiorna la dimensione corrente
        setFontSize(parseInt(fontSize, 10));
        editor.storage.fontSize = parseInt(fontSize, 10);
      }
    };
    
    // Aggiungi l'event listener
    editorElement.addEventListener('click', handleParagraphClick);
    
    return () => {
      editorElement.removeEventListener('click', handleParagraphClick);
    };
  };

  // Aggiungi questo effetto per inizializzare il gestore del focus sui paragrafi
  useEffect(() => {
    if (editor) {
      const cleanup = setupParagraphFocusHandler();
      return cleanup;
    }
  }, [editor]);
  
  // Aggiungi questo effetto per rilevare i dispositivi mobili
  useEffect(() => {
    const checkMobileDevice = () => {
      const isMobile = window.innerWidth <= 768;
      setIsMobileDevice(isMobile);
      
      // Applica classi specifiche per mobile al container dell'editor
      if (editor) {
        const editorElement = editor.view.dom;
        if (isMobile) {
          editorElement.classList.add('mobile-editor');
        } else {
          editorElement.classList.remove('mobile-editor');
        }
      }
    };
    
    // Controlla all'inizio
    checkMobileDevice();
    
    // Aggiungi listener per il resize della finestra
    window.addEventListener('resize', checkMobileDevice);
    
    return () => {
      window.removeEventListener('resize', checkMobileDevice);
    };
  }, [editor]);
  
  // Variabile per tracciare i tap
  let lastTap = 0;
  
  // Modifica la funzione MobileToolbar per renderla scrollabile orizzontalmente
  const MobileToolbar = () => {
    if (!isMobileDevice || !editor) return null;
    
    // Riferimento per lo scroll orizzontale
    const toolbarScrollRef = useRef(null);
    
    // Variabili per gli indicatori di scorrimento
    const [hasMoreLeft, setHasMoreLeft] = useState(false);
    const [hasMoreRight, setHasMoreRight] = useState(true);
    
    // Funzione per gestire i click sui pulsanti della toolbar
    const handleToolbarButtonClick = (action) => {
      console.log("🔘 Toolbar button clicked");
      
      // Esegui l'azione
      action();
      
      console.log("🔘 Azione della toolbar completata");
    };
    
    // Effetto per gestire gli indicatori di scorrimento
    useEffect(() => {
      if (toolbarScrollRef.current) {
        const checkScroll = () => {
          const { scrollLeft, scrollWidth, clientWidth } = toolbarScrollRef.current;
          setHasMoreLeft(scrollLeft > 10);
          setHasMoreRight(scrollLeft + clientWidth < scrollWidth - 10);
        };
        
        checkScroll();
        toolbarScrollRef.current.addEventListener('scroll', checkScroll);
        
        return () => {
          if (toolbarScrollRef.current) {
            toolbarScrollRef.current.removeEventListener('scroll', checkScroll);
          }
        };
      }
    }, [toolbarScrollRef]);
    
    return (
      <div className="mobile-toolbar-container">
        <div className={`mobile-toolbar ${hasMoreLeft ? 'has-more-left' : ''} ${hasMoreRight ? 'has-more-right' : ''}`}>
          <div className="mobile-toolbar-scroll" ref={toolbarScrollRef}>
            <Button 
              variant={editor.isActive('bold') ? 'primary' : 'light'}
              onClick={() => handleToolbarButtonClick(() => editor.chain().focus().toggleBold().run())}
              className="mobile-toolbar-btn"
            >
              <FiBold />
            </Button>
            <Button 
              variant={editor.isActive('italic') ? 'primary' : 'light'}
              onClick={() => handleToolbarButtonClick(() => editor.chain().focus().toggleItalic().run())}
              className="mobile-toolbar-btn"
            >
              <FiItalic />
            </Button>
            <Button 
              variant={editor.isActive('code') ? 'primary' : 'light'}
              onClick={() => handleToolbarButtonClick(() => editor.chain().focus().toggleCode().run())}
              className="mobile-toolbar-btn"
            >
              <FiCode />
            </Button>
            <Button 
              variant={editor.isActive('heading', { level: 1 }) ? 'primary' : 'light'}
              onClick={() => handleToolbarButtonClick(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}
              className="mobile-toolbar-btn"
            >
              <span className="btn-text">H1</span>
            </Button>
            <Button 
              variant={editor.isActive('heading', { level: 2 }) ? 'primary' : 'light'}
              onClick={() => handleToolbarButtonClick(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
              className="mobile-toolbar-btn"
            >
              <span className="btn-text">H2</span>
            </Button>
            <Button 
              variant={editor.isActive('heading', { level: 3 }) ? 'primary' : 'light'}
              onClick={() => handleToolbarButtonClick(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
              className="mobile-toolbar-btn"
            >
              <span className="btn-text">H3</span>
            </Button>
            <Button 
              variant={editor.isActive('bulletList') ? 'primary' : 'light'}
              onClick={() => handleToolbarButtonClick(() => editor.chain().focus().toggleBulletList().run())}
              className="mobile-toolbar-btn"
            >
              <FiList />
            </Button>
            <Button 
              variant={editor.isActive('orderedList') ? 'primary' : 'light'}
              onClick={() => handleToolbarButtonClick(() => editor.chain().focus().toggleOrderedList().run())}
              className="mobile-toolbar-btn"
            >
              <span className="btn-text">1.</span>
            </Button>
            
            {/* Pulsante dimensione testo */}
            <Button 
              variant={showMobileFontSizeTool ? 'primary' : 'light'}
              onClick={() => handleToolbarButtonClick(handleMobileFontSizeToggle)}
              className="mobile-toolbar-btn"
            >
              <FiType size={20} />
              <span className="btn-text">Testo</span>
            </Button>
            
            <Button 
              variant={editor.isActive('link') ? 'primary' : 'light'}
              onClick={() => handleToolbarButtonClick(handleSetLink)}
              className="mobile-toolbar-btn"
            >
              <FiLink />
            </Button>
            
            {/* Pulsante colore testo - Versione corretta */}
            <Button 
              variant={showMobileColorPicker ? 'primary' : 'light'}
              onClick={() => handleToolbarButtonClick(handleMobileColorPickerToggle)}
              className="mobile-toolbar-btn"
              aria-label="Colore testo"
            >
              <FiDroplet size={20} />
              <span className="btn-text">Colore</span>
            </Button>
          </div>
        </div>
        
        {/* Aggiungi i componenti per gli strumenti mobile */}
        <MobileFontSizeTool />
        <MobileColorPicker />
      </div>
    );
  };
  
  // Modifica la funzione handleInput per rimuovere qualsiasi apertura automatica di modali
  useEffect(() => {
    if (!editor || !isMobileDevice) return;
    
    const handleInput = () => {
      console.log("📝 Editor input/update rilevato");
      
      // Log per debugging
      setHasInteracted(true);
      setIsEditorFocused(true);
      localStorage.setItem('editorHasInteracted', 'true');
    };
    
    const handleSelectionChange = () => {
      console.log("🔍 Editor selection change rilevato");
    };
    
    editor.on('update', handleInput);
    editor.on('selectionUpdate', handleSelectionChange);
    
    return () => {
      editor.off('update', handleInput);
      editor.off('selectionUpdate', handleSelectionChange);
    };
  }, [editor, isMobileDevice]);

  // Modifica anche questo effetto per gestire i tap sull'editor
  useEffect(() => {
    if (!isMobileDevice || !editor) return;
    
    const editorElement = editor.view.dom;
    
    // Funzione per gestire il tap sull'editor
    const handleTap = (e) => {
      // Verifica che il tap sia sull'editor e NON sui pulsanti della toolbar
      if (e.target.closest('.ProseMirror') && 
          !e.target.closest('.mobile-toolbar-btn') && 
          !e.target.closest('.mobile-font-size-tool') && 
          !e.target.closest('.mobile-color-picker')) {
        
        setIsEditorFocused(true);
        setHasInteracted(true);
        localStorage.setItem('editorHasInteracted', 'true');
        
        // Importante: NON aprire modali qui!
      }
    };
    
    // Aggiungi i listener
    document.addEventListener('touchend', handleTap);
    document.addEventListener('click', handleTap);
    
    // Cleanup
    return () => {
      document.removeEventListener('touchend', handleTap);
      document.removeEventListener('click', handleTap);
    };
  }, [editor, isMobileDevice]);
  
  // Modifica il componente FocusButton per aggiungere una transizione
  const FocusButton = () => {
    const [isHiding, setIsHiding] = useState(false);
    
    // Mostra il pulsante solo se necessario
    if (!isMobileDevice || isEditorFocused || hasInteracted) return null;
    
    return (
      <button 
        className={`mobile-focus-button ${isHiding ? 'hiding' : ''}`}
        onClick={() => {
          // Avvia l'animazione di scomparsa
          setIsHiding(true);
          
          // Dopo l'animazione, aggiorna gli stati
          setTimeout(() => {
            if (editorRef.current) {
              editorRef.current.focus();
              setIsEditorFocused(true);
              setHasInteracted(true);
              localStorage.setItem('editorHasInteracted', 'true');
            }
          }, 300); // Durata dell'animazione
        }}
      >
        Tocca qui per scrivere
      </button>
    );
  };
  
  // Funzione per gestire il toggle delle opzioni mobile
  const toggleMobileOptions = () => {
    setShowMobileOptions(prevState => !prevState);
    
    // Chiudi automaticamente le opzioni dopo un po' di tempo
    if (!showMobileOptions) {
      setTimeout(() => {
        setShowMobileOptions(false);
      }, 5000); // Chiudi dopo 5 secondi di inattività
    }
  };
  
  // Aggiungi questo effetto per migliorare l'esperienza di scrolling
  useEffect(() => {
    if (!isMobileDevice) return;
    
    const toolbarScroll = document.querySelector('.mobile-toolbar-scroll');
    if (!toolbarScroll) return;
    
    // Aggiungi indicatori di scorrimento
    const addScrollIndicators = () => {
      const isScrollable = toolbarScroll.scrollWidth > toolbarScroll.clientWidth;
      const hasScrolledToEnd = toolbarScroll.scrollLeft + toolbarScroll.clientWidth >= toolbarScroll.scrollWidth - 10;
      
      toolbarScroll.parentElement.classList.toggle('has-more-right', isScrollable && !hasScrolledToEnd);
      toolbarScroll.parentElement.classList.toggle('has-more-left', toolbarScroll.scrollLeft > 10);
    };
    
    // Inizializza gli indicatori
    addScrollIndicators();
    
    // Aggiorna gli indicatori durante lo scrolling
    toolbarScroll.addEventListener('scroll', addScrollIndicators);
    
    // Cleanup
    return () => {
      toolbarScroll.removeEventListener('scroll', addScrollIndicators);
    };
  }, [isMobileDevice]);
  
  // Gestione del font size su mobile
  const handleMobileFontSizeToggle = () => {
    console.log("🔍 handleMobileFontSizeToggle chiamato");
    console.log("🔍 Stack trace:", new Error().stack);
    console.trace("Traccia completa font size toggle");
    
    // Chiudi l'altro modale se aperto
    if (showMobileColorPicker) {
      setShowMobileColorPicker(false);
      document.body.classList.remove('color-picker-open');
    }
    
    // Controlla se stiamo aprendo o chiudendo
    if (!showMobileFontSizeTool) {
      console.log("🔍 Apertura font size tool");
      // Applica immediatamente la dimensione corrente
      const fontSize = detectFontSize();
      setCurrentFontSize(parseInt(fontSize) || 16);
      
      // Stiamo aprendo il tool
      document.body.classList.add('font-size-tool-open');
      document.body.style.overflow = 'hidden';
    } else {
      console.log("🔍 Chiusura font size tool");
      // Stiamo chiudendo il tool
      document.body.classList.remove('font-size-tool-open');
      document.body.style.overflow = '';
    }
    
    // Inverti lo stato DOPO aver verificato la condizione precedente
    setShowMobileFontSizeTool(prev => !prev);
    setLastAction("font-size-toggle-" + new Date().getTime());
  };
  
  // Gestione della palette colori su mobile
  const handleMobileColorPickerToggle = () => {
    console.log("🎨 handleMobileColorPickerToggle chiamato");
    console.log("🎨 Stack trace:", new Error().stack);
    console.trace("Traccia completa color picker toggle");
    
    // Chiudi l'altro modale se aperto
    if (showMobileFontSizeTool) {
      setShowMobileFontSizeTool(false);
      document.body.classList.remove('font-size-tool-open');
    }
    
    // Controlla se stiamo aprendo o chiudendo
    if (!showMobileColorPicker) {
      console.log("🎨 Apertura color picker");
      // Stiamo aprendo la palette
      document.body.classList.add('color-picker-open');
      document.body.style.overflow = 'hidden';
    } else {
      console.log("🎨 Chiusura color picker");
      // Stiamo chiudendo la palette
      document.body.classList.remove('color-picker-open');
      document.body.style.overflow = '';
    }
    
    // Inverti lo stato DOPO aver verificato la condizione precedente
    setShowMobileColorPicker(prev => !prev);
    setLastAction("color-picker-toggle-" + new Date().getTime());
  };
  
  // Chiusura degli strumenti quando si tocca fuori
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showMobileFontSizeTool && 
        fontSizeToolRef.current && 
        !fontSizeToolRef.current.contains(event.target)
      ) {
        setShowMobileFontSizeTool(false)
        document.body.style.overflow = ''
        document.body.classList.remove('font-size-tool-open')
      }
      
      if (
        showMobileColorPicker && 
        colorPickerRef.current && 
        !colorPickerRef.current.contains(event.target)
      ) {
        setShowMobileColorPicker(false)
        document.body.style.overflow = ''
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMobileFontSizeTool, showMobileColorPicker])
  
  // Applicazione della dimensione del testo da mobile
  const applyMobileFontSize = (size) => {
    setCurrentFontSize(size)
    applyFontSize(size + 'px')
  }
  
  // Applicazione del colore da mobile
  const applyMobileColor = (color) => {
    if (!editor) return;
    
    // Salva il colore selezionato
    setSelectedColor(color);
    
    // Applica il colore al testo selezionato usando l'API di TipTap
    editor
      .chain()
      .focus()
      .setMark('textStyle', { color: color })
      .run();
    
    // Chiudi il modale dopo aver applicato il colore
    setShowMobileColorPicker(false);
    document.body.style.overflow = '';
    
    // Log per debug
    console.log("Colore applicato:", color);
  }
  
  // Aggiungi questi componenti all'interno del componente Editor
  
  // Componente per la selezione della dimensione del testo su mobile
  const MobileFontSizeTool = () => {
    console.log("📏 Rendering font size tool, visible:", showMobileFontSizeTool, "last action:", lastAction);
    
    return (
      <>
        {/* Aggiungi un overlay più visibile */}
        <div 
          className={`tool-overlay ${showMobileFontSizeTool ? 'active' : ''}`}
          style={{ zIndex: 1999 }}
              onClick={() => {
            console.log("Overlay clicked");
            setShowMobileFontSizeTool(false);
            document.body.style.overflow = '';
            document.body.classList.remove('font-size-tool-open');
          }}
        ></div>
        
        <div 
          ref={fontSizeToolRef}
          className={`mobile-font-size-tool ${showMobileFontSizeTool ? 'active' : ''}`}
          style={{ zIndex: 2000 }}
        >
          <div className="swipe-indicator"></div>
          <div className="tool-header">
            <h3>Dimensione testo</h3>
            <button 
              className="close-btn" 
              onClick={() => {
                console.log("Font size button clicked");
                setShowMobileFontSizeTool(false);
                document.body.style.overflow = '';
                document.body.classList.remove('font-size-tool-open');
              }}
            >
              <FiX size={24} />
            </button>
          </div>
          
          <div className="font-size-preview" style={{ fontSize: `${currentFontSize}px` }}>
            Anteprima testo
          </div>
          
          <div className="font-size-slider-container mt-3">
            <input
              type="range"
              min="10"
              max="48"
              step="1"
              value={currentFontSize}
              onChange={(e) => setCurrentFontSize(parseInt(e.target.value))}
              className="font-size-slider w-100"
            />
            <div className="font-size-range d-flex justify-content-between">
              <span>10px</span>
              <span>48px</span>
            </div>
          </div>
          
          <div className="font-size-presets mt-3">
            <div className="d-flex flex-wrap justify-content-between">
              {fontSizePresets.map(size => (
                <button
                  key={size}
                  className={`preset-btn ${currentFontSize === size ? 'active' : ''}`}
                  onClick={() => setCurrentFontSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          
          <div className="tool-footer mt-3 d-flex justify-content-end">
            <button 
              className="btn btn-primary apply-btn"
              onClick={() => {
                applyMobileFontSize(currentFontSize)
                setShowMobileFontSizeTool(false)
                document.body.style.overflow = ''
                document.body.classList.remove('font-size-tool-open')
              }}
            >
              Applica
            </button>
          </div>
        </div>
      </>
    )
  }
  
  // Componente per la selezione del colore su mobile
  const MobileColorPicker = () => {
    console.log("🎨 Rendering color picker, visible:", showMobileColorPicker, "last action:", lastAction);
    
    return (
      <>
        <div className={`tool-overlay ${showMobileColorPicker ? 'active' : ''}`}></div>
        <div 
          ref={colorPickerRef}
          className={`mobile-color-picker ${showMobileColorPicker ? 'active' : ''}`}
        >
          <div className="swipe-indicator"></div>
          <div className="tool-header">
            <h3>Colore testo</h3>
            <button 
              className="close-btn" 
              onClick={() => {
                setShowMobileColorPicker(false)
                document.body.style.overflow = ''
              }}
            >
              <FiX size={24} />
            </button>
          </div>
          
          <div className="color-picker-grid">
            {colorOptions.map(color => (
              <div
                key={color}
                className={`color-option ${selectedColor === color ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => {
                  applyMobileColor(color)
                  setShowMobileColorPicker(false)
                  document.body.style.overflow = ''
                }}
              ></div>
            ))}
          </div>
        </div>
      </>
    )
  }
  
  // Aggiungi questo effetto per migliorare la visibilità dei modali
  useEffect(() => {
    // Quando un modale è aperto, aggiungi una classe al body
    if (showMobileFontSizeTool || showMobileColorPicker) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    
    // Log per debug
    console.log("Font size tool visibility:", showMobileFontSizeTool);
    console.log("Color picker visibility:", showMobileColorPicker);
    
  }, [showMobileFontSizeTool, showMobileColorPicker]);

  return (
    <div className={`editor-container d-flex flex-column h-100 ${isMobileDevice ? 'mobile-mode' : ''} ${isKeyboardVisible ? 'keyboard-visible' : ''}`}>
      {!isMobileDevice && (
        <div className="editor-toolbar">
          <ButtonToolbar className="d-flex gap-3" style={{ flexWrap: 'nowrap' }}>
            {/* Gruppo per la formattazione del testo */}
            <ButtonGroup className="flex-nowrap toolbar-group">
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Grassetto')}>
                <Button
                  variant={editor.isActive('bold') ? 'primary' : 'light'}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className="toolbar-btn"
                >
                  <FiBold />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Corsivo')}>
                <Button
                  variant={editor.isActive('italic') ? 'primary' : 'light'}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className="toolbar-btn"
                >
                  <FiItalic />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Codice inline')}>
                <Button
                  variant={editor.isActive('code') ? 'primary' : 'light'}
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  className="toolbar-btn"
                >
                  <FiCode />
                </Button>
              </OverlayTrigger>
            </ButtonGroup>
            
            {/* Gruppo per i titoli */}
            <ButtonGroup className="flex-nowrap toolbar-group">
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Titolo 1')}>
              <Button
                variant={editor.isActive('heading', { level: 1 }) ? 'primary' : 'light'}
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                  className="toolbar-btn"
              >
                <FiType /> H1
              </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Titolo 2')}>
              <Button
                variant={editor.isActive('heading', { level: 2 }) ? 'primary' : 'light'}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  className="toolbar-btn"
              >
                <FiType className="me-1" /> H2
              </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Titolo 3')}>
              <Button
                variant={editor.isActive('heading', { level: 3 }) ? 'primary' : 'light'}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                  className="toolbar-btn"
              >
                <FiType className="me-1" /> H3
              </Button>
              </OverlayTrigger>
            </ButtonGroup>
            
            {/* Gruppo per le liste */}
            <ButtonGroup className="flex-nowrap toolbar-group">
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Elenco puntato')}>
              <Button
                variant={editor.isActive('bulletList') ? 'primary' : 'light'}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                  className="toolbar-btn"
              >
                <FiList />
              </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Elenco numerato')}>
              <Button
                variant={editor.isActive('orderedList') ? 'primary' : 'light'}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  className="toolbar-btn"
              >
                <FiList className="me-1" /> 123
              </Button>
              </OverlayTrigger>
            </ButtonGroup>
            
            {/* Gruppo per la personalizzazione del testo */}
            <ButtonGroup className="flex-nowrap toolbar-group">
              {/* Pulsante per la dimensione del testo con slider */}
              <OverlayTrigger
                trigger="click"
                placement={isMobileDevice ? "top" : "bottom"}
                show={showFontSizeSlider}
                onToggle={() => setShowFontSizeSlider(!showFontSizeSlider)}
                overlay={
                  <Popover id="font-size-popover" className={`font-size-popover ${isMobileDevice ? 'mobile-popover' : ''}`}>
                    <Popover.Header as="h3">Dimensione testo: {fontSize}px</Popover.Header>
                    <Popover.Body>
                      <div className="font-size-slider-container">
                        <div className="font-size-preview" style={{ fontSize: `${fontSize}px` }}>
                          Aa
                        </div>
                        <Form.Range
                          min="8"
                          max="72"
                          step="1"
                          value={fontSize}
                          onChange={handleFontSizeChange}
                          onInput={handleFontSizeInput}
                          className="font-size-slider"
                        />
                        <div className="font-size-range">
                          <span>8px</span>
                          <span>72px</span>
                        </div>
                        {isMobileDevice && (
                          <Button 
                            variant="primary" 
                            className="w-100 mt-2"
                            onClick={() => setShowFontSizeSlider(false)}
                          >
                            Applica
                          </Button>
                        )}
                      </div>
                    </Popover.Body>
                  </Popover>
                }
              >
                <Button
                  ref={fontSizeRef}
                  variant="light"
                  className="toolbar-btn font-size-btn"
                  onClick={handleFontSizeButtonClick}
                >
                  <MdFormatSize />
                  <span className="font-size-value">{fontSize}</span>
                </Button>
              </OverlayTrigger>
              
              {/* Pulsante per il colore del testo - versione migliorata */}
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Colore testo')}>
                <Dropdown show={showColorPicker} onToggle={() => setShowColorPicker(!showColorPicker)}>
                  <Dropdown.Toggle variant="light" className="toolbar-btn color-picker-btn">
                    <IoColorPaletteOutline className="icon-main" />
                    <MdArrowDropDown className="icon-dropdown" />
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="color-picker-menu">
                    <div className="color-picker-header">Colore testo</div>
                    <div className="color-picker-grid">
                      {[
                        '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
                        '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
                        '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'
                      ].map(color => (
                        <div 
                          key={color} 
                          className="color-option" 
                          style={{ backgroundColor: color }} 
                          onClick={() => applyTextColor(color)}
                          title={color}
                        >
                          {/* Indicatore di selezione per il colore attivo */}
                          {editor && editor.isActive('textStyle', { color }) && (
                            <div className="color-selected-indicator" />
                          )}
                        </div>
                      ))}
                    </div>
                  </Dropdown.Menu>
                </Dropdown>
              </OverlayTrigger>
              
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Inserisci link')}>
              <Button
                variant={editor.isActive('link') ? 'primary' : 'light'}
                  onClick={handleSetLink}
                  className="toolbar-btn"
              >
                <FiLink />
              </Button>
              </OverlayTrigger>
            </ButtonGroup>
          </ButtonToolbar>
        </div>
      )}
      
      <div className="editor-content-container flex-grow-1 overflow-hidden position-relative">
        {isMobileDevice && <MobileToolbar />}
        <EditorContent editor={editor} className="editor-content h-100" />
        <FocusButton />
        
        {/* Aggiungi un pulsante flottante per accedere alle opzioni di formattazione su mobile */}
        {isMobileDevice && (
          <div className="mobile-format-button" onClick={toggleMobileOptions}>
            <FiType />
          </div>
        )}
        
        {/* Opzioni di formattazione mobile */}
        {isMobileDevice && showMobileOptions && (
          <div className="mobile-format-options">
            <div className="mobile-format-option" onClick={() => {
              editor.chain().focus().toggleHeading({ level: 1 }).run();
              setShowMobileOptions(false);
            }}>
              <span className="option-icon">H1</span>
              <span className="option-label">Titolo grande</span>
            </div>
            <div className="mobile-format-option" onClick={() => {
              editor.chain().focus().toggleHeading({ level: 2 }).run();
              setShowMobileOptions(false);
            }}>
              <span className="option-icon">H2</span>
              <span className="option-label">Titolo medio</span>
            </div>
            <div className="mobile-format-option" onClick={() => {
              editor.chain().focus().toggleBulletList().run();
              setShowMobileOptions(false);
            }}>
              <span className="option-icon">•</span>
              <span className="option-label">Elenco puntato</span>
            </div>
            <div className="mobile-format-option" onClick={() => {
              editor.chain().focus().toggleOrderedList().run();
              setShowMobileOptions(false);
            }}>
              <span className="option-icon">1.</span>
              <span className="option-label">Elenco numerato</span>
            </div>
            <div className="mobile-format-option" onClick={() => {
              handleFontSizeButtonClick();
              setShowMobileOptions(false);
            }}>
              <span className="option-icon"><MdFormatSize /></span>
              <span className="option-label">Dimensione testo</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Modale per l'inserimento sicuro dei link */}
      <Modal show={showLinkModal} onHide={() => setShowLinkModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Inserisci Link</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>URL</Form.Label>
              <Form.Control
                type="text"
                placeholder="https://esempio.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                pattern="^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$"
                ref={linkInputRef}
              />
              <Form.Text className="text-muted">
                Inserisci un URL valido per sicurezza.
              </Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowLinkModal(false)}>
            Annulla
          </Button>
          <Button variant="primary" onClick={applyLink}>
            Inserisci Link
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

export default Editor
  