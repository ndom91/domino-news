import { nativeTokens as t } from '@dn/design-tokens/native'
import { formatDate, hostnameOf } from '@dn/domain'
import type { StoryClaim, StorySource } from '@dn/schemas'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { uiStyles } from '../ui'
import { openExternalLink } from './open-external-link'

const STANCE_LABELS: Record<StoryClaim['mentions'][number]['stance'], string> = {
  asserts: 'Reports',
  denies: 'Disputes',
  quotes: 'Quotes',
  discusses: 'Discusses',
}

// StoryClaims renders claims as reporting records rather than verified statements.
export function StoryClaims({ claims, sources }: { claims: StoryClaim[]; sources: StorySource[] }) {
  if (claims.length === 0) {
    return null
  }

  const sourcesByArticleId = new Map(sources.map((source) => [source.articleId, source]))

  return (
    <View style={styles.section}>
      <Text style={uiStyles.label}>Claims</Text>
      <Text style={styles.disclaimer}>Statements in the reporting, not verified facts.</Text>
      {claims.map((claim) => (
        <View key={claim.id} style={styles.claim}>
          <Text style={styles.proposition}>{claim.proposition}</Text>
          {claim.firstReportedAt ? (
            <Text style={styles.date}>First reported {formatDate(claim.firstReportedAt)}</Text>
          ) : null}
          {claim.mentions.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Mentioned by</Text>
              {claim.mentions.map((mention) => {
                const source = sourcesByArticleId.get(mention.articleId)
                const label = `${mention.publisher.name} · ${STANCE_LABELS[mention.stance]}`

                if (!source) {
                  return (
                    <Text
                      key={`${mention.articleId}-${mention.publisher.id}`}
                      style={styles.mention}
                    >
                      {label}
                    </Text>
                  )
                }

                return (
                  <Pressable
                    accessibilityHint="Opens the publisher’s article"
                    accessibilityLabel={label}
                    accessibilityRole="link"
                    key={`${mention.articleId}-${mention.publisher.id}`}
                    onPress={() => void openExternalLink(source.url)}
                    style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.linkText}>{label}</Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}
          {claim.evidence.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Evidence links</Text>
              {claim.evidence.map((evidence) => {
                const title = evidence.title ?? hostnameOf(evidence.url) ?? evidence.url
                const label = `${evidence.relationship}: ${title}`

                return (
                  <Pressable
                    accessibilityHint="Opens an evidence link"
                    accessibilityLabel={label}
                    accessibilityRole="link"
                    key={`${evidence.relationship}-${evidence.url}`}
                    onPress={() => void openExternalLink(evidence.url)}
                    style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.linkText}>{label}</Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: t.space[3], marginTop: t.space[10] },
  disclaimer: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.meta,
    lineHeight: 18,
    marginTop: -t.space[1],
  },
  claim: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: t.space[2],
    paddingBottom: t.space[4],
  },
  proposition: {
    color: t.color.text,
    fontFamily: t.font.bold,
    fontSize: t.type.bodyLarge,
    lineHeight: 24,
  },
  date: { color: t.color.textMuted, fontFamily: t.font.regular, fontSize: t.type.meta },
  group: { gap: t.space[1], marginTop: t.space[1] },
  groupLabel: { color: t.color.textMuted, fontFamily: t.font.bold, fontSize: t.type.meta },
  mention: { color: t.color.textSecondary, fontFamily: t.font.regular, fontSize: t.type.body },
  link: { justifyContent: 'center', minHeight: t.size.tap },
  linkText: { color: t.color.accentText, fontFamily: t.font.medium, fontSize: t.type.body },
  pressed: { opacity: 0.7 },
})
