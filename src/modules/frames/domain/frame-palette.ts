export type FramePalette = {
  id: string
  name: string
  accent: string
  soft: string
}

export const framePalettes: FramePalette[] = [
  { id: 'coral', name: 'Coral', accent: '#ff654d', soft: '#ffd8e2' },
  { id: 'amber', name: 'Amber', accent: '#f5aa22', soft: '#fff0c9' },
  { id: 'lemon', name: 'Lemon', accent: '#e4d72e', soft: '#fffbd2' },
  { id: 'lime', name: 'Lime', accent: '#9bcf27', soft: '#efffc9' },
  { id: 'mint', name: 'Mint', accent: '#38bd8f', soft: '#d9f8ed' },
  { id: 'aqua', name: 'Aqua', accent: '#25aab5', soft: '#d8f7f8' },
  { id: 'blue', name: 'Blue', accent: '#3974ff', soft: '#e3ebff' },
  { id: 'violet', name: 'Violet', accent: '#7657d7', soft: '#ebe5ff' },
  { id: 'pink', name: 'Pink', accent: '#d9579b', soft: '#ffe2f1' },
  { id: 'mono', name: 'Mono', accent: '#383832', soft: '#e7e5df' },
]
