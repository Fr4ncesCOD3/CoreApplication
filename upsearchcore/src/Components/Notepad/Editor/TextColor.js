import { Extension } from '@tiptap/core'

export const TextColor = Extension.create({
  name: 'textColor',
  
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
          color: {
            default: null,
            parseHTML: element => element.style.color,
            renderHTML: attributes => {
              if (!attributes.color) return {}
              
              // Aggiungi !important e una classe specifica per il tema scuro
              return {
                style: `color: ${attributes.color} !important`,
                class: 'text-styled color-override'
              }
            },
          },
        },
      },
    ];
  },
  
  addCommands() {
    return {
      setTextColor: color => ({ chain }) => {
        console.log("Setting text color to:", color); // Aggiungi log per debug
        return chain()
          .setMark('textStyle', { color })
          .run();
      },
      unsetTextColor: () => ({ chain }) => {
        return chain()
          .setMark('textStyle', { color: null })
          .run();
      },
    };
  },
});
