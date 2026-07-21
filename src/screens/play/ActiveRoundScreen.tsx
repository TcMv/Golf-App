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
import * as Haptics from 'expo-haptics';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useRound } from '../../context/RoundContext';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { haversineMetres } from '../../utils/distance';
import { fetchWind, fetchElevation } from '../../utils/wind';
import type { WindData } from '../../utils/wind';
import { buildCaddieAdvice } from '../../utils/caddie';
import type { CaddieAdvice } from '../../utils/caddie';
import CaddiePanel from '../../components/caddie/CaddiePanel';
import { fetchHoleHistory } from '../../utils/holeHistory';
import type { HoleHistorySummary } from '../../utils/holeHistory';
import {
  queueHoleScore,
  removeQueuedHoleScore,
  syncQueuedHoleScores,
} from '../../lib/offlineScores';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Club, ClubType, Coordinate, Hazard, HazardType, Hole, HoleScore } from '../../types';
import { convertDistance, distanceUnitLabel } from '../../utils/units';
import type { DistanceUnits } from '../../utils/units';

// ─── Constants ───────────────────────────────────────────────────────────────

const HAZARD_COLORS: Record<HazardType, string> = {
  bunker: Colors.eagle,
  water: Colors.textMuted,
  trees: Colors.greenDark,
  ob: Colors.text,
  red_zone: Colors.doublePlus,
};

const MAP_HEIGHT = 240;

