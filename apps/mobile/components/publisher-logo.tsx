import { nativeTokens as t } from '@dn/design-tokens/native'
import { logoUrl } from '@dn/domain'
import { useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { apiUrl } from '../lib/config'

export function PublisherLogo({
  slug,
  size,
  fallback,
}: {
  slug: string
  size: number
  fallback?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!apiUrl || failed) {
    if (!fallback) return null
    return (
      <View
        accessible={false}
        style={[styles.tile, styles.fallback, { height: size, width: size }]}
      >
        <Text style={styles.initial}>{fallback.trim().charAt(0).toUpperCase()}</Text>
      </View>
    )
  }
  return (
    <View
      accessible={false}
      style={[styles.tile, { height: size, padding: Math.round(size * 0.12), width: size }]}
    >
      <Image
        onError={() => setFailed(true)}
        resizeMode="contain"
        source={{ uri: `${apiUrl}${logoUrl(slug)}` }}
        style={styles.image}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  tile: { backgroundColor: t.color.bandText, borderColor: t.color.border, borderWidth: 1 },
  image: { height: '100%', width: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.meta },
})
