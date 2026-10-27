// Short requests reduce the chance that the speech model skips part of a long script.
const MAX_CHARS = 180

export function speechChunks(text: string): string[] {
  const chunks: string[] = []
  let current = ''
  const sentences = new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)
  for (const { segment } of sentences) {
    for (const word of segment.trim().split(/\s+/)) {
      if (!word) continue
      if (word.length > MAX_CHARS) throw new Error('A word in the audio script is too long')
      if (current && current.length + word.length + 1 > MAX_CHARS) {
        chunks.push(current)
        current = ''
      }
      current = current ? `${current} ${word}` : word
    }
    // Finish at sentence boundaries rather than combining unrelated news items.
    if (current) chunks.push(current)
    current = ''
  }
  return chunks
}

function readWav(wav: Buffer) {
  if (
    wav.length < 12 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 12) !== 'WAVE' ||
    wav.readUInt32LE(4) + 8 !== wav.length
  ) {
    throw new Error('Speech service returned invalid WAV audio')
  }
  let format: Buffer | undefined
  let samples: Buffer | undefined
  for (let offset = 12; offset + 8 <= wav.length; ) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    const start = offset + 8
    if (start + size > wav.length) throw new Error('Speech service returned a truncated WAV')
    if (id === 'fmt ') format = wav.subarray(start, start + size)
    if (id === 'data') samples = wav.subarray(start, start + size)
    offset = start + size + (size % 2)
  }
  if (
    !format ||
    format.length < 16 ||
    !samples?.length ||
    ![1, 3].includes(format.readUInt16LE(0))
  ) {
    throw new Error('Speech service returned unsupported WAV audio')
  }
  return { format, samples }
}

export function joinWavs(wavs: Buffer[]): Buffer {
  const parts = wavs.map(readWav)
  const format = parts[0]?.format
  if (!format || parts.some((part) => !part.format.equals(format))) {
    throw new Error('Speech service returned incompatible WAV formats')
  }
  const samples = Buffer.concat(parts.map((part) => part.samples))
  const formatPadding = format.length % 2
  const samplePadding = samples.length % 2
  const header = Buffer.alloc(12 + 8 + format.length + formatPadding + 8)
  header.write('RIFF', 0)
  header.writeUInt32LE(header.length + samples.length + samplePadding - 8, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(format.length, 16)
  format.copy(header, 20)
  const dataOffset = 20 + format.length + formatPadding
  header.write('data', dataOffset)
  header.writeUInt32LE(samples.length, dataOffset + 4)
  return Buffer.concat([header, samples, Buffer.alloc(samplePadding)])
}

export async function synthesizeBriefing(
  text: string,
  endpoint: string,
  key: string,
  model: string,
  signal: AbortSignal,
) {
  const chunks = speechChunks(text)
  if (!chunks.length) throw new Error('Audio script is empty')
  const wavs: Buffer[] = []
  for (const input of chunks) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, input }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
    })
    if (!response.ok) throw new Error(`Speech service returned ${response.status}`)
    const wav = Buffer.from(await response.arrayBuffer())
    readWav(wav)
    wavs.push(wav)
  }
  return joinWavs(wavs)
}