type Nav = NativeStackNavigationProp<{
  Main: undefined;
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

function clubTypeFromName(name: string): ClubType {
  const normalized = name.toLowerCase();
  if (normalized.includes('putter')) return 'putter';
  if (normalized.includes('driver')) return 'driver';
  if (normalized.includes('wood')) return 'wood';
  if (normalized.includes('hybrid')) return 'hybrid';
  if (normalized.includes('wedge')) return 'wedge';
  return 'iron';
}

type TopBarProps = {
  hole: Hole;
  cumulativeDiff: number | null;
  onExit: () => void;
};

const RoundTopBar = React.memo(function RoundTopBar({
  hole,
  cumulativeDiff,
  onExit,
}: TopBarProps) {
  const cumulativeColor = cumulativeDiff != null ? toParColor(cumulativeDiff) : Colors.textMuted;
  return (
    <SafeAreaView edges={['top']} style={styles.safeTop}>
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <Text style={styles.holeLabel}>HOLE {hole.number}</Text>
          <Text style={styles.holeMeta}>Par {hole.par}  ·  Index {hole.stroke_index}</Text>
        </View>
        <View style={styles.topRight}>
          <Text style={[styles.roundScoreLabel, { color: cumulativeColor }]}>
            {toParLabel(cumulativeDiff)}
          </Text>
          <Text style={styles.roundScoreSub}>Round</Text>
        </View>
        <TouchableOpacity style={styles.exitBtn} onPress={onExit}>
          <Text style={styles.exitBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
});

type DistanceBlockProps = {
  front: number | null;
  mid: number | null;
  back: number | null;
  fallback: number | null;
  accuracy: number | null;
  stale: boolean;
  error: string | null;
  units: DistanceUnits;
};

const DistanceBlock = React.memo(function DistanceBlock({
  front,
  mid,
  back,
  fallback,
  accuracy,
  stale,
  error,
  units,
}: DistanceBlockProps) {
  const display = (value: number | null) => value == null ? '—' : convertDistance(value, units);
  const unit = distanceUnitLabel(units);
  const gpsBad = accuracy != null && accuracy > 15;
  return (
    <View style={styles.distanceBlock}>
      {mid != null ? (
        <>
          <Text style={styles.distBig}>{display(mid)}</Text>
          <Text style={styles.distUnit}>{unit}</Text>
          {(stale || error) && (
            <Text style={styles.gpsStatus}>
              {error ? 'GPS unavailable - using last known position' : 'GPS signal stale'}
            </Text>
          )}
          {!stale && !error && accuracy != null && (
            <Text style={[styles.gpsStatus, gpsBad && { color: '#F5A623' }]}>
              {gpsBad ? `GPS ±${accuracy}m — move to open sky` : `GPS ±${accuracy}m`}
            </Text>
          )}
        </>
      ) : (
        <>
          <Text style={styles.distBig}>{display(fallback)}</Text>
          <Text style={styles.distUnit}>{unit} (hole length)</Text>
        </>
      )}
      {(front != null || mid != null || back != null) && (
        <View style={styles.distRow}>
          <View style={styles.distRowItem}>
            <Text style={styles.distRowVal}>{display(front)}</Text>
            <Text style={styles.distRowLabel}>FRONT</Text>
          </View>
          <View style={styles.distRowItem}>
            <Text style={[styles.distRowVal, styles.distRowValMid]}>{display(mid)}</Text>
            <Text style={[styles.distRowLabel, styles.distRowLabelMid]}>MID</Text>
          </View>
          <View style={styles.distRowItem}>
            <Text style={styles.distRowVal}>{display(back)}</Text>
            <Text style={styles.distRowLabel}>BACK</Text>
          </View>
        </View>
      )}
    </View>
  );
});

type CaddieStripProps = {
  advice: CaddieAdvice | null;
  hasLocation: boolean;
  onMore: () => void;
  units: DistanceUnits;
};

const CaddieStrip = React.memo(function CaddieStrip({
  advice,
  hasLocation,
  onMore,
  units,
}: CaddieStripProps) {
  const clubLabel = advice
    ? advice.recommended.club.custom_name ?? advice.recommended.club.name
    : null;
  const summary = advice
    ? `${advice.windLabel}. Play ${convertDistance(advice.playingDistance, units)}${distanceUnitLabel(units, true)}. ${clubLabel}.`
    : (hasLocation ? 'Computing…' : 'GPS required');
  return (
    <View style={styles.caddieStrip}>
      <View style={styles.caddieStripLeft}>
        <Text style={styles.caddieIcon}>🤖</Text>
        <View style={styles.caddieTextBlock}>
          <Text style={styles.caddieStripTitle}>AI CADDIE</Text>
          <Text style={styles.caddieStripText} numberOfLines={2}>
            {summary}
          </Text>
        </View>
      </View>
      <TouchableOpacity onPress={onMore} activeOpacity={0.7}>
        <Text style={styles.caddieMore}>More →</Text>
      </TouchableOpacity>
    </View>
  );
});

type RoundMapProps = {
  mapRef: React.RefObject<MapView | null>;
  tee: Coordinate | null;
  green: Coordinate | null;
  hazards: Hazard[];
  fallback: Coordinate;
};

const RoundMap = React.memo(function RoundMap({
  mapRef,
  tee,
  green,
  hazards,
  fallback,
}: RoundMapProps) {
  return (
    <View style={styles.mapBlock}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        mapType="satellite"
        initialRegion={{
          latitude: fallback.latitude,
          longitude: fallback.longitude,
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
        {tee && (
          <Marker coordinate={tee} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.teeMarker}>
              <Text style={styles.teeMarkerText}>T</Text>
            </View>
          </Marker>
        )}
        {green && (
          <Marker coordinate={green} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.flagMarker}>
              <Text style={styles.flagEmoji}>⛳</Text>
            </View>
          </Marker>
        )}
        {hazards.map(hazard => (
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
  );
});

type ScoreEntryProps = {
  hole: Hole;
  score: number | null;
  putts: number;
  syncPending: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
  onPutts: (putts: number) => void;
};

const ScoreEntry = React.memo(function ScoreEntry({
  hole,
  score,
  putts,
  syncPending,
  onDecrement,
  onIncrement,
  onPutts,
}: ScoreEntryProps) {
  const holeDiff = score != null ? score - hole.par : null;
  return (
    <View style={styles.scoreSection}>
      <View style={styles.scoreSectionHeader}>
        <Text style={styles.scoreSectionLabel}>SCORE THIS HOLE</Text>
        {syncPending && <Text style={styles.syncPending}>SAVED OFFLINE</Text>}
      </View>
      <View style={styles.scoreControls}>
        <TouchableOpacity style={styles.scoreAdj} onPress={onDecrement} activeOpacity={0.7}>
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
            {score ?? '—'}
          </Text>
          {holeDiff != null && (
            <Text style={[styles.scoreDiff, { color: toParColor(holeDiff) }]}>
              {toParLabel(holeDiff)}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.scoreAdj} onPress={onIncrement} activeOpacity={0.7}>
          <Text style={styles.scoreAdjText}>+</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.puttsRow}>
        <Text style={styles.puttsLabel}>Putts</Text>
        <View style={styles.puttsBtns}>
          {[1, 2, 3, 4].map(value => (
            <TouchableOpacity
              key={value}
              style={[styles.puttsBtn, putts === value && styles.puttsBtnActive]}
              onPress={() => onPutts(value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.puttsBtnText, putts === value && styles.puttsBtnTextActive]}>
                {value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {hole.notes && <Text style={styles.holeNotes} numberOfLines={2}>ℹ  {hole.notes}</Text>}
    </View>
  );
});

type HoleNavigationProps = {
  canGoPrevious: boolean;
  isLastHole: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

const HoleNavigation = React.memo(function HoleNavigation({
  canGoPrevious,
  isLastHole,
  onPrevious,
  onNext,
}: HoleNavigationProps) {
  return (
    <View style={styles.holeNav}>
      <TouchableOpacity
        style={[styles.holeNavBtn, !canGoPrevious && styles.holeNavBtnDisabled]}
        onPress={onPrevious}
        disabled={!canGoPrevious}
        activeOpacity={0.8}
      >
        <Text style={styles.holeNavText}>← PREV HOLE</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.holeNavBtn, styles.holeNavBtnNext]}
        onPress={onNext}
        activeOpacity={0.8}
      >
        <Text style={[styles.holeNavText, styles.holeNavTextNext]}>
          {isLastHole ? 'FINISH ROUND →' : 'NEXT HOLE →'}
        </Text>
      </TouchableOpacity>
    </View>
  );
});

// ─── Main component ──────────────────────────────────────────────────────────

export default function ActiveRoundScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { activeRound, updateScore, setCurrentHole } = useRound();
  const { user, profile } = useAuth();
  const units = profile?.units_preference ?? 'metres';
  const { location, accuracy: locationAccuracy, stale: locationStale, error: locationError } = useLocation();
  const mapRef = useRef<MapView>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caddieTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Per-hole score state ────────────────────────────────────────────────
  const [grossScore, setGrossScore] = useState<number | null>(null);
  const [putts, setPutts] = useState<number>(2);
  const [scoreSyncPending, setScoreSyncPending] = useState(false);

  // ── Caddie ─────────────────────────────────────────────────────────────
  const [windData, setWindData] = useState<WindData | null>(null);
  const [caddieAdvice, setCaddieAdvice] = useState<CaddieAdvice | null>(null);
  const [caddieModalOpen, setCaddieModalOpen] = useState(false);
  const [holeHistory, setHoleHistory] = useState<HoleHistorySummary | null>(null);

  // ── Data ───────────────────────────────────────────────────────────────
  const [clubs, setClubs] = useState<Club[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);

  // ── Derived ────────────────────────────────────────────────────────────
  const hole = useMemo((): Hole | null => {
    if (!activeRound) return null;
    return activeRound.holes.find(h => h.number === activeRound.currentHoleNumber) ?? null;
  }, [activeRound]);

  const roundHoleNumbers = useMemo(() => {
    if (!activeRound) return [];
    const start = activeRound.round.starting_hole ?? 1;
    if (activeRound.round.holes_played === 9) {
      return Array.from({ length: 9 }, (_, index) => start + index);
    }
    return Array.from({ length: 18 }, (_, index) => ((start - 1 + index) % 18) + 1);
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

  const tee: Coordinate | null = useMemo(() => {
    if (!hole || hole.tee_lat == null || hole.tee_lng == null) return null;
    return { latitude: hole.tee_lat, longitude: hole.tee_lng };
  }, [hole]);

  const mapFallback = useMemo((): Coordinate => ({
    latitude: greenMid?.latitude ?? activeRound?.course.lat ?? -26.6317,
    longitude: greenMid?.longitude ?? activeRound?.course.lng ?? 152.9587,
  }), [activeRound?.course.lat, activeRound?.course.lng, greenMid]);

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

  // ── Load clubs (user_clubs preferred, fallback global) + hazards ───────
  useEffect(() => {
    const loadClubs = async () => {
      if (user?.id) {
        const { data: uc } = await supabase
          .from('user_clubs')
          .select('id, club_name, carry_distance_metres')
          .eq('user_id', user.id)
          .not('carry_distance_metres', 'is', null)
          .order('carry_distance_metres', { ascending: false });
        if (uc && uc.length > 0) {
          setClubs(uc.map((c: any) => ({
            id: c.id as string,
            name: c.club_name as string,
            type: clubTypeFromName(c.club_name as string),
            loft: null,
            custom_name: null,
            sort_order: 0,
            carry_metres: c.carry_distance_metres as number,
            carry_stddev_metres: null,
          })));
          return;
        }
      }
      const { data } = await supabase
        .from('clubs')
        .select('id, name, type, loft, custom_name, sort_order, carry_metres, carry_stddev_metres')
        .order('sort_order');
      if (data) setClubs(data as Club[]);
    };
    loadClubs();
    if (!activeRound?.round.course_id) return;
    supabase
      .from('hazards')
      .select('id, course_id, hole_number, hole_numbers, type, label, coordinates, created_at')
      .eq('course_id', activeRound.round.course_id)
      .then(({ data }) => {
      if (data) setHazards(data as Hazard[]);
    });
  }, [user?.id, activeRound?.round.course_id]);

  useEffect(() => {
    let cancelled = false;
    setHoleHistory(null);
    if (!user?.id || !activeRound?.round.course_id || !hole) return undefined;
    fetchHoleHistory(user.id, activeRound.round.course_id, hole.number).then(history => {
      if (!cancelled) setHoleHistory(history);
    });
    return () => {
      cancelled = true;
    };
  }, [activeRound?.round.course_id, hole?.number, user?.id]);

  useEffect(() => {
    const flushQueue = async () => {
      const synced = await syncQueuedHoleScores();
      if (synced > 0) setScoreSyncPending(false);
    };
    flushQueue();
    const interval = setInterval(flushQueue, 15_000);
    return () => clearInterval(interval);
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
    const localScore = activeRound.scores[hole.number];
    setGrossScore(localScore?.gross_score ?? null);
    setPutts(localScore?.putts ?? 2);
    setCaddieAdvice(null);

    if (localScore?.gross_score != null) return;

    supabase
      .from('hole_scores')
      .select('id, gross_score, putts')
      .eq('round_id', activeRound.round.id)
      .eq('hole_number', hole.number)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
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
        holeNumber: hole?.number,
        holePar: hole?.par,
        holeIndex: hole?.stroke_index,
        history: holeHistory,
      });
      if (advice) setCaddieAdvice(advice);
    }, 2000);
    return () => { if (caddieTimer.current) clearTimeout(caddieTimer.current); };
  }, [location, hole?.number, windData, holeHistory]); // eslint-disable-line react-hooks/exhaustive-deps

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
      round_id: activeRound.round.id,
      hole_id: hole.id,
      hole_number: hole.number,
      gross_score: score,
      putts: p,
      fairway_hit: activeRound.scores[hole.number]?.fairway_hit ?? 'na',
      gir_miss_direction: activeRound.scores[hole.number]?.gir_miss_direction ?? 'na',
      chips: activeRound.scores[hole.number]?.chips ?? 0,
      sand_shots: activeRound.scores[hole.number]?.sand_shots ?? 0,
      penalties: activeRound.scores[hole.number]?.penalties ?? 0,
    };
    updateScore(hole.number, payload as Partial<HoleScore>);

    if (score === null) return;

    await queueHoleScore(payload);
    setScoreSyncPending(true);

    const { error } = await supabase
      .from('hole_scores')
      .upsert(payload, { onConflict: 'round_id,hole_number' });

    if (!error) {
      await removeQueuedHoleScore(activeRound.round.id, hole.number);
      setScoreSyncPending(false);
    }
  }, [activeRound, hole, updateScore]);

  const scheduleAutoSave = useCallback((score: number | null, p: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistScore(score, p), 600);
  }, [persistScore]);

  const incrementScore = useCallback(() => {
    void Haptics.selectionAsync();
    setGrossScore(prev => {
      const next = (prev ?? hole?.par ?? 4) + 1;
      scheduleAutoSave(next, putts);
      return next;
    });
  }, [hole?.par, putts, scheduleAutoSave]);

  const decrementScore = useCallback(() => {
    void Haptics.selectionAsync();
    setGrossScore(prev => {
      if (prev == null || prev <= 1) return prev;
      const next = prev - 1;
      scheduleAutoSave(next, putts);
      return next;
    });
  }, [putts, scheduleAutoSave]);

  const changePutts = useCallback((p: number) => {
    void Haptics.selectionAsync();
    setPutts(p);
    scheduleAutoSave(grossScore, p);
  }, [grossScore, scheduleAutoSave]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const goToPrevHole = useCallback(() => {
    if (!activeRound) return;
    const index = roundHoleNumbers.indexOf(activeRound.currentHoleNumber);
    if (index <= 0) return;
    setCurrentHole(roundHoleNumbers[index - 1]);
  }, [activeRound, roundHoleNumbers, setCurrentHole]);

  const goToNextHole = useCallback(() => {
    if (!activeRound) return;
    const index = roundHoleNumbers.indexOf(activeRound.currentHoleNumber);
    if (index < 0 || index === roundHoleNumbers.length - 1) {
      navigation.navigate('EndRound');
      return;
    }
    setCurrentHole(roundHoleNumbers[index + 1]);
  }, [activeRound, roundHoleNumbers, setCurrentHole, navigation]);

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

  // ── More Info caddie (with elevation + history) ─────────────────────────
  const handleCaddieMoreInfo = useCallback(async () => {
    if (!location || !greenMid || !activeRound || !hole) return;
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
      holeNumber: hole.number,
      holePar: hole.par,
      holeIndex: hole.stroke_index,
      history: holeHistory,
    });
    if (advice) {
      setCaddieAdvice(advice);
      setCaddieModalOpen(true);
    }
  }, [location, greenMid, holeHazards, clubs, activeRound, hole, holeHistory]);

  const handleExit = useCallback(() => {
    Alert.alert('Exit Round', 'End round and go to summary?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Round', style: 'destructive', onPress: () => navigation.navigate('EndRound') },
    ]);
  }, [navigation]);

  // ── Guard ───────────────────────────────────────────────────────────────
  if (!activeRound || !hole) {
    return (
      <View style={styles.noRound}>
        <Text style={styles.noRoundText}>No active round</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Main')}>
          <Text style={styles.noRoundLink}>Go to Play</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentHoleIndex = roundHoleNumbers.indexOf(activeRound.currentHoleNumber);

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      <RoundTopBar hole={hole} cumulativeDiff={cumulativeDiff} onExit={handleExit} />

      {/* ── Scrollable body ───────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
      >

        <DistanceBlock
          front={distToFront}
          mid={distToMid}
          back={distToBack}
          fallback={hole.white_metres}
          accuracy={locationAccuracy}
          stale={locationStale}
          error={locationError}
          units={units}
        />
        <CaddieStrip
          advice={caddieAdvice}
          hasLocation={location != null}
          onMore={handleCaddieMoreInfo}
          units={units}
        />
        <RoundMap
          mapRef={mapRef}
          tee={tee}
          green={greenMid}
          hazards={holeHazards}
          fallback={mapFallback}
        />
        <ScoreEntry
          hole={hole}
          score={grossScore}
          putts={putts}
          syncPending={scoreSyncPending}
          onDecrement={decrementScore}
          onIncrement={incrementScore}
          onPutts={changePutts}
        />
        <HoleNavigation
          canGoPrevious={currentHoleIndex > 0}
          isLastHole={currentHoleIndex === roundHoleNumbers.length - 1}
          onPrevious={goToPrevHole}
          onNext={goToNextHole}
        />

      </ScrollView>

      {/* ── Caddie More Info modal ─────────────────────────────────────── */}
      {caddieAdvice && caddieModalOpen && (
        <View style={[StyleSheet.absoluteFill, styles.caddieModalWrapper]}>
          <View style={styles.caddieModalInner}>
            <CaddiePanel
              advice={caddieAdvice}
              onDismiss={() => setCaddieModalOpen(false)}
              units={units}
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
  gpsStatus: {
    fontSize: FontSize.xs,
    fontFamily: Font.medium,
    color: Colors.bogey,
    marginTop: Spacing.sm,
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
    fontSize: FontSize.xs,
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
    fontSize: FontSize.xs,
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
  scoreSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  syncPending: {
    fontSize: FontSize.xs,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    color: Colors.bogey,
    letterSpacing: 1.1,
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
    fontSize: FontSize.xxl,
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
    backgroundColor: Colors.mapOverlay,
    justifyContent: 'flex-end',
  },
  caddieModalInner: {
    padding: Spacing.base,
    paddingBottom: Spacing.xl,
  },

  // Map markers
  teeMarker: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    backgroundColor: Colors.mapOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.text,
  },
  teeMarkerText: {
    fontSize: FontSize.xs,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  flagMarker: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    backgroundColor: Colors.mapOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.green,
  },
  flagEmoji: { fontSize: 15 },
});
