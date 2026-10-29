import { nativeTokens as t } from '@dn/design-tokens/native'
import type { StoryContextItem } from '@dn/schemas'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { openExternalLink } from './open-external-link'
import { SectionHeading } from './section-heading'

// StoryBackground presents expandable background notes and their grounding links.
export function StoryBackground({ entries }: { entries: StoryContextItem[] }) {
  const [selected, setSelected] = useState<StoryContextItem | null>(null)

  if (entries.length === 0) {
    return null
  }

  return (
    <>
      <View style={styles.section}>
        <SectionHeading>Background</SectionHeading>
        {entries.map((entry) => (
          <Pressable
            accessibilityHint="Opens background information"
            accessibilityLabel={entry.title}
            accessibilityRole="button"
            key={entry.id}
            onPress={() => setSelected(entry)}
            style={({ pressed }) => [styles.entry, pressed ? styles.pressed : null]}
          >
            <Text style={styles.entryTitle}>{entry.title}</Text>
            <Text numberOfLines={2} style={styles.entryPreview}>
              {entry.explanation}
            </Text>
          </Pressable>
        ))}
      </View>
      <ContextSheet entry={selected} onClose={() => setSelected(null)} />
    </>
  )
}

export function ContextSheet({
  entry,
  onClose,
}: {
  entry: StoryContextItem | null
  onClose: () => void
}) {
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const translateY = useRef(new Animated.Value(height)).current

  useEffect(() => {
    if (!entry) return
    translateY.setValue(height)
    Animated.timing(translateY, {
      duration: 250,
      toValue: 0,
      useNativeDriver: true,
    }).start()
  }, [entry, height, translateY])

  const close = () => {
    Animated.timing(translateY, {
      duration: 150,
      toValue: height,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose()
    })
  }

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={close}
      statusBarTranslucent
      transparent
      visible={entry !== null}
    >
      <View accessibilityViewIsModal style={styles.sheetScrim}>
        <Pressable
          accessibilityHint="Closes the definition"
          accessibilityLabel="Close definition"
          accessibilityRole="button"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom, transform: [{ translateY }] }]}
        >
          {entry ? (
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{entry.title}</Text>
                <Pressable
                  accessibilityLabel={`Close ${entry.title}`}
                  accessibilityRole="button"
                  onPress={close}
                  style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.sheetBody}>{entry.explanation}</Text>
              {entry.sources.length > 0 ? (
                <View style={styles.grounding}>
                  <Text style={styles.groundingLabel}>Grounding sources</Text>
                  {entry.sources.map((source) => (
                    <Pressable
                      accessibilityHint="Opens the publisher’s article"
                      accessibilityLabel={`${source.publisherName}: ${source.title}`}
                      accessibilityRole="link"
                      key={source.articleId}
                      onPress={() => void openExternalLink(source.url)}
                      style={({ pressed }) => [
                        styles.groundingLink,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <Text style={styles.groundingPublisher}>{source.publisherName}</Text>
                      <Text style={styles.groundingTitle}>{source.title}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  section: { gap: t.space[3], marginTop: t.space[10] },
  entry: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: t.space[1],
    minHeight: t.size.tap,
    paddingBottom: t.space[3],
    paddingTop: t.space[1],
  },
  entryTitle: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  entryPreview: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  pressed: { opacity: 0.7 },
  sheetScrim: { backgroundColor: 'rgba(18, 18, 18, 0.48)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: t.color.elevated, maxHeight: '85%' },
  sheetContent: { gap: t.space[4], padding: t.space[5] },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: t.space[4],
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: t.color.text,
    flex: 1,
    fontFamily: t.font.black,
    fontSize: t.type.headline,
    lineHeight: 29,
  },
  close: {
    alignItems: 'center',
    borderColor: t.color.rule,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: t.size.tap,
    paddingHorizontal: t.space[3],
  },
  closeText: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.meta },
  sheetBody: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.bodyLarge,
    lineHeight: 26,
  },
  grounding: { gap: t.space[1] },
  groundingLabel: { color: t.color.textMuted, fontFamily: t.font.bold, fontSize: t.type.meta },
  groundingLink: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: t.size.tap,
    paddingVertical: t.space[2],
  },
  groundingPublisher: { color: t.color.accentText, fontFamily: t.font.bold, fontSize: t.type.meta },
  groundingTitle: { color: t.color.text, fontFamily: t.font.medium, fontSize: t.type.body },
})
