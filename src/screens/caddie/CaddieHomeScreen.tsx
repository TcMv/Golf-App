import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type Nav = NativeStackNavigationProp<{
  StartRound: undefined;
  MyBagSetup: { returnTo?: 'StartRound' | 'Main' } | undefined;
}>;

interface ClubRow {
  id: string;
  name: string;
  carry_metres: number | null;
}

const FEATURES: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; sub: string }[] = [
  { icon: 'locate-outline', label: 'GPS Distances', sub: 'Front · Mid · Back' },
  { icon: 'navigate-outline', label: 'Wind Adjusted', sub: 'Live conditions' },
  { icon: 'analytics-outline', label: 'Shot History', sub: 'Learns your game' },
];

export default function CaddieHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) { setLoading(false); return; }
      setLoading(true);
      supabase
        .from('user_clubs')
        .select('id, name, carry_metres')
        .eq('user_id', user.id)
        .order('carry_metres', { ascending: false })
        .then(({ data }) => {
          setClubs((data ?? []) as ClubRow[]);
          setLoading(false);
        });
    }, [user?.id]),
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>AI CADDIE</Text>
            <Text style={styles.title}>Course strategy{'\n'}powered by your game.</Text>
          </View>
          <TouchableOpacity
            style={styles.playFab}
            onPress={() => navigation.navigate('StartRound')}
            activeOpacity={0.8}
          >
            <Ionicons name="golf" size={22} color={Colors.bg} />
          </TouchableOpacity>
        </View>

        {/* Feature trio */}
        <View style={styles.featureRow}>
          {FEATURES.map(f => (
            <View key={f.label} style={styles.featureCard}>
              <Ionicons name={f.icon} size={22} color={Colors.green} />
              <Text style={styles.featureLabel}>{f.label}</Text>
              <Text style={styles.featureSub}>{f.sub}</Text>
            </View>
          ))}
        </View>

        {/* Your Bag */}
        <View style={styles.bagCard}>
          <View style={styles.bagHeader}>
            <Text style={styles.sectionLabel}>YOUR BAG</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('MyBagSetup', { returnTo: 'Main' })}
              activeOpacity={0.7}
            >
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.green} style={styles.loadingSpinner} />
          ) : clubs.length === 0 ? (
            <View style={styles.emptyBag}>
              <Ionicons name="layers-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.emptyBagText}>No club distances configured</Text>
              <TouchableOpacity
                style={styles.setupBtn}
                onPress={() => navigation.navigate('MyBagSetup', { returnTo: 'Main' })}
                activeOpacity={0.85}
              >
                <Text style={styles.setupBtnText}>Set Up My Bag</Text>
              </TouchableOpacity>
            </View>
          ) : (
            clubs.map((club, index) => (
              <View key={club.id}>
                <View style={styles.clubRow}>
                  <Text style={styles.clubName}>{club.name}</Text>
                  <Text style={styles.clubCarry}>
                    {club.carry_metres != null ? `${club.carry_metres} m` : '—'}
                  </Text>
                </View>
                {index < clubs.length - 1 && <View style={styles.clubDivider} />}
              </View>
            ))
          )}
        </View>

        {/* Start Round CTA */}
        <TouchableOpacity
          style={styles.startRound}
          onPress={() => navigation.navigate('StartRound')}
          activeOpacity={0.85}
        >
          <Ionicons name="golf-outline" size={18} color={Colors.bg} />
          <Text style={styles.startRoundText}>START A ROUND</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing.xxl },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: Spacing.md,
  },
  headerText: { flex: 1 },
  eyebrow: {
    color: Colors.green,
    fontFamily: Font.bold,
    fontSize: FontSize.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  title: {
    color: Colors.text,
    fontFamily: Font.black,
    fontWeight: FontWeight.black,
    fontSize: FontSize.xxl,
    lineHeight: 36,
  },
  playFab: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
    marginTop: Spacing.xs,
  },

  featureRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  featureCard: {
    flex: 1,
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  featureLabel: {
    color: Colors.text,
    fontFamily: Font.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: 2,
  },
  featureSub: {
    color: Colors.textMuted,
    fontFamily: Font.regular,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 14,
  },

  sectionLabel: {
    color: Colors.textMuted,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  editLink: {
    color: Colors.green,
    fontFamily: Font.semibold,
    fontSize: FontSize.sm,
  },
  bagCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
  },
  bagHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  loadingSpinner: { paddingVertical: Spacing.xl },
  emptyBag: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyBagText: {
    color: Colors.textMuted,
    fontFamily: Font.regular,
    fontSize: FontSize.sm,
  },
  setupBtn: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
  },
  setupBtnText: {
    color: Colors.bg,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  clubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  clubDivider: { height: 1, backgroundColor: Colors.border },
  clubName: {
    color: Colors.text,
    fontFamily: Font.medium,
    fontSize: FontSize.sm,
  },
  clubCarry: {
    color: Colors.green,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },

  startRound: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
  },
  startRoundText: {
    color: Colors.bg,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.base,
    letterSpacing: 0.5,
  },
});
