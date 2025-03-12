import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import DrawingComponent from './DrawingComponent'

export const DrawingNode = Node.create({
  name: 'drawing',
  
  group: 'block',
  
  atom: true,
  
  draggable: true,
  
  addAttributes() {
    return {
      width: {
        default: '100%',
      },
      height: {
        default: '300px',
      },
      strokes: {
        default: [],
        parseHTML: element => {
          const strokesData = element.getAttribute('data-strokes')
          return strokesData ? JSON.parse(strokesData) : []
        },
        renderHTML: attributes => {
          return {
            'data-strokes': JSON.stringify(attributes.strokes),
          }
        },
      },
      expanded: {
        default: false,
      },
      id: {
        default: () => 'drawing-' + Date.now(),
      }
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-type="drawing"]',
      },
    ]
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'drawing', ...HTMLAttributes }]
  },
  
  addNodeView() {
    return ReactNodeViewRenderer(DrawingComponent)
  },
  
  addCommands() {
    return {
      insertDrawing: attributes => ({ chain }) => {
        return chain()
          .insertContent({
            type: this.name,
            attrs: attributes,
          })
          .run()
      },
      
      // Comando per rimuovere il blocco di disegno
      removeDrawing: () => ({ commands }) => {
        return commands.deleteNode('drawing')
      },
    }
  },
})

export default DrawingNode 