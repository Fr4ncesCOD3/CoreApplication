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
import Link from '@tiptap/extension-link'
import TextStyle from '@tiptap/extension-text-style'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { Button, ButtonGroup, ButtonToolbar, Dropdown, Form, Modal, OverlayTrigger, Popover, Tooltip } from 'react-bootstrap'
import { FiBold, FiItalic, FiCode, FiType, FiList, FiLink, FiX, FiDroplet, FiUnderline, FiMessageSquare, FiAlignLeft, FiAlignCenter, FiAlignRight, FiTrash2, FiHash, FiEdit3, FiFile, FiMinimize2, FiMaximize2, FiDownload } from 'react-icons/fi'
import { MdFormatSize, MdArrowDropDown, MdFormatColorText } from 'react-icons/md'
import { IoColorPaletteOutline } from 'react-icons/io5'
import DrawingNode from './DrawingNode'
import DocumentNode from './DocumentNode'
import './Editor.css'
import { toast } from '../../../utils/notification'
import api from '../../../utils/api'
import { debounce } from 'lodash'
import { CacheService } from '../../../utils/cache'
import { noteApi } from '../../../utils/api'

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

// Definisci i colori principali da mostrare nella barra degli strumenti mobile
const mainColors = [
  '#000000', // nero
  '#D50000', // rosso
  '#039BE5', // blu
  '#0B8043', // verde
  '#F6BF26'  // giallo
];

// Definisci tutti i colori per la palette completa
const colorOptions = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc',
  '#d50000', '#e67c73', '#f4511e', '#f6bf26', '#33b679', '#0b8043',
  '#039be5', '#3f51b5', '#7986cb', '#8e24aa', '#d81b60', '#ad1457',
  '#c0ca33', '#e4c441', '#fb8c00', '#fa573c', '#a52714', '#0097a7'
];

// Costanti per la configurazione dell'autosalvataggio
const AUTO_SAVE_INTERVAL = 60000; // 60 secondi
const AUTO_SAVE_DEBOUNCE = 1000; // 1 secondo di debounce per le modifiche
const SYNC_API_INTERVAL = 300000; // 5 minuti
const RETRY_INTERVAL = 30000; // 30 secondi per riprovarci in caso di errore

