export type MoodKey = 'happy' | 'calm' | 'sad' | 'angry' | 'anxious' | 'fun'

export interface Mood {
  key: MoodKey
  label: string
  emoji: string
  color: string
}

export const MOODS: Mood[] = [
  { key: 'happy', label: '嬉しい', emoji: '😊', color: '#FFD700' },
  { key: 'calm', label: '穏やか', emoji: '😌', color: '#87CEEB' },
  { key: 'sad', label: '悲しい', emoji: '😢', color: '#6495ED' },
  { key: 'angry', label: '怒り', emoji: '😠', color: '#FF6347' },
  { key: 'anxious', label: '不安', emoji: '😟', color: '#DDA0DD' },
  { key: 'fun', label: '楽しい', emoji: '😆', color: '#c6e48b' },
]

export function getMoodByKey(key: string | null): Mood | undefined {
  if (!key) return undefined
  return MOODS.find((m) => m.key === key)
}
