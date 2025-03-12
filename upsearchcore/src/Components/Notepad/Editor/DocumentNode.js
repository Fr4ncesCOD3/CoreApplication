import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import DocumentComponent from './DocumentComponent'

export const DocumentNode = Node.create({
  name: 'document',
  
  group: 'block',
  
  atom: true,
  
  draggable: true,
  
  addAttributes() {
    return {
      fileName: {
        default: 'Documento'
      },
      fileType: {
        default: 'text/plain'
      },
      fileSize: {
        default: 0
      },
      fileContent: {
        default: null
      },
      id: {
        default: () => 'doc-' + Date.now()
      }
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-type="document"]'
      }
    ]
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'document', ...HTMLAttributes }]
  },
  
  addNodeView() {
    return ReactNodeViewRenderer(DocumentComponent)
  },
  
  addCommands() {
    return {
      insertDocument: attributes => ({ chain }) => {
        return chain()
          .insertContent({
            type: this.name,
            attrs: attributes
          })
          .run()
      },
      
      removeDocument: () => ({ commands }) => {
        return commands.deleteNode('document')
      }
    }
  }
})

export default DocumentNode 