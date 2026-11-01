import { nativeTokens as t } from '@dn/design-tokens/native'
import type { ReactNode } from 'react'
import { Modal, StyleSheet, Text, View } from 'react-native'
import { Button } from '../ui'

// ConfirmationDialog asks the reader to confirm a destructive account action.
export function ConfirmationDialog({
  cancelLabel,
  children,
  confirmLabel,
  detail,
  onCancel,
  onConfirm,
  pending,
  title,
  visible,
}: {
  cancelLabel: string
  /** Extra content between the detail and the actions, such as a password field. */
  children?: ReactNode
  confirmLabel: string
  detail: string
  onCancel: () => void
  onConfirm: () => void
  pending: boolean
  title: string
  visible: boolean
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View
        accessibilityLabel={`${title} confirmation`}
        accessibilityViewIsModal
        style={styles.scrim}
      >
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.detail}>{detail}</Text>
          {children}
          <View style={styles.actions}>
            <Button onPress={onCancel} tone="light">
              {cancelLabel}
            </Button>
            <Button disabled={pending} onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  actions: { gap: t.space[2] },
  detail: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  dialog: {
    backgroundColor: t.color.elevated,
    gap: t.space[4],
    maxWidth: 420,
    padding: t.space[5],
  },
  scrim: {
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 18, 0.48)',
    flex: 1,
    justifyContent: 'center',
    padding: t.space[5],
  },
  title: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.headline },
})
