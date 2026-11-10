import { nativeTokens as t } from '@dn/design-tokens/native'
import { countryName, plural } from '@dn/domain'
import { LEAN_LABELS, type PublisherStats } from '@dn/schemas'
import { useQuery } from '@tanstack/react-query'
import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { PublisherLogo } from '../../../components/publisher-logo'
import { MessageView, QueryScreen, Screen, uiStyles } from '../../../components/ui'
import { queries } from '../../../lib/api'

export default function PublishersScreen() {
  const router = useRouter()
  const publishers = useQuery(queries.publishers())
  const [search, setSearch] = useState('')

  const term = search.trim().toLocaleLowerCase()

  return (
    <QueryScreen loading="Loading publishers" query={publishers} title="Publishers are unavailable">
      {(data) => {
        const items = data.items.filter((publisher) =>
          `${publisher.name} ${publisher.domain}`.toLocaleLowerCase().includes(term),
        )
        return (
          <Screen>
            <Stack.Screen options={{ title: 'Publishers' }} />
            <FlatList
              contentContainerStyle={uiStyles.content}
              data={items}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(publisher) => publisher.id}
              ListEmptyComponent={
                <MessageView
                  detail="Try a different publisher name or domain."
                  title={`No publishers match "${search.trim()}"`}
                />
              }
              ListHeaderComponent={
                <View style={styles.header}>
                  <Text style={styles.heading}>Publishers</Text>
                  <Text style={styles.intro}>
                    See the publishers Domino Wire follows and how their reporting is used.
                  </Text>
                  <TextInput
                    accessibilityLabel="Search publishers by name or domain"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setSearch}
                    placeholder="Search publishers"
                    placeholderTextColor={t.color.textMuted}
                    style={styles.input}
                    value={search}
                  />
                  <Text accessibilityLiveRegion="polite" style={styles.count}>
                    {plural(items.length, 'publisher')}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityHint="Opens this publisher"
                  accessibilityLabel={item.name}
                  accessibilityRole="link"
                  onPress={() => router.push(`/publishers/${item.slug}`)}
                  style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}
                >
                  <View style={styles.nameRow}>
                    <PublisherLogo size={32} slug={item.slug} />
                    <Text style={styles.name}>{item.name}</Text>
                  </View>
                  <Text style={styles.domain}>{item.domain}</Text>
                  <Text style={styles.meta}>{publisherMeta(item)}</Text>
                </Pressable>
              )}
            />
          </Screen>
        )
      }}
    </QueryScreen>
  )
}

function publisherMeta(publisher: PublisherStats): string {
  const kind = publisher.kind === 'official' ? 'Official source' : 'Newsroom'
  const country = publisher.countryCode ? countryName(publisher.countryCode) : 'International'
  const lean = publisher.lean ? LEAN_LABELS[publisher.lean] : 'Not assessed'
  return `${kind} · ${country} · ${lean}`
}

const styles = StyleSheet.create({
  header: { gap: t.space[3], paddingBottom: t.space[5] },
  heading: {
    color: t.color.text,
    fontFamily: t.font.black,
    fontSize: t.type.display,
    lineHeight: 39,
  },
  intro: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  input: {
    backgroundColor: t.color.surface,
    borderColor: t.color.borderStrong,
    borderWidth: 1,
    color: t.color.text,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    marginTop: t.space[3],
    minHeight: t.size.tap,
    paddingHorizontal: t.space[3],
  },
  count: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
  item: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: t.space[1],
    paddingVertical: t.space[4],
  },
  pressed: { opacity: 0.7 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: t.space[2] },
  name: {
    color: t.color.text,
    fontFamily: t.font.bold,
    fontSize: t.type.bodyLarge,
    lineHeight: 24,
  },
  domain: { color: t.color.accentText, fontFamily: t.font.medium, fontSize: t.type.meta },
  meta: { color: t.color.textMuted, fontFamily: t.font.regular, fontSize: t.type.meta },
})