// Componente Editor
const Editor = ({ onContentChange, initialContent, activeNote, onTitleChange, onContentStatusChange = () => {}, onSaveContent, readOnly = false }) => {
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
  const [selectedColor, setSelectedColor] = useState('#000000')
  const [currentFontSize, setCurrentFontSize] = useState(16)
  const colorPickerRef = useRef(null)
  const fontSizeToolRef = useRef(null)
  
  // Dimensioni di testo predefinite
  const fontSizePresets = [12, 14, 16, 18, 20, 24, 28, 32, 36, 42]
  
  // Aggiungi uno stato per tracciare l'ultima azione
  const [lastAction, setLastAction] = useState(null);

  // Aggiungi uno stato per il caricamento
  const [isLoading, setIsLoading] = useState(false);

  // Riferimento per l'intervallo di salvataggio automatico
  const autoSaveIntervalRef = useRef(null);
  
  // Riferimento per tracciare modifiche
  const lastChangeRef = useRef(new Date());
  const autoSaveTimeoutRef = useRef(null);
  
  // Aggiungi questi nuovi stati
  const [lastSavedContent, setLastSavedContent] = useState('');
  const [contentChanged, setContentChanged] = useState(false);
  const autoSaveTimerRef = useRef(null);
  
  // Aggiungi stato per il buffer e lo stato del salvataggio
  const [saveBuffer, setSaveBuffer] = useState(null);
  const [saveState, setSaveState] = useState({
    lastSaved: null,
    saveInProgress: false,
    pendingChanges: false,
    retryCount: 0
  });
  
  // Aggiungi questi ref per gestire l'inattività
  const inactivityTimerRef = useRef(null);
  const localChangesRef = useRef(null);
  const isTypingRef = useRef(false);
  
  // Aggiungi uno stato per la sincronizzazione
  const syncTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const [syncState, setSyncState] = useState({
    lastSync: null,
    syncInProgress: false,
    pendingSync: false,
    retryCount: 0,
    offlineChanges: []
  });
  
  // Configura l'editor e il salvataggio automatico all'avvio
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
        placeholder: '',
      }),
      Link.configure({
        openOnClick: true,
        validate: href => /^https?:\/\//.test(href),
      }),
      TextStyle.configure({
        HTMLAttributes: {
          class: 'text-styled',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        defaultAlignment: 'left',
      }),
      FontSize,
      DrawingNode,
      DocumentNode,
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
        input: () => {
          // Marca il contenuto come modificato quando l'utente digita
          setContentChanged(true);
          return false;
        }
      },
      attributes: {
        class: 'mobile-optimized',
      },
    },
    content: initialContent || '',
    onUpdate: ({ editor }) => {
      if (!editor || editor.isEmpty || !activeNote) return;
      
      const newContent = editor.getHTML();
      
      // Ignora gli aggiornamenti se il contenuto è uguale a quello già salvato
      if (lastSavedContent === newContent) {
        return;
      }
      
      // Segna il momento dell'ultima modifica per tracciare l'attività dell'utente
      lastChangeRef.current = new Date();
      
      // Verifica che il contenuto sia realmente cambiato rispetto all'ultima versione 
      if (typeof newContent === 'string' && newContent !== '') {
        // Aggiorna lo stato locale
        setContentChanged(true);
        
        // Indica che ci sono modifiche pendenti da salvare
        setSaveState(prev => ({
          ...prev,
          pendingChanges: true
        }));
        
        // Notifica il componente parent del cambiamento
        if (onContentChange) {
          onContentChange(newContent);
        }
        
        // Aggiorna lo stato di modifica nel componente parent
        if (onContentStatusChange) {
          onContentStatusChange(true);
        }
        
        console.log(`Contenuto editor modificato dall'utente: ${activeNote.id} - ${new Date().toISOString()}`);
      }
    }
  })
  
  // IMPORTANTE: Definisci queste funzioni dopo aver inizializzato l'editor
  const insertDrawing = useCallback((dataUrl) => {
    if (!editor) return;
    
    const drawingNode = {
      type: 'drawing',
      dataUrl: dataUrl || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      attrs: {}
    };
    
    editor.chain().focus().insertContent(drawingNode).run();
  }, [editor]);
  
  const processAndInsertFile = useCallback((file) => {
    if (!editor) return Promise.resolve();
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      const fileName = file.name;
      const fileType = file.type;
      const fileSize = file.size;
      
      if (fileType.includes('image')) {
        reader.readAsDataURL(file);
      } else if (fileType.includes('pdf')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
      
      reader.onload = () => {
        const fileContent = reader.result;
        
        editor.chain().focus().insertContent({
          type: 'document',
          attrs: {
            fileName,
            fileType,
            fileSize,
            fileContent,
            id: 'doc-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
          }
        }).run();
        
        resolve();
      };
      
      reader.onerror = () => {
        console.error('Errore nella lettura del file');
        resolve(); // Risolvi comunque la promessa per evitare blocchi
      };
    });
  }, [editor]);
  
  const insertDocument = useCallback(() => {
    if (!editor) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      setIsLoading(true);
      
      // Gestisce più file
      const files = Array.from(e.target.files);
      
      // Processa ogni file in sequenza
      const processFiles = async () => {
        for (const file of files) {
          await processAndInsertFile(file);
        }
        setIsLoading(false);
      };
      
      processFiles();
    };
    input.click();
  }, [editor, processAndInsertFile, setIsLoading]);
  
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
    <Tooltip id="button-tooltip" {...props}>
      {text}
    </Tooltip>
  )
  
  // Gestione dell'inserimento dei link
  const handleSetLink = useCallback(() => {
    if (editor && editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }

    setLinkUrl('')
    setShowLinkModal(true)
  }, [editor])
  
  // Applicazione del link al testo selezionato
  const applyLink = useCallback((e) => {
    if (e) e.preventDefault();
    
    // Validazione dell'URL
    if (linkUrl) {
      const url = linkUrl.trim();
      let finalUrl = url;
      
      // Assicurati che l'URL sia completo
      if (!/^https?:\/\//i.test(url) && !url.startsWith('/') && !url.startsWith('#')) {
        finalUrl = `https://${url}`;
      }
      
      if (editor) {
        editor.chain().focus().setLink({ href: finalUrl }).run();
      }
    }
    
    setShowLinkModal(false);
  }, [editor, linkUrl])
  
  // Modifica la funzione applyFontSize per salvare la dimensione corrente
  const applyFontSize = useCallback((size) => {
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
  }, [editor]);
  
  // Aggiungi questa nuova funzione per rilevare la dimensione del testo selezionato
  const detectFontSize = useCallback(() => {
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
  }, [editor])
  
  // Modifica la funzione handleFontSizeButtonClick per rilevare la dimensione attuale
  const handleFontSizeButtonClick = useCallback(() => {
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
    }
  }, [editor, isMobileDevice, showFontSizeSlider]);
  
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
  const handleFontSizeInput = useCallback((e) => {
    const newSize = parseInt(e.target.value, 10);
    setFontSize(newSize);
    
    if (!editor) return;
    
    // Limitiamo le chiamate a modifiche significative
    if (Math.abs(newSize - fontSize) < 2) return;
    
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
  }, [editor, fontSize]);
  
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
    
    // Usiamo una ref per tenere traccia della dimensione corrente
    const fontSizeRef = { value: editor.storage.fontSize || 16 };
    
    // Crea un osservatore per le mutazioni DOM con debounce
    const debouncedUpdate = debounce(() => {
      // Usa il valore della ref anziché accedere allo state
      const currentFontSize = fontSizeRef.value;
      
      // Applica la dimensione del testo in modo sicuro
      if (editor && editor.isActive) {
        editor
          .chain()
          .focus()
          .setMark('textStyle', { fontSize: `${currentFontSize}px` })
          .run();
      }
    }, 150); // Aumento il ritardo per ridurre le chiamate
    
    const observer = new MutationObserver((mutations) => {
      let needsUpdate = false;
      
      // Verifica solo alcune mutazioni specifiche per ridurre gli aggiornamenti
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Verifica se gli elementi aggiunti sono paragrafi vuoti o simili
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1 && ['P', 'H1', 'H2', 'H3', 'LI'].includes(node.nodeName)) {
          needsUpdate = true;
              break;
            }
          }
        }
        
        if (needsUpdate) break;
      }
      
      if (needsUpdate) {
        debouncedUpdate();
      }
    });
    
    // Configura l'osservatore con opzioni molto limitate
    observer.observe(editor.view.dom, {
      childList: true,
      subtree: true,
      attributes: false, // Ignora i cambiamenti degli attributi
      characterData: false // Ignora i cambiamenti del testo
    });
    
    // Aggiorniamo la ref quando cambia lo state
    fontSizeRef.value = fontSize;
    
    // Cleanup
    return () => {
      observer.disconnect();
      debouncedUpdate.cancel(); // Cancella eventuali chiamate in sospeso
    };
  }, [editor, fontSize]);
  
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
    const isMobileRef = { value: window.innerWidth <= 767 };
    
    const checkMobileDevice = () => {
      const isMobile = window.innerWidth <= 767;
      if (isMobile !== isMobileRef.value) {
        isMobileRef.value = isMobile;
      setIsMobileDevice(isMobile);
      }
    };
    
    // Inizializza
    checkMobileDevice();
    
    // Usa un evento debounced per evitare troppi aggiornamenti
    const handleResize = debounce(checkMobileDevice, 250);
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      handleResize.cancel();
    };
  }, []);
  
  // Variabile per tracciare i tap
  let lastTap = 0;
  
  // Modifica il componente MobileToolbar per migliorare la gestione del touch
  const MobileToolbar = useCallback(() => {
    if (!editor) return null;
    
    // Aggiungi questa funzione per gestire meglio i tocchi sui pulsanti
    const handleToolbarButtonTouch = (action) => {
      // Previeni il comportamento di default del browser
      if (editor) {
        // Applica l'azione immediatamente
        action();
        
        // Fornisci feedback tattile se disponibile
        if (window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(50); // Vibrazione leggera di 50ms
        }
        
        // Assicurati che l'editor mantenga il focus
        setTimeout(() => {
          editor.commands.focus();
        }, 10);
      }
    };

    return (
      <div className="mobile-toolbar-container">
        <div className="mobile-toolbar">
          <div className="mobile-toolbar-scroll">
            {/* Gruppo per la formattazione del testo */}
            <Button
              variant="link"
              className={`mobile-toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
              onClick={() => handleToolbarButtonTouch(() => editor.chain().focus().toggleBold().run())}
              aria-label="Grassetto"
            >
              <FiBold />
            </Button>
            
            <Button
              variant="link"
              className={`mobile-toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
              onClick={() => handleToolbarButtonTouch(() => editor.chain().focus().toggleItalic().run())}
              aria-label="Corsivo"
            >
              <FiItalic />
            </Button>
            
            <Button
              variant="link"
              className={`mobile-toolbar-btn ${editor.isActive('code') ? 'active' : ''}`}
              onClick={() => handleToolbarButtonTouch(() => editor.chain().focus().toggleCode().run())}
              aria-label="Codice"
            >
              <FiCode />
            </Button>
            
            {/* Gruppo per i titoli */}
            <Button
              variant="link"
              className={`mobile-toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
              onClick={() => handleToolbarButtonTouch(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}
              aria-label="Titolo 1"
            >
              <span className="btn-text">H1</span>
            </Button>
            
            <Button
              variant="link"
              className={`mobile-toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
              onClick={() => handleToolbarButtonTouch(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
              aria-label="Titolo 2"
            >
              <span className="btn-text">H2</span>
            </Button>
            
            <Button
              variant="link"
              className={`mobile-toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`}
              onClick={() => handleToolbarButtonTouch(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
              aria-label="Titolo 3"
            >
              <span className="btn-text">H3</span>
            </Button>
            
            {/* Gruppo per le liste */}
            <Button
              variant="link"
              className={`mobile-toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
              onClick={() => handleToolbarButtonTouch(() => editor.chain().focus().toggleBulletList().run())}
              aria-label="Elenco puntato"
            >
              <FiList />
            </Button>
            
            <Button
              variant="link"
              className={`mobile-toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
              onClick={() => handleToolbarButtonTouch(() => editor.chain().focus().toggleOrderedList().run())}
                aria-label="Elenco numerato"
              >
                <FiHash />
              </Button>
            
            {/* Gruppo per la personalizzazione del testo */}
                          <Button 
              variant="link"
              className={`mobile-toolbar-btn ${showMobileFontSizeTool ? 'active' : ''}`}
              onClick={() => handleToolbarButtonTouch(handleMobileFontSizeToggleButton)}
                  aria-label="Dimensione testo"
                >
                  <MdFormatSize />
              <span className="btn-text">{fontSize}</span>
            </Button>
            
            {/* Pulsante per i link */}
            <Button
              variant="link"
              className={`mobile-toolbar-btn ${editor.isActive('link') ? 'active' : ''}`}
              onClick={() => handleToolbarButtonTouch(handleSetLink)}
              aria-label="Inserisci link"
            >
              <FiLink />
            </Button>
            
            {/* Aggiungi il pulsante di disegno */}
            <Button
              variant="link"
              className="mobile-toolbar-btn drawing-btn"
              onClick={() => insertDrawing()}
              aria-label="Disegno a mano libera"
            >
              <FiEdit3 />
            </Button>
            
            {/* Aggiungi il pulsante per inserire documenti */}
            <button
              className={`mobile-toolbar-btn`}
              onClick={insertDocument}
              title="Inserisci documento"
            >
              <FiFile />
              <span className="btn-text">Documento</span>
            </button>
          </div>
        </div>
      </div>
    );
  }, [editor, showMobileFontSizeTool, handleSetLink, insertDrawing, insertDocument]);
  
  // Modifica la funzione handleInput in useEffect per evitare duplicazioni
  useEffect(() => {
    if (!editor || !isMobileDevice) return;
    
    // Ora questa funzione si focalizza solo sugli aspetti dell'interazione utente
    const handleMobileInteraction = () => {
      setHasInteracted(true);
      setIsEditorFocused(true);
      localStorage.setItem('editorHasInteracted', 'true');
    };
    
    // Definisco un handler di selezione specifico per mobile
    const handleMobileSelectionChange = () => {
      console.log("🔍 Editor selection change rilevato")
    };
    
    editor.on('update', handleMobileInteraction);
    editor.on('selectionUpdate', handleMobileSelectionChange);
    
    return () => {
      editor.off('update', handleMobileInteraction);
      editor.off('selectionUpdate', handleMobileSelectionChange);
    };
  }, [editor, isMobileDevice]);
  
  // Funzione per gestire il toggle delle opzioni mobile
  // const toggleMobileOptions = () => {
  //   setShowMobileOptions(prevState => !prevState);
  //   
  //   // Chiudi automaticamente le opzioni dopo un po' di tempo
  //   if (!showMobileOptions) {
  //     setTimeout(() => {
  //       setShowMobileOptions(false);
  //     }, 5000); // Chiudi dopo 5 secondi di inattività
  //   }
  // };
  
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
  
  // Applicazione della dimensione del testo da mobile
  const applyMobileFontSize = (size) => {
    setCurrentFontSize(size)
    applyFontSize(size + 'px')
  }
  
  // Componente per la palette colori desktop
  const ColorPickerPopover = (
    <Popover id="color-picker-popover" className="color-picker-popover">
      <Popover.Header as="h3">Colore testo</Popover.Header>
      <Popover.Body>
        <div className="color-picker-grid">
          {colorOptions.map((color) => (
            <button
              key={color}
              className={`color-option ${selectedColor === color ? 'active' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => {
                // applyTextColor(color);
              }}
              aria-label={`Colore ${color}`}
            />
          ))}
        </div>
      </Popover.Body>
    </Popover>
  );
  
  // Componente per la palette colori mobile
  // const MobileColorPicker = () => {
  //   // ... codice del componente
  // };
  
  // Aggiungi questo effetto per migliorare la visibilità dei modali
  useEffect(() => {
    // Quando un modale è aperto, aggiungi una classe al body
    if (showMobileFontSizeTool || showColorPicker) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    
    // Log per debug
    console.log("Font size tool visibility:", showMobileFontSizeTool);
    console.log("Color picker visibility:", showColorPicker);
    
  }, [showMobileFontSizeTool, showColorPicker]);

  // Aggiungi questa definizione del componente prima del return finale
  const MobileFontSizeTool = () => {
    return (
      <>
        <div 
          className={`tool-overlay ${showMobileFontSizeTool ? 'active' : ''}`}
          style={{ zIndex: 1999 }}
          onClick={() => {
            setShowMobileFontSizeTool(false);
            document.body.style.overflow = '';
          }}
        ></div>
        
        <div 
          className={`mobile-font-size-tool ${showMobileFontSizeTool ? 'active' : ''}`}
          style={{ zIndex: 2000 }}
        >
          <div className="swipe-indicator"></div>
          <div className="tool-header">
            <h3>Dimensione testo: {fontSize}px</h3>
            <button 
              className="close-btn" 
              onClick={() => {
                setShowMobileFontSizeTool(false);
                document.body.style.overflow = '';
              }}
            >
              <FiX size={24} />
            </button>
          </div>
          
          <div className="font-size-slider-container mt-3">
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
          </div>
          
          <div className="tool-footer mt-3 d-flex justify-content-end">
            <button 
              className="btn btn-primary apply-btn"
              onClick={() => {
                applyFontSize(fontSize);
                setShowMobileFontSizeTool(false);
                document.body.style.overflow = '';
              }}
            >
              Applica
            </button>
          </div>
        </div>
      </>
    );
  };

  // Aggiungi un effetto per gestire meglio la selezione su mobile
  useEffect(() => {
    if (!editor) return;
    
    // Funzione per aggiornare il colore selezionato in base alla selezione corrente
    const updateSelectedColor = () => {
      if (editor.isActive('textStyle')) {
        const attrs = editor.getAttributes('textStyle');
        if (attrs.color) {
          setSelectedColor(attrs.color);
        }
      }
    };
    
    // Aggiungi un listener per l'evento selectionUpdate
    editor.on('selectionUpdate', updateSelectedColor);
    
    return () => {
      editor.off('selectionUpdate', updateSelectedColor);
    };
  }, [editor]);

  // Aggiungi questo all'inizio della funzione Editor
  useEffect(() => {
    console.log("Editor theme:", document.documentElement.getAttribute('data-theme'));
    
    // Verifica se le regole CSS sono applicate correttamente
    const styleSheets = document.styleSheets;
    for (let i = 0; i < styleSheets.length; i++) {
      try {
        const rules = styleSheets[i].cssRules || styleSheets[i].rules;
        for (let j = 0; j < rules.length; j++) {
          if (rules[j].selectorText && rules[j].selectorText.includes('[data-theme="dark"] .ProseMirror [style*="color"]')) {
            console.log("Found problematic CSS rule:", rules[j].cssText);
          }
        }
      } catch (e) {
        // Ignora errori CORS
      }
    }
  }, []);

  // Aggiungi un useEffect per rilevare se il dispositivo è mobile
  useEffect(() => {
    const checkMobileDevice = () => {
      const isMobile = window.innerWidth <= 767;
      setIsMobileDevice(isMobile);
    };
    
    checkMobileDevice();
    window.addEventListener('resize', checkMobileDevice);
    
    return () => {
      window.removeEventListener('resize', checkMobileDevice);
    };
  }, []);

  // Aggiungi questo effetto per gestire il padding dell'editor su mobile
  useEffect(() => {
    if (!editor || !isMobileDevice) return;
    
    const editorElement = editor.view.dom;
    const toolbarHeight = document.querySelector('.mobile-toolbar-container')?.offsetHeight || 60;
    
    // Aggiungi padding in basso all'editor per evitare che il contenuto venga nascosto dalla toolbar
    editorElement.style.paddingBottom = `${toolbarHeight + 20}px`;
    
    // Aggiorna il padding quando cambia l'orientamento del dispositivo
    const handleResize = () => {
      const updatedToolbarHeight = document.querySelector('.mobile-toolbar-container')?.offsetHeight || 60;
      editorElement.style.paddingBottom = `${updatedToolbarHeight + 20}px`;
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [editor, isMobileDevice]);

  // Funzioni per applicare l'allineamento tramite classi CSS
  const applyLeftAlign = () => {
    if (!editor) return;
    
    // Rimuovi tutte le classi di allineamento
    editor.chain().focus().removeClass('text-center').removeClass('text-right').run();
  };

  const applyCenterAlign = () => {
    if (!editor) return;
    
    // Rimuovi altre classi di allineamento e aggiungi text-center
    editor.chain().focus().removeClass('text-right').addClass('text-center').run();
  };

  const applyRightAlign = () => {
    if (!editor) return;
    
    // Rimuovi altre classi di allineamento e aggiungi text-right
    editor.chain().focus().removeClass('text-center').addClass('text-right').run();
  };

  // Aggiungi questo effetto per migliorare la gestione del focus su mobile
  useEffect(() => {
    if (!editor || !isMobileDevice) return;
    
    // Funzione per gestire il tocco sull'editor
    const handleEditorTouch = () => {
      // Assicurati che l'editor abbia il focus
      if (!editor.isFocused) {
        editor.commands.focus();
      }
      
      // Nascondi la tastiera virtuale quando si tocca fuori da un campo di input
      document.activeElement.blur();
    };
    
    // Funzione per gestire il tocco sui pulsanti della toolbar
    const handleToolbarTouch = (e) => {
      // Previeni che il tocco sui pulsanti della toolbar tolga il focus all'editor
      e.stopPropagation();
    };
    
    // Aggiungi gli event listener
    const editorElement = editor.view.dom;
    editorElement.addEventListener('touchstart', handleEditorTouch);
    
    const toolbarElement = document.querySelector('.mobile-toolbar');
    if (toolbarElement) {
      toolbarElement.addEventListener('touchstart', handleToolbarTouch);
    }
    
    // Cleanup
    return () => {
      editorElement.removeEventListener('touchstart', handleEditorTouch);
      if (toolbarElement) {
        toolbarElement.removeEventListener('touchstart', handleToolbarTouch);
      }
    };
  }, [editor, isMobileDevice]);

  // Aggiungi questo effetto per gestire lo scrolling automatico
  useEffect(() => {
    if (!editor || !isMobileDevice) return;
    
    // Funzione per gestire lo scrolling automatico
    const handleAutoScroll = () => {
      const { selection } = editor.state;
      if (!selection) return;
      
      // Ottieni la posizione del cursore
      const { from } = selection;
      const pos = editor.view.coordsAtPos(from);
      
      // Ottieni l'altezza della toolbar
      const toolbarHeight = document.querySelector('.mobile-toolbar-container')?.offsetHeight || 60;
      
      // Se il cursore è vicino alla toolbar, scorri verso l'alto
      const viewportHeight = window.innerHeight;
      const bottomThreshold = viewportHeight - toolbarHeight - 50;
      
      if (pos.bottom > bottomThreshold) {
        // Calcola quanto scorrere
        const scrollAmount = pos.bottom - bottomThreshold + 20;
        
        // Scorri dolcemente
        window.scrollBy({
          top: scrollAmount,
          behavior: 'smooth'
        });
      }
    };
    
    // Aggiungi l'event listener per l'input
    editor.on('update', handleAutoScroll);
    
    // Cleanup
    return () => {
      editor.off('update', handleAutoScroll);
    };
  }, [editor, isMobileDevice]);

  // Aggiungi questo ref per il riferimento all'editor
  const editorInstanceRef = useRef(null);
  
  // ... existing code ...
  
  // Sostituisci tutte le chiamate a editor.current con editor
  useEffect(() => {
    if (editor) {
      editorInstanceRef.current = editor;
    }
  }, [editor]);
  
  // ... existing code ...
  
  // Funzione per salvare automaticamente la bozza nel session storage
  const saveToSessionStorage = useCallback((content) => {
    if (!activeNote || !content) return;
    
    // Salva nel session storage
    CacheService.saveDraft(activeNote.id, content);
    
    // Aggiorna lo stato di salvataggio
    setSaveState(prev => ({
      ...prev,
      lastSaved: new Date(),
      pendingChanges: true
    }));
    
    console.log(`Bozza salvata in session storage per nota ${activeNote.id}`);
  }, [activeNote]);

  // Funzione debounced per gestire le modifiche del contenuto
  const handleContentChange = useCallback(
    debounce((newContent) => {
      if (!activeNote) return;
      
      // Aggiorna lo stato changed solo se il contenuto è diverso dall'originale
      const hasChanged = newContent !== lastSavedContent;
      setContentChanged(hasChanged);
      onContentStatusChange(hasChanged);
      
      // Notifica il componente parent
      onContentChange(newContent);
      
      // Salva in session storage
      saveToSessionStorage(newContent);
      
      // Aggiorna il riferimento dell'ultima modifica
      lastChangeRef.current = new Date();
    }, AUTO_SAVE_DEBOUNCE),
    [activeNote, lastSavedContent, onContentChange, onContentStatusChange, saveToSessionStorage]
  );

  // Funzione per sincronizzare con il backend
  const syncWithBackend = useCallback(async (force = false) => {
    // Non sincronizzare se non ci sono modifiche o se è già in corso una sincronizzazione
    if ((!force && !saveState.pendingChanges) || saveState.saveInProgress || !activeNote) {
      return;
    }
    
    // Aggiorna lo stato di sincronizzazione
    setSaveState(prev => ({
      ...prev,
      saveInProgress: true
    }));
    
    try {
      console.log(`Sincronizzazione con il backend per nota ${activeNote.id}`);
      
      // Ottieni il contenuto corrente dell'editor
      const content = editor ? editor.getHTML() : null;
      if (!content) return;
      
      // Verifica se il contenuto ha già subito escape multipli
      let contentToSave = content;
      
      // Invia la richiesta al backend
      await noteApi.updateNote(activeNote.id, {
        content: contentToSave,
        updatedAt: new Date().toISOString()
      });
      
      // Aggiorna lo stato dopo il successo
      setSaveState({
        lastSaved: new Date(),
        saveInProgress: false,
        pendingChanges: false,
        retryCount: 0
      });
      
      // Rimuovi la bozza dal session storage dopo il salvataggio riuscito
      CacheService.removeDraft(activeNote.id);
      
      // Aggiorna la referenza del contenuto salvato
      setLastSavedContent(content);
      
      console.log(`Nota ${activeNote.id} sincronizzata con successo`);
      
      // Notifica il componente parent che il contenuto è stato salvato
      if (onSaveContent) {
        onSaveContent(activeNote.id, content);
      }
    } catch (error) {
      console.error(`Errore durante la sincronizzazione della nota ${activeNote?.id}:`, error);
      
      // Incrementa il contatore di tentativi e imposta lo stato
      setSaveState(prev => ({
        ...prev,
        saveInProgress: false,
        pendingChanges: true,
        retryCount: prev.retryCount + 1
      }));
      
      // Se offline, salva comunque nel session storage
      if (!navigator.onLine) {
        toast.info("Modifiche salvate localmente. Verranno sincronizzate automaticamente quando tornerai online.");
      } else if (saveState.retryCount >= 3) {
        // Dopo 3 tentativi falliti, mostra un messaggio all'utente
        toast.warning("Impossibile salvare le modifiche sul server. I tuoi cambiamenti sono stati salvati localmente e verranno sincronizzati in seguito.");
      }
    }
  }, [activeNote, editor, lastSavedContent, onSaveContent, saveState]);

  // Configura il timer di salvataggio automatico
  useEffect(() => {
    if (!activeNote || !editor || readOnly) return;
    
    // Configura l'autosalvataggio periodico
    autoSaveIntervalRef.current = setInterval(() => {
        const content = editor.getHTML();
      
      // Verifica se ci sono modifiche non salvate
        if (content !== lastSavedContent) {
        saveToSessionStorage(content);
      }
    }, AUTO_SAVE_INTERVAL);
    
    // Configura il timer di sincronizzazione con il backend
    syncTimerRef.current = setInterval(() => {
      syncWithBackend();
    }, SYNC_API_INTERVAL);
    
    // Cleanup
    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
      
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
      
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [activeNote, editor, lastSavedContent, saveToSessionStorage, syncWithBackend, readOnly]);

  // Aggiungi un event listener per quando la connessione viene ripristinata
  useEffect(() => {
    const handleOnline = () => {
      console.log("Connessione ripristinata, sincronizzazione in corso...");
      
      // Tenta di sincronizzare immediatamente quando torniamo online
      if (saveState.pendingChanges) {
        syncWithBackend(true);
      }
    };
    
    window.addEventListener('online', handleOnline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [saveState.pendingChanges, syncWithBackend]);

  // Modifica l'useEffect per il caricamento della nota
  useEffect(() => {
    // Esegui solo se editor è definito
    if (!editor) return;
    
    // Verifica se l'utente sta attivamente digitando o ha appena fatto modifiche
    const isUserCurrentlyEditing = saveState.pendingChanges || (lastChangeRef.current && (new Date() - lastChangeRef.current) < 2000);
    
    // Se l'utente sta modificando il contenuto attivamente, non sovrascrivere le sue modifiche
    if (isUserCurrentlyEditing) {
      console.log('Utente sta attivamente modificando il contenuto, evito sovrascrittura');
      return;
    }
    
    // Quando activeNote cambia o quando non c'è activeNote, aggiorniamo l'editor
    console.log('Aggiornamento editor con nota attiva:', activeNote?.id);
    
    if (!activeNote) {
      // Se non c'è nessuna nota attiva, svuota l'editor
      editor.commands.clearContent();
      return;
    }
    
    // Ottieni la bozza più recente dalla sessione
    const draft = CacheService.getDraft(activeNote.id);
    
    // Determina quale contenuto usare
    let contentToLoad = '';
    
    if (draft && draft.content) {
      // Se esiste una bozza, usa il suo contenuto
      contentToLoad = draft.content;
      console.log('Caricata bozza per la nota:', activeNote.id);
      
      // Segnala che ci sono modifiche non salvate
      setContentChanged(true);
      onContentStatusChange(true);
      
      // Imposta lo stato di salvataggio
      setSaveState(prev => ({
        ...prev,
        pendingChanges: true
      }));
    } else {
      // Altrimenti usa il contenuto originale della nota
      contentToLoad = activeNote.content || '';
      console.log('Caricato contenuto originale per nota:', activeNote.id);
      
      // Resetta lo stato "modificato"
      setContentChanged(false);
      onContentStatusChange(false);
      
      // Resetta lo stato di salvataggio
      setSaveState({
        lastSaved: new Date(),
        saveInProgress: false,
        pendingChanges: false,
        retryCount: 0
      });
    }
    
    // Verifica se il contenuto è già correttamente formattato come HTML
    // o se contiene caratteri escaped che devono essere decodificati
    if (contentToLoad.includes('&amp;lt;') || contentToLoad.includes('&lt;p')) {
      // Tenta di correggere l'HTML con escape multipli
      console.warn('Rilevato HTML con escape multipli. Tentativo di correzione...');
      let fixedContent = contentToLoad;
      // Applica decodifica fino a quando non ci sono più cambiamenti
      let lastResult = '';
      while (fixedContent !== lastResult) {
        lastResult = fixedContent;
        fixedContent = fixedContent
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
      }
      contentToLoad = fixedContent;
    }
    
    // Controlla se il contenuto dell'editor è già uguale a quello da caricare per evitare aggiornamenti inutili
    const currentContent = editor.getHTML();
    if (currentContent === contentToLoad) {
      console.log('Il contenuto dell\'editor è già aggiornato, nessuna modifica necessaria');
      return;
    }
    
    // Memorizza l'ID della nota che stiamo caricando per evitare aggiornamenti incompleti
    const noteIdBeingLoaded = activeNote.id;
    
    // Usa un timeout di 0ms per assicurarsi che il comando venga eseguito dopo il ciclo corrente di eventi
    setTimeout(() => {
      // Verifica che la nota attiva non sia cambiata durante l'esecuzione del timeout
      if (activeNote && activeNote.id === noteIdBeingLoaded) {
        // Imposta direttamente il contenuto nell'editor
        try {
          editor.commands.setContent(contentToLoad || '');
          console.log('Contenuto editor aggiornato correttamente');
          
          // Salva il contenuto originale per confronto
          setLastSavedContent(activeNote.content || '');
          
          // Esegui azioni aggiuntive quando si carica una nuova nota
          editor.commands.focus('end'); // Posiziona il cursore alla fine del testo
        } catch (error) {
          console.error('Errore nell\'aggiornamento del contenuto dell\'editor:', error);
        }
      } else {
        console.log('Nota attiva cambiata durante il caricamento, caricamento interrotto');
      }
    }, 0);
  }, [editor, activeNote, onContentStatusChange]); // Dipendenza da activeNote, non da activeNote.id o activeNote.content

  // Migliora la gestione del drag and drop
  const handleEditorDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Rimuovi la classe drag-over
    if (editorRef.current) {
      editorRef.current.classList.remove('drag-over');
    }
    
    setIsLoading(true);
    
    // Gestisci più file
    const files = Array.from(e.dataTransfer.files);
    
    // Processa ogni file in sequenza
    const processFiles = async () => {
      for (const file of files) {
        await processAndInsertFile(file);
      }
      setIsLoading(false);
    };
    
    processFiles();
  };

  useEffect(() => {
    // Rimuovo gli intervalli di autosalvataggio e sincronizzazione
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
      autoSaveIntervalRef.current = null;
    }
    
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    
    if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    
    return () => {
      // Cleanup all intervals
      if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current);
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, []);

  return (
    <div className={`editor-container d-flex flex-column h-100 ${isMobileDevice ? 'mobile-mode' : ''} ${isKeyboardVisible ? 'keyboard-visible' : ''}`}>
      {!isMobileDevice && editor && (
        <div className="editor-toolbar">
          <ButtonToolbar className="d-flex gap-3" style={{ flexWrap: 'nowrap' }}>
            {/* Gruppo per la formattazione del testo */}
            <ButtonGroup className="flex-nowrap toolbar-group">
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Grassetto')}>
                <Button
                  variant={editor.isActive('bold') ? 'primary' : 'light'}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className="toolbar-btn"
                  active={editor.isActive('bold')}
                  aria-label="Grassetto"
                >
                  <FiBold />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Corsivo')}>
                <Button
                  variant={editor.isActive('italic') ? 'primary' : 'light'}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className="toolbar-btn"
                  active={editor.isActive('italic')}
                  aria-label="Corsivo"
                >
                  <FiItalic />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Codice inline')}>
                <Button
                  variant={editor.isActive('code') ? 'primary' : 'light'}
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  className="toolbar-btn"
                  active={editor.isActive('code')}
                  aria-label="Codice inline"
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
                active={editor.isActive('heading', { level: 1 })}
                aria-label="Titolo 1"
              >
                <FiType /> H1
              </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Titolo 2')}>
              <Button
                variant={editor.isActive('heading', { level: 2 }) ? 'primary' : 'light'}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  className="toolbar-btn"
                active={editor.isActive('heading', { level: 2 })}
                aria-label="Titolo 2"
              >
                <FiType className="me-1" /> H2
              </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Titolo 3')}>
              <Button
                variant={editor.isActive('heading', { level: 3 }) ? 'primary' : 'light'}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                  className="toolbar-btn"
                active={editor.isActive('heading', { level: 3 })}
                aria-label="Titolo 3"
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
                active={editor.isActive('bulletList')}
                aria-label="Elenco puntato"
              >
                <FiList />
              </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Elenco numerato')}>
              <Button
                variant={editor.isActive('orderedList') ? 'primary' : 'light'}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  className="toolbar-btn"
                active={editor.isActive('orderedList')}
                aria-label="Elenco numerato"
              >
                <FiHash />
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
                  active={showFontSizeSlider}
                  aria-label="Dimensione testo"
                >
                  <MdFormatSize />
                  <span className="font-size-value">{fontSize}</span>
                </Button>
              </OverlayTrigger>
              
              {/* Pulsante per il colore del testo */}
              {/* Rimuovi questo blocco di codice */}
              {/* <OverlayTrigger
                trigger="click"
                placement="bottom"
                show={showColorPicker && !isMobileDevice}
                onToggle={() => !isMobileDevice && setShowColorPicker(!showColorPicker)}
                overlay={ColorPickerPopover}
              >
                <Button
                  variant="light"
                  className="toolbar-btn color-btn"
                  onClick={() => !isMobileDevice && handleColorPickerToggle()}
                  active={showColorPicker}
                  aria-label="Colore testo"
                >
                  <IoColorPaletteOutline />
                  <span 
                    className="color-indicator" 
                    style={{ 
                      backgroundColor: selectedColor,
                      display: 'inline-block',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      marginLeft: '4px'
                    }}
                  ></span>
                </Button>
              </OverlayTrigger> */}
              
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Inserisci link')}>
                <Button
                  variant={editor.isActive('link') ? 'primary' : 'light'}
                  onClick={handleSetLink}
                  className="toolbar-btn"
                  active={editor.isActive('link')}
                  aria-label="Inserisci link"
                >
                  <FiLink />
                </Button>
              </OverlayTrigger>
            </ButtonGroup>
            
            {/* Aggiungi un nuovo gruppo per il disegno */}
            <ButtonGroup className="flex-nowrap toolbar-group">
              <OverlayTrigger placement="top" overlay={(props) => renderTooltip(props, 'Disegno a mano libera')}>
                <Button
                  variant="light"
                  onClick={insertDrawing}
                  className="toolbar-btn drawing-btn"
                  aria-label="Disegno a mano libera"
                >
                  <FiEdit3 />
                </Button>
              </OverlayTrigger>
            </ButtonGroup>
            
            {/* Aggiungi il pulsante per inserire documenti */}
            <ButtonGroup className="flex-nowrap toolbar-group">
              <OverlayTrigger
                placement="bottom"
                overlay={renderTooltip({}, "Inserisci documento")}
              >
                <Button
                  variant="light"
                  onClick={insertDocument}
                  className="toolbar-btn"
                >
                  <FiFile />
                </Button>
              </OverlayTrigger>
            </ButtonGroup>
          </ButtonToolbar>
        </div>
      )}
      
      <div className="editor-content-container flex-grow-1 overflow-hidden position-relative">
        {isMobileDevice && editor && <MobileToolbar />}
        <EditorContent editor={editor} className="editor-content h-100" />
        
        {/* Opzioni di formattazione mobile */}
        {isMobileDevice && showMobileOptions && (
          <div className="mobile-format-options">
            <div className="mobile-format-option" onClick={() => {
              editor && editor.chain().focus().toggleHeading({ level: 1 }).run();
              setShowMobileOptions(false);
            }}>
              <span className="option-icon">H1</span>
              <span className="option-label">Titolo grande</span>
            </div>
            <div className="mobile-format-option" onClick={() => {
              editor && editor.chain().focus().toggleHeading({ level: 2 }).run();
              setShowMobileOptions(false);
            }}>
              <span className="option-icon">H2</span>
              <span className="option-label">Titolo medio</span>
            </div>
            <div className="mobile-format-option" onClick={() => {
              editor && editor.chain().focus().toggleBulletList().run();
              setShowMobileOptions(false);
            }}>
              <span className="option-icon">•</span>
              <span className="option-label">Elenco puntato</span>
            </div>
            <div className="mobile-format-option" onClick={() => {
              editor && editor.chain().focus().toggleOrderedList().run();
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
      <Modal 
        show={showLinkModal} 
        onHide={() => setShowLinkModal(false)}
        centered
        className="link-modal"
        backdropClassName="link-modal-backdrop"
        animation={true}
        autoFocus={false}
      >
        <Modal.Header closeButton>
          <Modal.Title>Inserisci link</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={applyLink}>
            <Form.Group className="mb-3 url-input">
              <Form.Label>URL</Form.Label>
              <Form.Control
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                ref={linkInputRef}
                className="url-control"
                pattern="^(https?:\/\/)?([\w-]+(\.[\w-]+)+|localhost)(:\d+)?(\/[^\s]*)$"
              />
              <Form.Text className="text-muted">
                Includi 'https://' per i link esterni. I link interni possono iniziare con '/' o '#'.
              </Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowLinkModal(false)}>
            Annulla
          </Button>
          <Button variant="primary" onClick={applyLink}>
            Inserisci
          </Button>
        </Modal.Footer>
      </Modal>
      
      {/* Aggiungi i modali per mobile */}
      {isMobileDevice && (
        <>
          <MobileFontSizeTool />
        </>
      )}
      
      {/* Indicatore di caricamento */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">Caricamento documento...</div>
        </div>
      )}
    </div>
  )
}

export default Editor
  