import { Mark } from '@tiptap/core'

export const TextColor = Mark.create({
  name: 'textColor',
  
  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'span[style*="color"]',
        getAttrs: element => ({
          color: element.style.color,
        }),
      },
    ]
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['span', { style: `color: ${HTMLAttributes.color || 'currentColor'}` }, 0]
  },
  
  addCommands() {
    return {
      setTextColor: color => ({ chain }) => {
        return chain()
          .setMark('textColor', { color })
          .run()
      },
      unsetTextColor: () => ({ chain }) => {
        return chain()
          .unsetMark('textColor')
          .run()
      },
    }
  },
})
