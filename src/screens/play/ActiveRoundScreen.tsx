import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useRound } from '../../context/RoundContext';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { haversineMetres } from '../../utils/distance';
import { fetchElevation, fetchWind } from '../../utils/wind';
import type { WindData } from '../../utils/wind';
import {
  buildCaddieAdvice,
  buildCaddiePrompt,
  detectCaddieLie,
  validatedCaddieFactor,
} from '../../utils/caddie';
import type { CaddieAdvice, CaddieZone } from '../../utils/caddie';
import { fetchHoleHistory } from '../../utils/holeHistory';
import type { HoleHistorySummary } from '../../utils/holeHistory';
import {
  queueHoleScore,
  removeQueuedHoleScore,
  syncQueuedHoleScores,
} from '../../lib/offlineScores';
import {
  applyLearnedCarries,
  buildClubLearningMap,
  learningNote,
} from '../../utils/shotTracking';
import type { ClubLearningMap, ShotLearningRow } from '../../utils/shotTracking';
import { clubTypeFromBagName } from '../../utils/clubSetup';
import HoleScoringSheet from '../../components/scoring/HoleScoringSheet';
import CaddiePanel from '../../components/caddie/CaddiePanel';
import ShotCaptureSheet from '../../components/shots/ShotCaptureSheet';
import type { ShotCaptureValue } from '../../components/shots/ShotCaptureSheet';
import { Colors, Font, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../constants/theme';
import type {
  Club,
  ClubType,
  Coordinate,
  Hazard,
  HazardType,
  HoleScore,
  Lie,
  Shot,
} from '../../types';
import { convertDistance, distanceUnitLabel } from '../../utils/units';

type Nav = NativeStackNavigationProp<{
  Main: undefined;
  EndRound: undefined;
}>;

type PendingShot = {
  start: Coordinate;
  end: Coordinate;
  distanceMetres: number;
  startLie: Lie;
};

const OFF_COURSE_PREVIEW_DISTANCE_METRES = 700;

const HAZARD_COLORS: Record<HazardType, string> = {
  bunker: Colors.eagle,
  water: '#4A90D9',
  trees: Colors.greenDark,
  ob: Colors.text,
  red_zone: Colors.red,
};

function clubTypeFromName(name: string): ClubType {
  return clubTypeFromBagName(name);
}

function scoreLabel(diff: number | null): string {
  if (diff == null || diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : String(diff);
}

function bearingTo(from: Coordinate, to: Coordinate): number {
  const radians = Math.PI / 180;
  const deltaLongitude = (to.longitude - from.longitude) * radians;
  const lat1 = from.latitude * radians;
  const lat2 = to.latitude * radians;
  const y = Math.sin(deltaLongitude) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLongitude);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function addLearnedMissAdvice(
  advice: CaddieAdvice | null,
  learning: ClubLearningMap,
): CaddieAdvice | null {
  if (!advice) return null;
  const clubName = advice.recommended.club.custom_name ?? advice.recommended.club.name;
  const summary = learning[clubName.toLowerCase()];
  if (!summary || summary.sampleCount < 3 || !summary.commonMiss) return advice;
  const tendency = `Your tracked ${clubName} miss is ${summary.commonMiss}; aim to leave room for it.`;
  return {
    ...advice,
    strategy: [advice.strategy[0], tendency, ...advice.strategy.slice(1)],
    context: `${advice.context}\nPlayer tendency: ${summary.sampleCount} tracked ${clubName} shots, usual miss ${summary.commonMiss}.`,
  };
}

export default function ActiveRoundScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { activeRound, addShot, setCurrentHole, updateScore } = useRound();
  const { user, profile } = useAuth();
  const units = profile?.units_preference ?? 'metres';
  const { location, stale: locationStale, error: locationError } = useLocation();
  const mapRef = useRef<MapView>(null);
  const caddieTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [shotLearningRows, setShotLearningRows] = useState<ShotLearningRow[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [zones, setZones] = useState<CaddieZone[]>([]);
  const [windData, setWindData] = useState<WindData | null>(null);
  const [holeHistory, setHoleHistory] = useState<HoleHistorySummary | null>(null);
  const [caddieAdvice, setCaddieAdvice] = useState<CaddieAdvice | null>(null);
  const [caddieOpen, setCaddieOpen] = useState(false);
  const [caddieLlmText, setCaddieLlmText] = useState<string | null>(null);
  const [caddieLlmLoading, setCaddieLlmLoading] = useState(false);
  const [scoringOpen, setScoringOpen] = useState(false);
  const [pendingShot, setPendingShot] = useState<PendingShot | null>(null);
  const [savingShot, setSavingShot] = useState(false);
  const [scoreSyncPending, setScoreSyncPending] = useState(false);
  const [customTarget, setCustomTarget] = useState<Coordinate | null>(null);
  const [selectingTarget, setSelectingTarget] = useState(false);
  const [placingShotStart, setPlacingShotStart] = useState(false);

  const hole = useMemo(
    () => activeRound?.holes.find(item => item.number === activeRound.currentHoleNumber) ?? null,
    [activeRound],
  );
  const holeShots = useMemo(
    () => activeRound?.shots[activeRound.currentHoleNumber] ?? [],
    [activeRound],
  );
  const currentScore = hole && activeRound ? activeRound.scores[hole.number] : undefined;

  const roundHoleNumbers = useMemo(() => {
    if (!activeRound) return [];
    const start = activeRound.round.starting_hole ?? 1;
    return activeRound.round.holes_played === 9
      ? Array.from({ length: 9 }, (_, index) => start + index)
      : Array.from({ length: 18 }, (_, index) => ((start - 1 + index) % 18) + 1);
  }, [activeRound]);
  const currentHoleIndex = activeRound
    ? roundHoleNumbers.indexOf(activeRound.currentHoleNumber)
    : -1;

  const coordinate = useCallback((lat: number | null, lng: number | null): Coordinate | null => (
    lat == null || lng == null ? null : { latitude: lat, longitude: lng }
  ), []);
  const tee = coordinate(hole?.tee_lat ?? null, hole?.tee_lng ?? null);
  const greenFront = coordinate(hole?.green_front_lat ?? null, hole?.green_front_lng ?? null);
  const greenMid = coordinate(hole?.green_mid_lat ?? null, hole?.green_mid_lng ?? null);
  const greenBack = coordinate(hole?.green_back_lat ?? null, hole?.green_back_lng ?? null);
  const mapFallback: Coordinate = greenMid ?? tee ?? {
    latitude: activeRound?.course.lat ?? -26.6317,
    longitude: activeRound?.course.lng ?? 152.9587,
  };

  const offCoursePreview = useMemo(() => (
    location != null
    && tee != null
    && haversineMetres(location, tee) > OFF_COURSE_PREVIEW_DISTANCE_METRES
  ), [location?.latitude, location?.longitude, tee?.latitude, tee?.longitude]);
  const effectiveLocation: Coordinate | null = offCoursePreview ? tee : location;

  const distanceTo = useCallback((target: Coordinate | null) => (
    effectiveLocation && target ? Math.round(haversineMetres(effectiveLocation, target)) : null
  ), [effectiveLocation]);
  const frontDistance = distanceTo(greenFront);
  const midDistance = distanceTo(greenMid);
  const backDistance = distanceTo(greenBack);

  const cumulativeDiff = useMemo(() => {
    if (!activeRound) return null;
    let total = 0;
    let hasScore = false;
    activeRound.holes.forEach(item => {
      const score = activeRound.scores[item.number]?.gross_score;
      if (score != null) {
        total += score - item.par;
        hasScore = true;
      }
    });
    return hasScore ? total : null;
  }, [activeRound]);

  const holeHazards = useMemo(() => {
    if (!activeRound) return [];
    return hazards.filter(hazard => (
      (hazard.hole_number == null && (!hazard.hole_numbers || hazard.hole_numbers.length === 0))
      || hazard.hole_number === activeRound.currentHoleNumber
      || hazard.hole_numbers?.includes(activeRound.currentHoleNumber)
    ));
  }, [activeRound, hazards]);

  const learning = useMemo(
    () => buildClubLearningMap(shotLearningRows),
    [shotLearningRows],
  );
  const learnedClubs = useMemo(
    () => applyLearnedCarries(clubs, learning),
    [clubs, learning],
  );
  const clubMisses = useMemo(
    () => Object.fromEntries(
      Object.entries(learning)
        .filter(([, summary]) => summary.sampleCount >= 3 && summary.commonMiss != null)
        .map(([clubName, summary]) => [clubName, summary.commonMiss]),
    ) as Record<string, 'left' | 'right' | 'short' | 'long'>,
    [learning],
  );
  const playerLie = useMemo(() => (
    effectiveLocation
      ? detectCaddieLie({ playerPos: effectiveLocation, hazards: holeHazards, zones, tee })
      : 'rough'
  ), [effectiveLocation, holeHazards, tee, zones]);
  const fairwayCentreline = useMemo(
    () => zones.find(zone => zone.zone_type === 'fairway_centreline')?.coordinates ?? [],
    [zones],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const shotQuery = user?.id
        ? supabase
            .from('shots')
            .select('club_name, distance_metres, target_type, outcome, miss_direction, strike_quality, rounds!inner(user_id)')
            .eq('rounds.user_id', user.id)
        : Promise.resolve({ data: null });
      const [shotsResult, userClubsResult, globalClubsResult] = await Promise.all([
        shotQuery,
        user?.id
          ? supabase
              .from('user_clubs')
              .select('id, club_name, carry_distance_metres')
              .eq('user_id', user.id)
              .order('carry_distance_metres', { ascending: false })
          : Promise.resolve({ data: null }),
        supabase
          .from('clubs')
          .select('id, name, type, loft, custom_name, sort_order, carry_metres, carry_stddev_metres')
          .order('sort_order'),
      ]);
      if (cancelled) return;
      setShotLearningRows((shotsResult.data ?? []) as unknown as ShotLearningRow[]);
      const userClubs = userClubsResult.data ?? [];
      if (userClubs.length > 0) {
        setClubs(userClubs.map((club: any, index: number) => ({
          id: club.id,
          name: club.club_name,
          type: clubTypeFromName(club.club_name),
          loft: null,
          custom_name: null,
          sort_order: index,
          carry_metres: club.carry_distance_metres,
          carry_stddev_metres: null,
        })));
      } else {
        setClubs((globalClubsResult.data ?? []) as Club[]);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!activeRound?.round.course_id) return;
    Promise.all([
      supabase
        .from('hazards')
        .select('id, course_id, hole_number, hole_numbers, type, label, coordinates, created_at')
        .eq('course_id', activeRound.round.course_id),
      supabase
        .from('hole_zones')
        .select('zone_type, coordinates')
        .eq('course_id', activeRound.round.course_id)
        .eq('hole_number', activeRound.currentHoleNumber),
    ]).then(([hazardsResult, zonesResult]) => {
      setHazards((hazardsResult.data ?? []) as Hazard[]);
      setZones((zonesResult.data ?? []) as CaddieZone[]);
    });
  }, [activeRound?.currentHoleNumber, activeRound?.round.course_id]);

  useEffect(() => {
    if (!windData && effectiveLocation) {
      fetchWind(effectiveLocation.latitude, effectiveLocation.longitude).then(value => value && setWindData(value));
    }
  }, [effectiveLocation, windData]);

  useEffect(() => {
    let cancelled = false;
    setHoleHistory(null);
    if (!user?.id || !activeRound?.round.course_id || !hole) return undefined;
    fetchHoleHistory(user.id, activeRound.round.course_id, hole.number).then(value => {
      if (!cancelled) setHoleHistory(value);
    });
    return () => { cancelled = true; };
  }, [activeRound?.round.course_id, hole?.number, user?.id]);

  useEffect(() => {
    const sync = async () => {
      if (await syncQueuedHoleScores() > 0) setScoreSyncPending(false);
    };
    void sync();
    const interval = setInterval(sync, 15_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!effectiveLocation || !greenMid || learnedClubs.length === 0) return;
    if (caddieTimer.current) clearTimeout(caddieTimer.current);
    caddieTimer.current = setTimeout(() => {
      const advice = buildCaddieAdvice({
        playerPos: effectiveLocation,
        greenMid,
        hazards: holeHazards,
        clubs: learnedClubs,
        windSpeed: windData?.speed_kmh ?? 0,
        windDir: windData?.direction_deg ?? 0,
        windLabel: windData?.label ?? 'Calm',
        playerElevation: windData?.elevation_metres ?? 0,
        greenElevation: windData?.elevation_metres ?? 0,
        holeNumber: hole?.number,
        holePar: hole?.par,
        holeIndex: hole?.stroke_index,
        history: holeHistory,
        lie: playerLie,
        customTarget,
        clubMisses,
        fairwayCentreline,
      });
      setCaddieAdvice(addLearnedMissAdvice(advice, learning));
    }, 600);
    return () => {
      if (caddieTimer.current) clearTimeout(caddieTimer.current);
    };
  }, [
    greenMid?.latitude,
    greenMid?.longitude,
    hole?.number,
    holeHistory,
    learnedClubs,
    learning,
    effectiveLocation?.latitude,
    effectiveLocation?.longitude,
    customTarget,
    clubMisses,
    playerLie,
    windData,
    holeHazards,
    fairwayCentreline,
  ]);

  useEffect(() => {
    if (!hole || !mapRef.current || (!tee && !greenMid)) return;
    const start = tee ?? greenMid!;
    const finish = greenMid ?? tee!;
    const distance = haversineMetres(start, finish);
    mapRef.current.animateCamera({
      center: {
        latitude: start.latitude + (finish.latitude - start.latitude) * 0.42,
        longitude: start.longitude + (finish.longitude - start.longitude) * 0.42,
      },
      heading: bearingTo(start, finish),
      zoom: distance < 200 ? 18 : distance < 350 ? 17.5 : distance < 500 ? 17 : 16.5,
      pitch: 0,
    }, { duration: 700 });
  }, [hole?.number]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPendingShot(null);
    setCustomTarget(null);
    setSelectingTarget(false);
    setPlacingShotStart(false);
  }, [hole?.number]);

  const persistScore = useCallback(async (score: Partial<HoleScore>) => {
    if (!activeRound || !hole) return;
    const payload = {
      round_id: activeRound.round.id,
      hole_id: hole.id,
      hole_number: hole.number,
      gross_score: score.gross_score ?? null,
      fairway_hit: score.fairway_hit ?? 'na',
      gir: score.gir ?? null,
      gir_miss_direction: score.gir_miss_direction ?? 'na',
      putts: score.putts ?? 2,
      chips: score.chips ?? 0,
      sand_shots: score.sand_shots ?? 0,
      penalties: score.penalties ?? 0,
    };
    updateScore(hole.number, payload);
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

  const changeQuickScore = useCallback((change: number) => {
    if (!hole) return;
    void Haptics.selectionAsync();
    const next = Math.max(1, (currentScore?.gross_score ?? hole.par) + change);
    void persistScore({ ...currentScore, gross_score: next });
  }, [currentScore, hole, persistScore]);

  const goToHole = useCallback((direction: -1 | 1) => {
    if (!activeRound) return;
    const nextIndex = currentHoleIndex + direction;
    if (nextIndex < 0) return;
    if (nextIndex >= roundHoleNumbers.length) {
      navigation.navigate('EndRound');
      return;
    }
    // Clear caddie LLM state when changing holes
    setCaddieOpen(false);
    setCaddieLlmText(null);
    setCaddieLlmLoading(false);
    setCurrentHole(roundHoleNumbers[nextIndex]);
  }, [activeRound, currentHoleIndex, navigation, roundHoleNumbers, setCurrentHole]);

  const createPendingShot = useCallback((start: Coordinate, startLie: Lie) => {
    if (!location) return;
    const distanceMetres = haversineMetres(start, location);
    if (distanceMetres < 2) {
      Alert.alert(
        'Shot distance too short',
        'The start and current ball locations are almost the same. Adjust the start location or wait for a current GPS position.',
      );
      return;
    }
    setPendingShot({
      start,
      end: location,
      distanceMetres,
      startLie,
    });
  }, [location]);

  const handleAddShot = useCallback(() => {
    if (!location || locationStale) {
      Alert.alert('Waiting for GPS', 'A current GPS position is required to add the shot.');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const previousShot = holeShots[holeShots.length - 1];
    if (previousShot?.end_lat != null && previousShot.end_lng != null) {
      createPendingShot(
        { latitude: previousShot.end_lat, longitude: previousShot.end_lng },
        previousShot.end_lie ?? 'fairway',
      );
      return;
    }

    if (holeShots.length === 0 && tee) {
      createPendingShot(tee, 'tee');
      return;
    }

    Alert.alert(
      holeShots.length === 0 ? 'Tee location unavailable' : 'Previous ball location unavailable',
      holeShots.length === 0
        ? 'Place an approximate tee location on the map, then the app will measure the shot to your current position.'
        : 'Place the approximate location where the previous shot finished.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Place on map',
          onPress: () => {
            setSelectingTarget(false);
            setPlacingShotStart(true);
          },
        },
      ],
    );
  }, [createPendingShot, holeShots, location, locationStale, tee]);

  const saveShot = useCallback(async (value: ShotCaptureValue) => {
    if (!activeRound || !hole || !pendingShot || savingShot) return;
    setSavingShot(true);
    const shotNumber = holeShots.length + 1;
    const clubName = value.club.custom_name ?? value.club.name;
    const row = {
      round_id: activeRound.round.id,
      hole_id: hole.id,
      shot_number: shotNumber,
      start_lat: pendingShot.start.latitude,
      start_lng: pendingShot.start.longitude,
      end_lat: pendingShot.end.latitude,
      end_lng: pendingShot.end.longitude,
      distance_metres: Math.round(pendingShot.distanceMetres),
      club_id: null,
      club_name: clubName,
      lie: value.lie,
      end_lie: value.endLie,
      target_type: value.target,
      outcome: value.outcome,
      miss_direction: value.missDirection,
      strike_quality: value.strikeQuality,
    };
    const { data, error } = await supabase
      .from('shots')
      .insert(row)
      .select('id, created_at')
      .single();
    if (error) {
      setSavingShot(false);
      Alert.alert(
        'Shot not saved',
        error.message.includes('column')
          ? 'Apply the Phase 14 Supabase migration, then try again.'
          : error.message,
      );
      return;
    }
    const shot: Shot = {
      ...row,
      id: data.id,
      created_at: data.created_at,
      distance_metres: row.distance_metres,
    };
    addShot(hole.number, shot);
    setShotLearningRows(previous => [
      ...previous,
      {
        club_name: clubName,
        distance_metres: row.distance_metres,
        target_type: value.target,
        outcome: value.outcome,
        miss_direction: value.missDirection,
        strike_quality: value.strikeQuality,
      },
    ]);
    setPendingShot(null);
    setSavingShot(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [activeRound, addShot, hole, holeShots.length, pendingShot, savingShot]);

  const openCaddie = useCallback(async () => {
    if (!effectiveLocation || !greenMid || !hole || learnedClubs.length === 0) return;
    const [wind, greenElevation] = await Promise.all([
      fetchWind(effectiveLocation.latitude, effectiveLocation.longitude),
      fetchElevation(greenMid.latitude, greenMid.longitude),
    ]);
    const advice = addLearnedMissAdvice(buildCaddieAdvice({
      playerPos: effectiveLocation,
      greenMid,
      hazards: holeHazards,
      clubs: learnedClubs,
      windSpeed: wind?.speed_kmh ?? 0,
      windDir: wind?.direction_deg ?? 0,
      windLabel: wind?.label ?? 'Calm',
      playerElevation: wind?.elevation_metres ?? 0,
      greenElevation: greenElevation ?? wind?.elevation_metres ?? 0,
      holeNumber: hole.number,
      holePar: hole.par,
      holeIndex: hole.stroke_index,
      history: holeHistory,
      lie: playerLie,
      customTarget,
      clubMisses,
      fairwayCentreline,
    }), learning);
    if (advice) {
      setCaddieAdvice(advice);
      setCaddieLlmText(null);
      setCaddieLlmLoading(true);
      setCaddieOpen(true);
      // Fire LLM read in background — panel shows spinner until it resolves
      const { system, userMessage } = buildCaddiePrompt(
        advice,
        activeRound?.course.name ?? 'the course',
      );
      supabase.functions
        .invoke('golf-coach', { body: { system, userMessage } })
        .then(({ data, error }) => {
          if (!error && typeof data?.text === 'string' && data.text.trim().length > 0) {
            setCaddieLlmText(validatedCaddieFactor(data.text, advice));
          }
        })
        .catch(() => { /* fall back to deterministic lines */ })
        .finally(() => setCaddieLlmLoading(false));
    }
  }, [activeRound?.course.name, clubMisses, customTarget, effectiveLocation, fairwayCentreline, greenMid, hole, holeHazards, holeHistory, learnedClubs, learning, playerLie]);

  if (!activeRound || !hole) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No active round</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Main')}>
          <Text style={styles.emptyLink}>Go to Play</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const recommendedClub = caddieAdvice
    ? caddieAdvice.recommended.club.custom_name ?? caddieAdvice.recommended.club.name
    : null;
  const learnedNote = recommendedClub ? learningNote(recommendedClub, learning) : null;
  const needsRecoveryTarget = caddieAdvice?.shotType === 'recovery' && !customTarget;
  const distanceDisplay = (value: number | null) => (
    value == null ? '-' : convertDistance(value, units)
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        mapType="satellite"
        initialRegion={{
          ...mapFallback,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        rotateEnabled
        onPress={event => {
          if (placingShotStart) {
            createPendingShot(
              event.nativeEvent.coordinate,
              holeShots.length === 0 ? 'tee' : 'fairway',
            );
            setPlacingShotStart(false);
            return;
          }
          if (!selectingTarget) return;
          setCustomTarget(event.nativeEvent.coordinate);
          setSelectingTarget(false);
          setCaddieLlmText(null);
        }}
      >
        {tee && (
          <Marker coordinate={tee}>
            <View style={styles.teeMarker}><Text style={styles.markerText}>T</Text></View>
          </Marker>
        )}
        {greenMid && (
          <Marker coordinate={greenMid}>
            <View style={styles.greenMarker}><Text style={styles.flag}>⚑</Text></View>
          </Marker>
        )}
        {effectiveLocation && greenMid && !needsRecoveryTarget && (
          <>
            <Polyline
              coordinates={[effectiveLocation, caddieAdvice?.target ?? greenMid]}
              strokeColor={caddieAdvice ? Colors.green : 'rgba(255,255,255,0.55)'}
              strokeWidth={caddieAdvice ? 4 : 2}
            />
            {caddieAdvice && (
              <>
                <Polyline
                  coordinates={[caddieAdvice.target, greenMid]}
                  strokeColor="rgba(255,255,255,0.65)"
                  strokeWidth={2}
                  lineDashPattern={[8, 6]}
                />
                <Marker coordinate={caddieAdvice.target}>
                  <View style={styles.caddieTarget}>
                    <View style={styles.caddieTargetInner} />
                    <Text style={styles.caddieTargetText}>
                      {convertDistance(caddieAdvice.targetDistance, units)}
                      {distanceUnitLabel(units, true)}
                    </Text>
                  </View>
                </Marker>
              </>
            )}
          </>
        )}
        {holeHazards.map(hazard => (
          <Polygon
            key={hazard.id}
            coordinates={hazard.coordinates.map(point => ({
              latitude: point.lat,
              longitude: point.lng,
            }))}
            fillColor={`${HAZARD_COLORS[hazard.type]}44`}
            strokeColor={HAZARD_COLORS[hazard.type]}
            strokeWidth={2}
            lineDashPattern={hazard.type === 'ob' ? [8, 5] : undefined}
          />
        ))}
        {holeShots.map(shot => (
          <React.Fragment key={shot.id}>
            {shot.end_lat != null && shot.end_lng != null && (
              <>
                <Polyline
                  coordinates={[
                    { latitude: shot.start_lat, longitude: shot.start_lng },
                    { latitude: shot.end_lat, longitude: shot.end_lng },
                  ]}
                  strokeColor={Colors.yellow}
                  strokeWidth={3}
                />
                <Marker coordinate={{ latitude: shot.end_lat, longitude: shot.end_lng }}>
                  <View style={styles.shotMarker}>
                    <Text style={styles.shotMarkerText}>{shot.shot_number}</Text>
                  </View>
                </Marker>
              </>
            )}
          </React.Fragment>
        ))}
        {customTarget && !caddieAdvice && (
          <Marker coordinate={customTarget}>
            <View style={styles.customTargetMarker}>
              <Text style={styles.customTargetMarkerText}>TARGET</Text>
            </View>
          </Marker>
        )}
      </MapView>

      <View style={[styles.topOverlay, { top: insets.top + Spacing.sm }]}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.roundButton, currentHoleIndex <= 0 && styles.disabled]}
            disabled={currentHoleIndex <= 0}
            onPress={() => goToHole(-1)}
          >
            <Text style={styles.roundButtonText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.holeInfo}>
            <Text style={styles.holeTitle}>HOLE {hole.number}</Text>
            <Text style={styles.holeMeta}>PAR {hole.par}  ·  SI {hole.stroke_index}</Text>
          </View>
          <View style={styles.roundScore}>
            <Text style={styles.roundScoreValue}>{scoreLabel(cumulativeDiff)}</Text>
            <Text style={styles.roundScoreLabel}>ROUND</Text>
          </View>
          <TouchableOpacity style={styles.roundButton} onPress={() => goToHole(1)}>
            <Text style={styles.roundButtonText}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exit}
            onPress={() => Alert.alert('Exit round', 'Go to the round summary?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Summary', onPress: () => navigation.navigate('EndRound') },
            ])}
          >
            <Text style={styles.exitText}>X</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.distancePill}>
          <View style={styles.distanceItem}>
            <Text style={styles.distanceLabel}>F</Text>
            <Text style={styles.distanceValue}>{distanceDisplay(frontDistance)}</Text>
          </View>
          <View style={styles.distanceMain}>
            <Text style={styles.distanceLabelGreen}>MIDDLE</Text>
            <Text style={styles.distanceMainValue}>
              {distanceDisplay(midDistance ?? hole.white_metres)}
            </Text>
            <Text style={styles.distanceUnit}>{distanceUnitLabel(units)}</Text>
          </View>
          <View style={styles.distanceItem}>
            <Text style={styles.distanceLabel}>B</Text>
            <Text style={styles.distanceValue}>{distanceDisplay(backDistance)}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.caddiePill} onPress={openCaddie}>
          <View style={styles.caddieCopy}>
            <Text style={styles.caddieLabel}>CADDIE</Text>
            <Text style={styles.caddieText} numberOfLines={1}>
              {caddieAdvice
                ? caddieAdvice.shotType === 'recovery'
                  ? customTarget
                    ? `${recommendedClub} · recovery target ${convertDistance(caddieAdvice.targetDistance, units)}${distanceUnitLabel(units, true)}`
                    : 'Recovery required · choose a visible target'
                  : caddieAdvice.shotType === 'layup'
                  ? `${recommendedClub} · target ${convertDistance(caddieAdvice.targetDistance, units)}${distanceUnitLabel(units, true)} · ${convertDistance(caddieAdvice.remainingDistance, units)} left`
                  : `${recommendedClub} · play ${convertDistance(caddieAdvice.playingDistance, units)}${distanceUnitLabel(units, true)}`
                : effectiveLocation ? 'Calculating recommendation...' : 'Waiting for GPS...'}
            </Text>
            {learnedNote && <Text style={styles.learnedText} numberOfLines={1}>{learnedNote}</Text>}
            <Text style={styles.lieText}>{playerLie.toUpperCase()} LIE</Text>
          </View>
          <Text style={styles.more}>MORE ›</Text>
        </TouchableOpacity>
        <View style={styles.targetActions}>
          <TouchableOpacity
            style={[styles.targetAction, selectingTarget && styles.targetActionActive]}
            onPress={() => setSelectingTarget(current => !current)}
          >
            <Text style={styles.targetActionText}>
              {selectingTarget ? 'TAP MAP FOR TARGET' : 'CHOOSE TARGET'}
            </Text>
          </TouchableOpacity>
          {customTarget && (
            <TouchableOpacity
              style={styles.targetAction}
              onPress={() => {
                setCustomTarget(null);
                setSelectingTarget(false);
                setCaddieLlmText(null);
              }}
            >
              <Text style={styles.targetActionText}>USE CADDIE TARGET</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {(locationStale || locationError) && (
        <View style={[styles.gpsWarning, { top: insets.top + 190 }]}>
          <Text style={styles.gpsWarningText}>
            {locationError ? 'GPS unavailable' : 'GPS signal is stale'}
          </Text>
        </View>
      )}

      {placingShotStart && (
        <View style={[styles.shotStartPrompt, { top: insets.top + 190 }]}>
          <Text style={styles.shotStartPromptText}>
            Tap the map where this shot started
          </Text>
          <TouchableOpacity onPress={() => setPlacingShotStart(false)}>
            <Text style={styles.cancelTracking}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.bottomDock, { bottom: insets.bottom + Spacing.sm }]}>
        <TouchableOpacity
          style={styles.trackButton}
          onPress={handleAddShot}
        >
          <Text style={styles.trackButtonText}>+ ADD SHOT</Text>
          <Text style={styles.trackButtonSub}>
            {holeShots.length === 0
              ? 'Measured from the tee to your current ball'
              : `Measured from shot ${holeShots.length}'s finish`}
          </Text>
        </TouchableOpacity>

        <View style={styles.scoreRow}>
          <TouchableOpacity style={styles.scoreAdjust} onPress={() => changeQuickScore(-1)}>
            <Text style={styles.scoreAdjustText}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.scoreCard} onPress={() => setScoringOpen(true)}>
            <Text style={styles.scoreCaption}>SCORE</Text>
            <Text style={styles.scoreValue}>{currentScore?.gross_score ?? hole.par}</Text>
            <Text style={styles.scoreDetail}>
              {scoreSyncPending ? 'SAVED OFFLINE' : `${currentScore?.putts ?? 2} PUTTS · DETAILS`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.scoreAdjust} onPress={() => changeQuickScore(1)}>
            <Text style={styles.scoreAdjustText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nextButton} onPress={() => goToHole(1)}>
            <Text style={styles.nextButtonText}>
              {currentHoleIndex === roundHoleNumbers.length - 1 ? 'FINISH' : 'NEXT'}
            </Text>
            <Text style={styles.nextArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ShotCaptureSheet
        visible={pendingShot != null}
        clubs={clubs.filter(club => club.type !== 'putter')}
        distanceMetres={pendingShot?.distanceMetres ?? 0}
        shotNumber={holeShots.length + 1}
        initialLie={pendingShot?.startLie ?? (holeShots.length === 0 ? 'tee' : 'fairway')}
        units={units}
        onCancel={() => {
          setPendingShot(null);
        }}
        onSave={saveShot}
      />

      <HoleScoringSheet
        visible={scoringOpen}
        onClose={() => setScoringOpen(false)}
        hole={hole}
        initialScore={currentScore}
        shots={holeShots}
        onSave={score => {
          void persistScore(score);
          setScoringOpen(false);
        }}
        onSaveAndNext={score => {
          void persistScore(score);
          setScoringOpen(false);
          goToHole(1);
        }}
      />

      {caddieAdvice && caddieOpen && (
        <View style={[StyleSheet.absoluteFill, styles.caddieModal]}>
          <View style={styles.caddieModalInner}>
            <CaddiePanel
              advice={caddieAdvice}
              units={units}
              onDismiss={() => setCaddieOpen(false)}
              llmText={caddieLlmText}
              llmLoading={caddieLlmLoading}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  emptyText: { color: Colors.textSecondary, fontFamily: Font.regular },
  emptyLink: { marginTop: Spacing.md, color: Colors.green, fontFamily: Font.bold },
  topOverlay: { position: 'absolute', left: Spacing.sm, right: Spacing.sm, gap: Spacing.sm },
  topBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.mapOverlay,
    ...Shadow.card,
  },
  roundButton: {
    width: 34,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonText: { color: Colors.text, fontSize: 32, lineHeight: 34 },
  disabled: { opacity: 0.25 },
  holeInfo: { flex: 1 },
  holeTitle: { color: Colors.text, fontFamily: Font.black, fontSize: FontSize.md },
  holeMeta: { color: Colors.textMuted, fontFamily: Font.medium, fontSize: FontSize.xs },
  roundScore: { alignItems: 'center', paddingHorizontal: Spacing.sm },
  roundScoreValue: { color: Colors.green, fontFamily: Font.black, fontSize: FontSize.lg },
  roundScoreLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: 8 },
  exit: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface3,
  },
  exitText: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs },
  distancePill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.mapOverlay,
    ...Shadow.card,
  },
  distanceItem: { minWidth: 54, alignItems: 'center' },
  distanceLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs },
  distanceValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.md },
  distanceMain: {
    minWidth: 100,
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
  },
  distanceLabelGreen: { color: Colors.green, fontFamily: Font.bold, fontSize: 9 },
  distanceMainValue: { color: Colors.green, fontFamily: Font.black, fontSize: 34, lineHeight: 36 },
  distanceUnit: { color: Colors.textMuted, fontFamily: Font.medium, fontSize: 9 },
  caddiePill: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.mapOverlay,
    ...Shadow.card,
  },
  caddieCopy: { flex: 1 },
  caddieLabel: { color: Colors.green, fontFamily: Font.bold, fontSize: 9, letterSpacing: 1 },
  caddieText: { color: Colors.text, fontFamily: Font.semibold, fontSize: FontSize.sm },
  learnedText: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: 9 },
  lieText: { marginTop: 2, color: Colors.yellow, fontFamily: Font.bold, fontSize: 8 },
  more: { color: Colors.green, fontFamily: Font.bold, fontSize: FontSize.xs },
  targetActions: { flexDirection: 'row', gap: Spacing.sm },
  targetAction: {
    flex: 1,
    alignItems: 'center',
    borderRadius: Radius.full,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.mapOverlay,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  targetActionActive: { borderColor: Colors.yellow, backgroundColor: Colors.surface3 },
  targetActionText: { color: Colors.text, fontFamily: Font.bold, fontSize: 9 },
  gpsWarning: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.redMuted,
  },
  gpsWarningText: { color: Colors.red, fontFamily: Font.bold, fontSize: FontSize.xs },
  shotStartPrompt: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.mapOverlay,
    borderWidth: 1,
    borderColor: Colors.yellow,
    ...Shadow.card,
  },
  shotStartPromptText: {
    color: Colors.text,
    fontFamily: Font.bold,
    fontSize: FontSize.xs,
  },
  bottomDock: { position: 'absolute', left: Spacing.sm, right: Spacing.sm, gap: Spacing.sm },
  cancelTracking: { color: Colors.red, fontFamily: Font.bold, fontSize: FontSize.xs },
  trackButton: {
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: Colors.green,
    ...Shadow.card,
  },
  trackButtonText: { color: Colors.bg, fontFamily: Font.black, fontSize: FontSize.md },
  trackButtonSub: { color: Colors.bg, opacity: 0.7, fontFamily: Font.medium, fontSize: FontSize.xs },
  scoreRow: { flexDirection: 'row', gap: Spacing.sm, minHeight: 68 },
  scoreAdjust: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: Colors.mapOverlayLight,
  },
  scoreAdjustText: { color: Colors.text, fontFamily: Font.bold, fontSize: 30 },
  scoreCard: {
    width: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: Colors.mapOverlayLight,
  },
  scoreCaption: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: 8 },
  scoreValue: { color: Colors.text, fontFamily: Font.black, fontSize: 30, lineHeight: 32 },
  scoreDetail: { color: Colors.green, fontFamily: Font.bold, fontSize: 8 },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: Colors.mapOverlayLight,
  },
  nextButtonText: { color: Colors.text, fontFamily: Font.black, fontSize: FontSize.base },
  nextArrow: { marginLeft: Spacing.sm, color: Colors.green, fontSize: 30 },
  teeMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.text,
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  markerText: { color: Colors.bg, fontFamily: Font.black, fontSize: FontSize.xs },
  greenMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.green,
    borderWidth: 2,
    borderColor: Colors.text,
  },
  flag: { color: Colors.bg, fontSize: 18 },
  shotMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.yellow,
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  shotMarkerText: { color: Colors.bg, fontFamily: Font.black, fontSize: FontSize.xs },
  caddieTarget: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.text,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  caddieTargetInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.green,
    borderWidth: 2,
    borderColor: Colors.text,
  },
  caddieTargetText: {
    marginTop: 2,
    color: Colors.text,
    fontFamily: Font.black,
    fontSize: 10,
  },
  customTargetMarker: {
    minWidth: 62,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: Colors.yellow,
    borderWidth: 2,
    borderColor: Colors.text,
  },
  customTargetMarkerText: { color: Colors.bg, fontFamily: Font.black, fontSize: 9 },
  caddieModal: { justifyContent: 'flex-end', backgroundColor: Colors.backdrop },
  caddieModalInner: { maxHeight: '88%' },
});
