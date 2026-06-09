import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Alert,
  PanResponder,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useRound } from '../../context/RoundContext';
import { useLocation } from '../../hooks/useLocation';
import { haversineMetres } from '../../utils/distance';
import { fetchWind, fetchElevation } from '../../utils/wind';
import type { WindData } from '../../utils/wind';
import { buildCaddieAdvice } from '../../utils/caddie';
import type { CaddieAdvice } from '../../utils/caddie';
import CaddiePanel from '../../components/caddie/CaddiePanel';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Club, Coordinate, Hazard, HazardType, Hole, HoleScore } from '../../types';

// ─── Constants ───────────────────────────────────────────────────────────────

const HAZARD_COLORS: Record<HazardType, string> = {
  bunker: '#F5C518',
  water: '#4A90D9',
  trees: '#2D6A2D',
  ob: '#FFFFFF',
  red_zone: '#E53E3E',
};

const MAP_HEIGHT = 240;

type Nav = NativeStackNavigationProp<{
  PlayHome: undefined;
  StartRound: undefined;
  ActiveRound: undefined;
  EndRound: undefined;
  RoundDetail: { roundId: string };
}>;

function bearingTo(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const r = Math.PI / 180;
  const dLon = (toLng - fromLng) * r;
  const lat1 = fromLat * r;
  const lat2 = toLat * r;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function toParColor(diff: number): string {
  if (diff <= -2) return Colors.eagle;
  if (diff === -1) return Colors.birdie;
  if (diff === 0) return Colors.scorePar;
  if (diff === 1) return Colors.bogey;
  return Colors.doublePlus;
}

function toParLabel(diff: number | null): string {
  if (diff === null) return '—';
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ActiveRoundScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { activeRound, updateScore, setCurrentHole, endRound } = useRound();
  const { location } = useLocation();
  const mapRef = useRef<MapView>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caddieTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Per-hole score state ────────────────────────────────────────────────
  const [grossScore, setGrossScore] = useState<number | null>(null);
  const [putts, setPutts] = useState<number>(2);
  const [holeScoreId, setHoleScoreId] = useState<string | null>(null);

  // ── Caddie ─────────────────────────────────────────────────────────────
  const [windData, setWindData] = useState<WindData | null>(null);
  const [caddieAdvice, setCaddieAdvice] = useState<CaddieAdvice | null>(null);
  const [caddieModalOpen, setCaddieModalOpen] = useState(false);

  // ── Data ───────────────────────────────────────────────────────────────
  const [clubs, setClubs] = useState<Club[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);

  // ── Derived ────────────────────────────────────────────────────────────
  const hole = useMemo((): Hole | null => {
    if (!activeRound) return null;
    return activeRound.holes.find(h => h.number === activeRound.currentHoleNumber) ?? null;
  }, [activeRound]);

  const greenMid: Coordinate | null = useMemo(() => {
    if (!hole || hole.green_mid_lat == null || hole.green_mid_lng == null) return null;
    return { latitude: hole.green_mid_lat, longitude: hole.green_mid_lng };
  }, [hole]);

  const greenFront: Coordinate | null = useMemo(() => {
    if (!hole || hole.green_front_lat == null || hole.green_front_lng == null) return null;
    return { latitude: hole.green_front_lat, longitude: hole.green_front_lng };
  }, [hole]);

  const greenBack: Coordinate | null = useMemo(() => {
    if (!hole || hole.green_back_lat == null || hole.green_back_lng == null) return null;
    return { latitude: hole.green_back_lat, longitude: hole.green_back_lng };
  }, [hole]);

  const distToMid = useMemo(() => {
    if (!location || !greenMid) return null;
    return Math.round(haversineMetres(location, greenMid));
  }, [location, greenMid]);

  const distToFront = useMemo(() => {
    if (!location || !greenFront) return null;
    return Math.round(haversineMetres(location, greenFront));
  }, [location, greenFront]);

  const distToBack = useMemo(() => {
    if (!location || !greenBack) return null;
    return Math.round(haversineMetres(location, greenBack));
  }, [location, greenBack]);

  // Cumulative score vs par
  const cumulativeDiff = useMemo(() => {
    if (!activeRound) return null;
    let diff = 0;
    let scored = false;
    for (const h of activeRound.holes) {
      const s = activeRound.scores[h.number];
      if (s?.gross_score != null) { diff += s.gross_score - h.par; scored = true; }
    }
    return scored ? diff : null;
  }, [activeRound]);

  // Hole-filtered hazards
  const holeHazards = useMemo(() => {
    if (!activeRound) return [];
    const cur = activeRound.currentHoleNumber;
    return hazards.filter(h => {
      const noRestrict = h.hole_number == null && (!h.hole_numbers || h.hole_numbers.length === 0);
      return noRestrict || h.hole_number === cur || h.hole_numbers?.includes(cur);
    });
  }, [hazards, activeRound]);

  // ── Load clubs + hazards once ───────────────────────────────────────────
  useEffect(() => {
    supabase.from('clubs').select('*').order('sort_order').then(({ data }) => {
      if (data) setClubs(data as Club[]);
    });
    supabase.from('hazards').select('*').eq('course_id', '00000000-0000-0000-0000-000000000001').then(({ data }) => {
      if (data) setHazards(data as Hazard[]);
    });
  }, []);

  // ── Fetch wind once when location first becomes available ───────────────
  useEffect(() => {
    if (!windData && location) {
      fetchWind(location.latitude, location.longitude).then(w => {
        if (w) setWindData(w);
      });
    }
  }, [location, windData]);

  // ── Load existing hole score when hole changes ──────────────────────────
  useEffect(() => {
    if (!activeRound || !hole) return;
    setGrossScore(null);
    setPutts(2);
    setHoleScoreId(null);
    setCaddieAdvice(null);

    supabase
      .from('hole_scores')
      .select('id, gross_score, putts')
      .eq('round_id', activeRound.round.id)
      .eq('hole_number', hole.number)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setHoleScoreId(data.id as string);
          setGrossScore((data.gross_score as number | null) ?? null);
          setPutts((data.putts as number) ?? 2);
        }
      });
  }, [hole?.number]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-compute caddie strip when location changes ─────────────────────
  useEffect(() => {
    if (!location || !greenMid || clubs.length === 0) return;
    if (caddieTimer.current) clearTimeout(caddieTimer.current);
    caddieTimer.current = setTimeout(() => {
      const advice = buildCaddieAdvice({
        playerPos: location,
        greenMid,
        hazards: holeHazards,
        clubs,
        windSpeed: windData?.speed_kmh ?? 0,
        windDir: windData?.direction_deg ?? 0,
        windLabel: windData?.label ?? 'Calm',
        playerElevation: windData?.elevation_metres ?? 0,
        greenElevation: windData?.elevation_metres ?? 0,
      });
      if (advice) setCaddieAdvice(advice);
    }, 2000);
    return () => { if (caddieTimer.current) clearTimeout(caddieTimer.current); };
  }, [location, hole?.number, windData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Animate camera on hole change ───────────────────────────────────────
  useEffect(() => {
    if (!hole || !mapRef.current) return;
    const hasTee = hole.tee_lat != null && hole.tee_lng != null;
    const hasGreen = hole.green_mid_lat != null && hole.green_mid_lng != null;
    if (!hasTee && !hasGreen) return;

    const tLat = hasTee ? hole.tee_lat! : hole.green_mid_lat!;
    const tLng = hasTee ? hole.tee_lng! : hole.green_mid_lng!;
    const gLat = hasGreen ? hole.green_mid_lat! : tLat;
    const gLng = hasGreen ? hole.green_mid_lng! : tLng;

    const heading = hasTee && hasGreen ? bearingTo(tLat, tLng, gLat, gLng) : 0;
    const cLat = tLat + (gLat - tLat) * 0.35;
    const cLng = tLng + (gLng - tLng) * 0.35;
    const dist = haversineMetres({ latitude: tLat, longitude: tLng }, { latitude: gLat, longitude: gLng });
    const zoom = dist < 200 ? 18 : dist < 350 ? 17.5 : dist < 500 ? 17 : 16.5;

    mapRef.current.animateCamera(
      { center: { latitude: cLat, longitude: cLng }, heading, zoom, pitch: 0 },
      { duration: 800 },
    );
  }, [hole?.number]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist score (debounced) ───────────────────────────────────────────
  const persistScore = useCallback(async (score: number | null, p: number) => {
    if (!activeRound || !hole) return;
    const payload = {
      gross_score: score,
      putts: p,
    };
    // Update context
    updateScore(hole.number, payload as Partial<HoleScore>);

    if (holeScoreId) {
      await supabase.from('hole_scores').update(payload).eq('id', holeScoreId);
    } else if (score !== null) {
      const { data } = await supabase
        .from('hole_scores')
        .insert({
          round_id: activeRound.round.id,
          hole_id: hole.id,
          hole_number: hole.number,
          gross_score: score,
          putts: p,
          fairway_hit: 'na',
          gir_miss_direction: 'na',
          chips: 0,
          sand_shots: 0,
          penalties: 0,
        })
        .select('id')
        .single();
      if (data) setHoleScoreId((data as { id: string }).id);
    }
  }, [activeRound, hole, holeScoreId, updateScore]);

  const scheduleAutoSave = useCallback((score: number | null, p: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistScore(score, p), 600);
  }, [persistScore]);

  const incrementScore = useCallback(() => {
    setGrossScore(prev => {
      const next = (prev ?? hole?.par ?? 4) + 1;
      scheduleAutoSave(next, putts);
      return next;
    });
  }, [hole?.par, putts, scheduleAutoSave]);

  const decrementScore = useCallback(() => {
    setGrossScore(prev => {
      if (prev == null || prev <= 1) return prev;
      const next = prev - 1;
      scheduleAutoSave(next, putts);
      return next;
    });
  }, [putts, scheduleAutoSave]);

  const changePutts = useCallback((p: number) => {
    setPutts(p);
    scheduleAutoSave(grossScore, p);
  }, [grossScore, scheduleAutoSave]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const goToPrevHole = useCallback(() => {
    if (!activeRound || activeRound.currentHoleNumber <= 1) return;
    setCurrentHole(activeRound.currentHoleNumber - 1);
  }, [activeRound, setCurrentHole]);

  const goToNextHole = useCallback(() => {
    if (!activeRound) return;
    const maxHole = activeRound.round.holes_played === 9
      ? (activeRound.round.starting_hole ?? 1) + 8
      : 18;
    if (activeRound.currentHoleNumber >= maxHole) {
      navigation.navigate('EndRound');
      return;
    }
    setCurrentHole(activeRound.currentHoleNumber + 1);
  }, [activeRound, setCurrentHole, navigation]);

  // ── Swipe gesture ───────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy) * 3,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -60) goToNextHoleRef.current();
        else if (gs.dx > 60) goToPrevHoleRef.current();
      },
    })
  ).current;

  // Stable refs for panResponder callbacks (avoids stale closure)
  const goToNextHoleRef = useRef(goToNextHole);
  const goToPrevHoleRef = useRef(goToPrevHole);
  useEffect(() => { goToNextHoleRef.current = goToNextHole; }, [goToNextHole]);
  useEffect(() => { goToPrevHoleRef.current = goToPrevHole; }, [goToPrevHole]);

  // ── More Info caddie (with elevation fetch) ─────────────────────────────
  const handleCaddieMoreInfo = useCallback(async () => {
    if (!location || !greenMid) return;
    const [wind, greenElev] = await Promise.all([
      fetchWind(location.latitude, location.longitude),
      fetchElevation(greenMid.latitude, greenMid.longitude),
    ]);
    const advice = buildCaddieAdvice({
      playerPos: location,
      greenMid,
      hazards: holeHazards,
      clubs,
      windSpeed: wind?.speed_kmh ?? 0,
      windDir: wind?.direction_deg ?? 0,
      windLabel: wind?.label ?? 'Calm',
      playerElevation: wind?.elevation_metres ?? 0,
      greenElevation: greenElev ?? wind?.elevation_metres ?? 0,
    });
    if (advice) {
      setCaddieAdvice(advice);
      setCaddieModalOpen(true);
    }
  }, [location, greenMid, holeHazards, clubs]);

  // ── Guard ───────────────────────────────────────────────────────────────
  if (!activeRound || !hole) {
    return (
      <View style={styles.noRound}>
        <Text style={styles.noRoundText}>No active round</Text>
        <TouchableOpacity onPress={() => navigation.navigate('PlayHome')}>
          <Text style={styles.noRoundLink}>Go to Play</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const holeDiff = grossScore != null ? grossScore - hole.par : null;
  const cumulativeLabel = toParLabel(cumulativeDiff);
  const cumulativeColor = cumulativeDiff != null ? toParColor(cumulativeDiff) : Colors.textMuted;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      {/* ── Fixed top bar ─────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <Text style={styles.holeLabel}>HOLE {hole.number}</Text>
            <Text style={styles.holeMeta}>Par {hole.par}  ·  Index {hole.stroke_index}</Text>
          </View>

          <View style={styles.topRight}>
            <Text style={[styles.roundScoreLabel, { color: cumulativeColor }]}>
              {cumulativeLabel}
            </Text>
            <Text style={styles.roundScoreSub}>Round</Text>
          </View>

          <TouchableOpacity
            style={styles.exitBtn}
            onPress={() => Alert.alert('Exit Round', 'End round and go to summary?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'End Round', style: 'destructive', onPress: () => navigation.navigate('EndRound') },
            ])}
          >
            <Text style={styles.exitBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── Scrollable body ───────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
      >

        {/* ── Distance block ──────────────────────────────────────────── */}
        <View style={styles.distanceBlock}>
          {distToMid != null ? (
            <>
              <Text style={styles.distBig}>{distToMid}</Text>
              <Text style={styles.distUnit}>metres</Text>
            </>
          ) : (
            <>
              <Text style={styles.distBig}>{hole.white_metres ?? '—'}</Text>
              <Text style={styles.distUnit}>metres (hole length)</Text>
            </>
          )}

          {/* Front / Mid / Back row */}
          {(distToFront != null || distToMid != null || distToBack != null) && (
            <View style={styles.distRow}>
              <View style={styles.distRowItem}>
                <Text style={styles.distRowVal}>{distToFront ?? '—'}</Text>
                <Text style={styles.distRowLabel}>FRONT</Text>
              </View>
              <View style={[styles.distRowItem, styles.distRowMid]}>
                <Text style={[styles.distRowVal, styles.distRowValMid]}>{distToMid ?? '—'}</Text>
                <Text style={[styles.distRowLabel, styles.distRowLabelMid]}>MID</Text>
              </View>
              <View style={styles.distRowItem}>
                <Text style={styles.distRowVal}>{distToBack ?? '—'}</Text>
                <Text style={styles.distRowLabel}>BACK</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── AI Caddie strip ─────────────────────────────────────────── */}
        <View style={styles.caddieStrip}>
          <View style={styles.caddieStripLeft}>
            <Text style={styles.caddieIcon}>🤖</Text>
            <View style={styles.caddieTextBlock}>
              <Text style={styles.caddieStripTitle}>AI CADDIE</Text>
              <Text style={styles.caddieStripText} numberOfLines={2}>
                {caddieAdvice ? caddieAdvice.shortText : (location ? 'Computing…' : 'GPS required')}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleCaddieMoreInfo} activeOpacity={0.7}>
            <Text style={styles.caddieMore}>More →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Map block ───────────────────────────────────────────────── */}
        <View style={styles.mapBlock}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            mapType="satellite"
            initialRegion={{
              latitude: -26.6317,
              longitude: 152.9587,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            showsUserLocation
            showsMyLocationButton={false}
            showsCompass={false}
            rotateEnabled
            scrollEnabled
            zoomEnabled
          >
            {greenMid && (
              <Marker coordinate={greenMid} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.flagMarker}>
                  <Text style={styles.flagEmoji}>⛳</Text>
                </View>
              </Marker>
            )}

            {location && greenMid && (
              <Polyline
                coordinates={[location, greenMid]}
                strokeColor="rgba(255,255,255,0.5)"
                strokeWidth={1.5}
                lineDashPattern={[6, 5]}
              />
            )}

            {holeHazards.map(hazard => (
              <Polygon
                key={hazard.id}
                coordinates={hazard.coordinates.map(c => ({ latitude: c.lat, longitude: c.lng }))}
                fillColor={HAZARD_COLORS[hazard.type] + (hazard.type === 'ob' ? '00' : '44')}
                strokeColor={HAZARD_COLORS[hazard.type]}
                strokeWidth={hazard.type === 'ob' ? 2 : 1.5}
                lineDashPattern={hazard.type === 'ob' ? [8, 5] : undefined}
              />
            ))}
          </MapView>
        </View>

        {/* ── Score entry ─────────────────────────────────────────────── */}
        <View style={styles.scoreSection}>
          <Text style={styles.scoreSectionLabel}>SCORE THIS HOLE</Text>

          <View style={styles.scoreControls}>
            <TouchableOpacity
              style={styles.scoreAdj}
              onPress={decrementScore}
              activeOpacity={0.7}
            >
              <Text style={styles.scoreAdjText}>−</Text>
            </TouchableOpacity>

            <View style={[
              styles.scoreValueWrapper,
              holeDiff != null && { borderColor: toParColor(holeDiff) + '80' },
            ]}>
              <Text style={[
                styles.scoreValue,
                holeDiff != null && { color: toParColor(holeDiff) },
              ]}>
                {grossScore ?? '—'}
              </Text>
              {holeDiff != null && (
                <Text style={[styles.scoreDiff, { color: toParColor(holeDiff) }]}>
                  {toParLabel(holeDiff)}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.scoreAdj}
              onPress={incrementScore}
              activeOpacity={0.7}
            >
              <Text style={styles.scoreAdjText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Putts row */}
          <View style={styles.puttsRow}>
            <Text style={styles.puttsLabel}>Putts</Text>
            <View style={styles.puttsBtns}>
              {[1, 2, 3, 4].map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.puttsBtn, putts === p && styles.puttsBtnActive]}
                  onPress={() => changePutts(p)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.puttsBtnText, putts === p && styles.puttsBtnTextActive]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {hole.notes && (
            <Text style={styles.holeNotes} numberOfLines={2}>ℹ  {hole.notes}</Text>
          )}
        </View>

        {/* ── Hole navigation ─────────────────────────────────────────── */}
        <View style={styles.holeNav}>
          <TouchableOpacity
            style={[styles.holeNavBtn, activeRound.currentHoleNumber <= 1 && styles.holeNavBtnDisabled]}
            onPress={goToPrevHole}
            activeOpacity={0.8}
          >
            <Text style={styles.holeNavText}>← PREV HOLE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.holeNavBtn, styles.holeNavBtnNext]}
            onPress={goToNextHole}
            activeOpacity={0.8}
          >
            <Text style={[styles.holeNavText, styles.holeNavTextNext]}>
              {activeRound.currentHoleNumber >= (activeRound.round.holes_played === 9
                ? (activeRound.round.starting_hole ?? 1) + 8 : 18)
                ? 'FINISH ROUND →'
                : 'NEXT HOLE →'}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ── Caddie More Info modal ─────────────────────────────────────── */}
      {caddieAdvice && caddieModalOpen && (
        <View style={[StyleSheet.absoluteFill, styles.caddieModalWrapper]}>
          <View style={styles.caddieModalInner}>
            <CaddiePanel
              advice={caddieAdvice}
              onDismiss={() => setCaddieModalOpen(false)}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  noRound: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', gap: Spacing.base },
  noRoundText: { fontSize: FontSize.md, color: Colors.textSecondary, fontFamily: Font.regular },
  noRoundLink: { fontSize: FontSize.base, color: Colors.green, fontWeight: FontWeight.semibold, fontFamily: Font.semibold },

  safeTop: { backgroundColor: Colors.surface1, zIndex: 10 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  topLeft: { flex: 1 },
  holeLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  holeMeta: {
    fontSize: FontSize.xs,
    fontFamily: Font.regular,
    color: Colors.textMuted,
    marginTop: 1,
  },
  topRight: { alignItems: 'flex-end' },
  roundScoreLabel: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    fontFamily: Font.black,
    letterSpacing: -0.5,
  },
  roundScoreSub: {
    fontSize: FontSize.xs,
    fontFamily: Font.regular,
    color: Colors.textMuted,
  },
  exitBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.xs,
  },
  exitBtnText: { fontSize: FontSize.sm, color: Colors.textMuted },

  scroll: { flex: 1 },
  scrollContent: { gap: 0 },

  // Distance block
  distanceBlock: {
    backgroundColor: Colors.surface1,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.base,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  distBig: {
    fontSize: 72,
    fontWeight: FontWeight.black,
    fontFamily: Font.black,
    color: Colors.green,
    lineHeight: 76,
    letterSpacing: -2,
  },
  distUnit: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    fontFamily: Font.medium,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.xs,
  },
  distRow: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    gap: Spacing.xl,
  },
  distRowItem: { alignItems: 'center' },
  distRowMid: {},
  distRowVal: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    fontFamily: Font.semibold,
    color: Colors.textSecondary,
  },
  distRowValMid: {
    fontSize: FontSize.lg,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    color: Colors.green,
  },
  distRowLabel: {
    fontSize: 10,
    fontFamily: Font.medium,
    fontWeight: FontWeight.medium,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  distRowLabelMid: { color: Colors.green },

  // Caddie strip
  caddieStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface2,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  caddieStripLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  caddieIcon: { fontSize: 18 },
  caddieTextBlock: { flex: 1 },
  caddieStripTitle: {
    fontSize: 10,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    color: Colors.green,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  caddieStripText: {
    fontSize: FontSize.sm,
    fontFamily: Font.regular,
    color: Colors.text,
    lineHeight: 18,
  },
  caddieMore: {
    fontSize: FontSize.sm,
    fontFamily: Font.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.green,
  },

  // Map block
  mapBlock: {
    height: MAP_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    overflow: 'hidden',
  },
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  // Score section
  scoreSection: {
    backgroundColor: Colors.surface1,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.base,
  },
  scoreSectionLabel: {
    fontSize: FontSize.xs,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    letterSpacing: 1,
    textAlign: 'center',
  },
  scoreControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  scoreAdj: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreAdjText: {
    fontSize: 32,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    lineHeight: 36,
  },
  scoreValueWrapper: {
    width: 88,
    height: 88,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface2,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontSize: FontSize.xxxl,
    fontFamily: Font.black,
    fontWeight: FontWeight.black,
    color: Colors.text,
    lineHeight: FontSize.xxxl + 4,
  },
  scoreDiff: {
    fontSize: FontSize.sm,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    marginTop: -2,
  },
  puttsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  puttsLabel: {
    fontSize: FontSize.sm,
    fontFamily: Font.medium,
    fontWeight: FontWeight.medium,
    color: Colors.textMuted,
    width: 44,
  },
  puttsBtns: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  puttsBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puttsBtnActive: {
    backgroundColor: Colors.greenMuted,
    borderColor: Colors.green,
  },
  puttsBtnText: {
    fontSize: FontSize.md,
    fontFamily: Font.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  puttsBtnTextActive: { color: Colors.green },
  holeNotes: {
    fontSize: FontSize.xs,
    fontFamily: Font.regular,
    color: Colors.textMuted,
    lineHeight: 16,
  },

  // Hole nav
  holeNav: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.base,
    backgroundColor: Colors.surface1,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  holeNavBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holeNavBtnDisabled: { opacity: 0.3 },
  holeNavBtnNext: {
    backgroundColor: Colors.greenMuted,
    borderColor: Colors.green,
  },
  holeNavText: {
    fontSize: FontSize.sm,
    fontFamily: Font.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  holeNavTextNext: { color: Colors.green },

  // Caddie modal overlay
  caddieModalWrapper: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  caddieModalInner: {
    padding: Spacing.base,
    paddingBottom: Spacing.xl,
  },

  // Map markers
  flagMarker: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(11,24,16,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.green,
  },
  flagEmoji: { fontSize: 15 },
});
