export async function synthesizeBriefing(
  text: string,
  endpoint: string,
  key: string | undefined,
  model: string,
  voice: string,
  signal: AbortSignal,
) {
  if (!text.trim()) throw new Error('Audio script is empty')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ model, input: text, voice, response_format: 'wav' }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
  })
  if (!response.ok) throw new Error(`Speech service returned ${response.status}`)
  const wav = Buffer.from(await response.arrayBuffer())
  if (
    wav.length < 12 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 12) !== 'WAVE' ||
    (wav.readUInt32LE(4) !== 0xffffffff && wav.readUInt32LE(4) + 8 !== wav.length)
  ) {
    throw new Error('Speech service returned invalid WAV audio')
  }
  let hasSamples = false
  for (let offset = 12; offset + 8 <= wav.length; ) {
    const id = wav.toString('ascii', offset, offset + 4)
    let length = wav.readUInt32LE(offset + 4)
    // Streaming encoders do not know the file or data length when they emit the header.
    // Once buffered, write the actual sizes so browsers can seek and show the duration.
    if (id === 'data' && length === 0xffffffff) {
      length = wav.length - offset - 8
      wav.writeUInt32LE(length, offset + 4)
    }
    if (offset + 8 + length > wav.length) throw new Error('Speech service returned a truncated WAV')
    if (id === 'data' && length > 0) hasSamples = true
    offset += 8 + length + (length % 2)
  }
  if (!hasSamples) throw new Error('Speech service returned empty WAV audio')
  if (wav.readUInt32LE(4) === 0xffffffff) wav.writeUInt32LE(wav.length - 8, 4)
  return wav
}
