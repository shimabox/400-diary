const AUDIO_EXT_MAP: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
}

export function baseMimeType(type: string): string {
  return type.split(';', 1)[0].trim().toLowerCase()
}

export function audioExtension(type: string): string {
  return AUDIO_EXT_MAP[baseMimeType(type)] ?? 'bin'
}
