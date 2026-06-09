import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { CaddieAdvice } from '../../utils/caddie';

type Message = { role: 'user' | 'assistant'; text: string };

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

async function askClaude(messages: Message[], context: string): Promise<string> {
  const systemPrompt =
    `You are a golf caddie assistant. Be concise and practical — this is mid-round advice. ` +
    `Max 3 sentences per response. No filler phrases. Use metres, not yards.\n\nShot context:\n${context}`;

  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.text })),
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
  const json = await res.json();
  return json.content?.[0]?.text ?? 'No response.';
}

type Props = {
  advice: CaddieAdvice;
  onDismiss: () => void;
};

export default function CaddiePanel({ advice, onDismiss }: Props) {
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [followUp, setFollowUp] = useState('');

  const openMoreInfo = useCallback(async () => {
    if (!ANTHROPIC_KEY) {
      setMessages([{ role: 'assistant', text: 'Set EXPO_PUBLIC_ANTHROPIC_API_KEY to enable AI advice.' }]);
      setMoreInfoOpen(true);
      return;
    }
    setMoreInfoOpen(true);
    if (messages.length > 0) return; // already loaded
    setLoading(true);
    try {
      const initialMsg: Message = {
        role: 'user',
        text: `Give me the full breakdown for this shot.`,
      };
      const reply = await askClaude([initialMsg], advice.context);
      setMessages([initialMsg, { role: 'assistant', text: reply }]);
    } catch {
      setMessages([{ role: 'assistant', text: 'Could not connect. Check your internet connection.' }]);
    } finally {
      setLoading(false);
    }
  }, [advice.context, messages.length]);

  const sendFollowUp = useCallback(async () => {
    const text = followUp.trim();
    if (!text || loading) return;
    const newMessages: Message[] = [...messages, { role: 'user', text }];
    setMessages(newMessages);
    setFollowUp('');
    setLoading(true);
    try {
      const reply = await askClaude(newMessages, advice.context);
      setMessages(prev => [...prev, { role: 'assistant', text: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Could not connect.' }]);
    } finally {
      setLoading(false);
    }
  }, [followUp, loading, messages, advice.context]);

  const { recommended, alternatives, distToPin, windLabel } = advice;
  const clubLabel = recommended.club.custom_name ?? recommended.club.name;

  return (
    <>
      {/* Compact pop-up card */}
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.clubBadge}>
            <Text style={styles.clubBadgeText}>{clubLabel}</Text>
          </View>
          <View style={styles.cardMeta}>
            <Text style={styles.carryText}>{recommended.adjustedCarry}m</Text>
            <Text style={styles.pinText}>{distToPin}m to pin</Text>
          </View>
          <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Wind */}
        {windLabel !== 'Calm' && (
          <Text style={styles.metaLine}>
            💨 {windLabel}{Math.abs(advice.windAdjustment) >= 3 ? ` · ${advice.windAdjustment > 0 ? '+' : ''}${advice.windAdjustment}m` : ''}
          </Text>
        )}

        {/* Hazard warnings */}
        {recommended.warnings.map((w, i) => (
          <Text key={i} style={styles.warningLine}>⚠ {w.type} {w.distanceMetres}m {w.side}</Text>
        ))}
        {recommended.clearsHazards && alternatives.length > 0 && (
          <Text style={styles.safeLine}>✓ clears all hazards</Text>
        )}

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <View style={styles.altRow}>
            <Text style={styles.altLabel}>Alt: </Text>
            {alternatives.map((a, i) => (
              <Text key={i} style={styles.altChip}>
                {a.club.custom_name ?? a.club.name} {a.adjustedCarry}m
                {i < alternatives.length - 1 ? '  ' : ''}
              </Text>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.moreInfoBtn} onPress={openMoreInfo} activeOpacity={0.8}>
          <Text style={styles.moreInfoText}>More Info →</Text>
        </TouchableOpacity>
      </View>

      {/* More Info modal */}
      <Modal visible={moreInfoOpen} transparent animationType="slide" onRequestClose={() => setMoreInfoOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Caddie Advice</Text>
              <TouchableOpacity onPress={() => setMoreInfoOpen(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Context summary */}
            <View style={styles.contextBar}>
              <Text style={styles.contextText}>
                {clubLabel} · {recommended.adjustedCarry}m · {distToPin}m to pin · {windLabel}
              </Text>
            </View>

            <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatContent}>
              {loading && messages.length === 0 && (
                <ActivityIndicator color={Colors.green} style={{ marginTop: Spacing.xl }} />
              )}
              {messages.map((m, i) => (
                <View key={i} style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
                  <Text style={[styles.bubbleText, m.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
                    {m.text}
                  </Text>
                </View>
              ))}
              {loading && messages.length > 0 && (
                <View style={[styles.bubble, styles.bubbleAssistant]}>
                  <ActivityIndicator color={Colors.green} size="small" />
                </View>
              )}
            </ScrollView>

            {/* Follow-up quick questions */}
            {messages.length > 0 && !loading && (
              <View style={styles.quickRow}>
                {['What if I lay up?', 'Is the wind helping?', 'Safe play option?'].map(q => (
                  <TouchableOpacity
                    key={q}
                    style={styles.quickBtn}
                    onPress={() => { setFollowUp(q); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.quickBtnText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Send follow-up */}
            {followUp.length > 0 && (
              <View style={styles.followUpRow}>
                <Text style={styles.followUpPreview}>{followUp}</Text>
                <TouchableOpacity style={styles.sendBtn} onPress={sendFollowUp} disabled={loading}>
                  <Text style={styles.sendBtnText}>Ask</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.clearBtn} onPress={() => setFollowUp('')}>
                  <Text style={styles.clearBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(10,20,10,0.92)',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    gap: 6,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  clubBadge: {
    backgroundColor: Colors.green,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  clubBadgeText: { fontSize: FontSize.lg, fontWeight: FontWeight.black, color: '#000' },
  cardMeta: { flex: 1 },
  carryText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  pinText: { fontSize: FontSize.xs, color: Colors.textMuted },
  dismissBtn: {
    width: 28, height: 28, borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    alignItems: 'center', justifyContent: 'center',
  },
  dismissText: { fontSize: FontSize.xs, color: Colors.textMuted },
  metaLine: { fontSize: FontSize.sm, color: Colors.textSecondary },
  warningLine: { fontSize: FontSize.sm, color: '#F97316', fontWeight: FontWeight.medium },
  safeLine: { fontSize: FontSize.sm, color: Colors.green },
  altRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  altLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  altChip: { fontSize: FontSize.xs, color: Colors.textSecondary },
  moreInfoBtn: {
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  moreInfoText: { fontSize: FontSize.sm, color: Colors.green, fontWeight: FontWeight.semibold },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: Colors.surface1,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.base,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  modalClose: { fontSize: FontSize.base, color: Colors.green, fontWeight: FontWeight.semibold },
  contextBar: {
    backgroundColor: Colors.surface2,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  contextText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  chatScroll: { flex: 1 },
  chatContent: { padding: Spacing.base, gap: Spacing.sm },
  bubble: {
    maxWidth: '90%',
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.greenMuted,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface3,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: FontSize.base, lineHeight: 22 },
  bubbleTextUser: { color: Colors.green },
  bubbleTextAssistant: { color: Colors.text },
  quickRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs,
    paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm,
  },
  quickBtn: {
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickBtnText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  followUpRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.base,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  followUpPreview: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  sendBtn: {
    backgroundColor: Colors.green,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  sendBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#000' },
  clearBtn: {
    width: 28, height: 28, borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    alignItems: 'center', justifyContent: 'center',
  },
  clearBtnText: { fontSize: FontSize.xs, color: Colors.textMuted },
});
