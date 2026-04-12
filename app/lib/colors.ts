const PASTEL_COLORS = [
  '#FFE4E1', // misty rose
  '#FFD1DC', // pastel pink
  '#FFDAB9', // peach puff
  '#FFE5B4', // peach
  '#FFFACD', // lemon chiffon
  '#E0F0E0', // pastel green
  '#D4F0F0', // pastel cyan
  '#D6E6FF', // pastel blue
  '#E8D5F5', // pastel lavender
  '#F5E6CC', // pastel beige
  '#F0E68C', // khaki light
  '#E6E6FA', // lavender
] as const

export { PASTEL_COLORS }

export function randomPastelColor(): string {
  return PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)]
}
