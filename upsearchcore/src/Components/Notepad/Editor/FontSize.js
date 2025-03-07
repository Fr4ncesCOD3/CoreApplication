// Versione semplificata che non dipende da @tiptap/core
export const FontSize = {
  name: 'fontSize',
  
  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: element => element.style.fontSize.replace(/['"]+/g, ''),
        renderHTML: attributes => {
          if (!attributes.fontSize) {
            return {}
          }
          return {
            style: `font-size: ${attributes.fontSize}`,
          }
        },
      },
    }
  },
  
  addCommands() {
    return {
      setFontSize: fontSize => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize: fontSize + "px" })
          .run()
      },
      unsetFontSize: () => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize: null })
          .run()
      },
    }
  },
}
