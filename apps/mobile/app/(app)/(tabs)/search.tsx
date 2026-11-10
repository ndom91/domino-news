import { nativeTokens as t } from '@dn/design-tokens/native'
import { plural, shortRelative } from '@dn/domain'
import type { SearchHit, SearchResponse } from '@dn/schemas'
import { useQuery } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LoadingView, MessageView, Screen, TextField, uiStyles } from '../../../components/ui'
import { isUnauthorized, queries } from '../../../lib/api'

export default function SearchScreen() {
  const [draft, setDraft] = useState('')
  const [submitted, setSubmitted] = useState('')
  const search = useQuery(queries.search({ q: submitted }))
  const canSubmit = draft.trim().length > 0

  function submit() {
    if (canSubmit) setSubmitted(draft.trim())
  }

  if (isUnauthorized(search.error)) return <Redirect href="/sign-in" />

  return (
    <Screen>
      <ScrollView contentContainerStyle={uiStyles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Search</Text>
        <Text style={styles.intro}>Find a story or narrative across the reporting we track.</Text>
        <View style={styles.searchRow}>
          <TextField
            accessibilityLabel="Search stories and narratives"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            placeholder="Search the news"
            returnKeyType="search"
            style={styles.input}
            value={draft}
          />
          <Pressable
            accessibilityLabel="Search"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            disabled={!canSubmit}
            onPress={submit}
            style={({ pressed }) => [
              styles.submit,
              !canSubmit ? styles.submitDisabled : null,
              pressed ? styles.submitPressed : null,
            ]}
          >
            <Text style={styles.submitText}>Search</Text>
          </Pressable>
        </View>
        {submitted.length === 0 ? (
          <Text style={styles.help}>Search stories and narratives by topic, place or person.</Text>
        ) : null}
        {search.isPending && submitted ? <LoadingView label="Searching" /> : null}
        {search.isError ? (
          <MessageView
            detail="Check your connection, then try your search again."
            title="Search is unavailable"
            action={{ label: 'Try again', onPress: search.refetch }}
          />
        ) : null}
        {search.data ? (
          <SearchResults now={new Date(search.dataUpdatedAt).toISOString()} results={search.data} />
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function SearchResults({ now, results }: { now: string; results: SearchResponse }) {
  if (results.hits.length === 0) {
    return (
      <MessageView
        detail="Try a different topic, place or name."
        title={`No results for “${results.query}”`}
      />
    )
  }
  return (
    <View style={styles.results}>
      <Text accessibilityLiveRegion="polite" style={uiStyles.eyebrow}>
        {plural(results.hits.length, 'result')} ·{' '}
        {results.mode === 'hybrid' ? 'semantic and keyword' : 'keyword'} search
      </Text>
      {results.hits.map((hit) => (
        <SearchResult hit={hit} key={`${hit.type}-${hit.id}`} now={now} />
      ))}
    </View>
  )
}

function SearchResult({ hit, now }: { hit: SearchHit; now: string }) {
  const router = useRouter()
  const isStory = hit.type === 'story'
  const description = isStory ? hit.summary : hit.description
  const meta = isStory
    ? `${plural(hit.sourceCount, 'report')} · ${shortRelative(hit.lastUpdatedAt, new Date(now))}`
    : `${plural(hit.storyCount, 'story', 'stories')} · ${shortRelative(hit.updatedAt, new Date(now))}`

  return (
    <Pressable
      accessibilityLabel={hit.title}
      accessibilityRole="link"
      onPress={() => router.push(isStory ? `/stories/${hit.slug}` : `/narratives/${hit.slug}`)}
      style={({ pressed }) => [styles.result, pressed ? styles.resultPressed : null]}
    >
      <Text style={styles.resultType}>{isStory ? 'Story' : 'Narrative'}</Text>
      <Text style={styles.resultTitle}>{hit.title}</Text>
      <Text numberOfLines={3} style={styles.resultSummary}>
        {description}
      </Text>
      <Text style={styles.resultMeta}>{meta}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
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
    marginTop: t.space[2],
  },
  searchRow: { flexDirection: 'row', marginTop: t.space[6] },
  input: { flex: 1 },
  submit: {
    alignItems: 'center',
    backgroundColor: t.color.band,
    justifyContent: 'center',
    minWidth: 88,
    paddingHorizontal: t.space[3],
  },
  submitDisabled: { opacity: 0.45 },
  submitPressed: { opacity: 0.72 },
  submitText: { color: t.color.bandText, fontFamily: t.font.bold, fontSize: t.type.body },
  help: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
    marginTop: t.space[4],
  },
  results: { gap: t.space[3], marginTop: t.space[6] },
  result: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: t.space[2],
    paddingVertical: t.space[4],
  },
  resultPressed: { opacity: 0.7 },
  resultType: {
    color: t.color.accentText,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  resultTitle: { color: t.color.text, fontFamily: t.font.black, fontSize: 23, lineHeight: 24 },
  resultSummary: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  resultMeta: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
})
