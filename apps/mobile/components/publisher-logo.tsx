import { nativeTokens as t } from '@dn/design-tokens/native'
import { logoUrl } from '@dn/domain'
import { useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { apiUrl } from '../lib/config'

export function PublisherLogo({ slug, size }: { slug: string; size: number }) {
  const [failed, setFailed] = useState(false)

  if (!apiUrl || failed) return null
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
})
