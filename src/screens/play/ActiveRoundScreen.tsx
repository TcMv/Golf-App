import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useRound } from '../../context/RoundContext';
import { useLocation } from '../../hooks/useLocation';
import { haversineMetres } from '../../utils/distance';
import { fetchWind } from '../../utils/wind';
import { buildCaddieAdvice } from '../../utils/caddie';
import type { CaddieAdvice } from '../../utils/caddie';
import CaddiePanel from '../../components/caddie/CaddiePanel';
import HoleScoringSheet from '../../components/scoring/HoleScoringSheet';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Club, Coordinate, Hazard, HazardType, Hole, HoleScore, Shot } from '../../types';

const HAZARD_COLORS: Record<HazardType, string> = {
  bunker: '#F5C518',
  water: '#4A90D9',
  trees: '#2D6A2D',
  ob: '#FFFFFF',
  red_zone: '#E53E3E',
};

type RootStackParamList = {
  PlayHome: undefined;
  StartRound: undefined;
  ActiveRound: undefined;
  EndRound: undefined;
  RoundDetail: { roundId: string };
};
type Nav = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_W } = Dimensions.get('window');

function bearingTo(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const r = Math.PI / 180;
  const dLon = (toLng - fromLng) * r;
  const lat1 = fromLat * r;
  const lat2 = toLat * r;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

type ShotStatus = 'idle' | 'tracking' | 'selecting_club';

function DistancePill({ front, mid, back }: { front: number | null; mid: number | null; back: number | null }) {
  if (!mid) return null;
  return (
    <View style={styles.distancePill}>
      {front !== null && (
        <View style={styles.distItem}>
          <Text style={styles.distLabel}>F</Text>
          <Text style={styles.distValue}>{front}</Text>
        </View>
      )}
      <View style={[styles.distItem, styles.distMidItem]}>
        <Text style={[styles.distLabel, { color: Colors.green }]}>M</Text>
        <Text style={[styles.distValue, styles.distMidValue]}>{mid}</Text>
      </View>
      {back !== null && (
        <View style={styles.distItem}>
          <Text style={styles.distLabel}>B</Text>
          <Text style={styles.distValue}>{back}</Text>
        </View>
      )}
    </View>
  );
}

function ClubSelectModal({
  visible,
  clubs,
  distance,
  onSelect,
  onCancel,
}: {
  visible: boolean;
  clubs: Club[];
  distance: number;
  onSelect: (clubId: string) => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.clubModalBackdrop}>
        <View style={styles.clubModal}>
          <View style={styles.clubModalHeader}>
            <Text style={styles.clubModalTitle}>Select Club</Text>
            <Text style={styles.clubModalDistance}>{distance}m shot</Text>
          </View>
          <FlatList
            data={clubs}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.clubRow}
                onPress={() => onSelect(item.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.clubName}>{item.custom_name ?? item.name}</Text>
                <Text style={styles.clubType}>{item.type}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.clubDivider} />}
            style={{ maxHeight: 360 }}
          />
          <TouchableOpacity style={styles.clubCancelBtn} onPress={onCancel}>
            <Text style={styles.clubCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function ActiveRoundScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { activeRound, updateScore, addShot, setCurrentHole, endRound } = useRound();
  const { location } = useLocation();
  const mapRef = useRef<MapView>(null);

  const [scoringVisible, setScoringVisible] = useState(false);
  const [shotStatus, setShotStatus] = useState<ShotStatus>('idle');
  const [trackingStart, setTrackingStart] = useState<Coordinate | null>(null);
  const [pendingShotDistance, setPendingShotDistance] = useState(0);
  const [pendingShotEnd, setPendingShotEnd] = useState<Coordinate | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubModalVisible, setClubModalVisible] = useState(false);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [caddieAdvice, setCaddieAdvice] = useState<CaddieAdvice | null>(null);

  useEffect(() => {
    supabase.from('clubs').select('*').order('sort_order').then(({ data }) => {
      if (data) setClubs(data as Club[]);
    });
    supabase.from('hazards').select('*').eq('course_id', '00000000-0000-0000-0000-000000000001').then(({ data }) => {
      if (data) setHazards(data as Hazard[]);
    });
  }, []);

  const hole = useMemo((): Hole | null => {
    if (!activeRound) return null;
    return activeRound.holes.find((h) => h.number === activeRound.currentHoleNumber) ?? null;
  }, [activeRound]);

  const currentScore = activeRound?.scores[activeRound.currentHoleNumber] ?? null;
  const holeShots = activeRound?.shots[activeRound.currentHoleNumber] ?? [];

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
    return haversineMetres(location, greenMid);
  }, [location, greenMid]);

  const distToFront = useMemo(() => {
    if (!location || !greenFront) return null;
    return haversineMetres(location, greenFront);
  }, [location, greenFront]);

  const distToBack = useMemo(() => {
    if (!location || !greenBack) return null;
    return haversineMetres(location, greenBack);
  }, [location, greenBack]);

  const staticDist = hole?.white_metres ?? null;

  // Fly to tee oriented toward green whenever the hole changes
  useEffect(() => {
    if (!hole || !mapRef.current) return;
    const hasTee = hole.tee_lat != null && hole.tee_lng != null;
    const hasGreen = hole.green_mid_lat != null && hole.green_mid_lng != null;
    if (!hasTee && !hasGreen) return;

    const teeLat = hasTee ? hole.tee_lat! : hole.green_mid_lat!;
    const teeLng = hasTee ? hole.tee_lng! : hole.green_mid_lng!;
    const greenLat = hasGreen ? hole.green_mid_lat! : teeLat;
    const greenLng = hasGreen ? hole.green_mid_lng! : teeLng;

    const heading = hasTee && hasGreen ? bearingTo(teeLat, teeLng, greenLat, greenLng) : 0;

    // Place camera 35% of the way from tee toward green so tee is near bottom
    const centerLat = teeLat + (greenLat - teeLat) * 0.35;
    const centerLng = teeLng + (greenLng - teeLng) * 0.35;

    const distM = hasTee && hasGreen
      ? haversineMetres({ latitude: teeLat, longitude: teeLng }, { latitude: greenLat, longitude: greenLng })
      : 300;
    const zoom = distM < 200 ? 18 : distM < 350 ? 17.5 : distM < 500 ? 17 : 16.5;

    mapRef.current.animateCamera(
      { center: { latitude: centerLat, longitude: centerLng }, heading, zoom, pitch: 0 },
      { duration: 800 },
    );
  }, [hole?.number]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCaddie = useCallback(async () => {
    if (!location || !greenMid) return;
    const wind = await fetchWind(location.latitude, location.longitude);
    const advice = buildCaddieAdvice({
      playerPos: location,
      greenMid,
      hazards,
      clubs,
      windSpeed: wind?.speed_kmh ?? 0,
      windDir: wind?.direction_deg ?? 0,
      windLabel: wind?.label ?? 'Calm',
    });
    setCaddieAdvice(advice);
  }, [location, greenMid, hazards, clubs]);

  const goToPrevHole = useCallback(() => {
    if (!activeRound || activeRound.currentHoleNumber <= 1) return;
    setCurrentHole(activeRound.currentHoleNumber - 1);
    setScoringVisible(false);
    setShotStatus('idle');
    setCaddieAdvice(null);
  }, [activeRound, setCurrentHole]);

  const goToNextHole = useCallback(() => {
    if (!activeRound) return;
    const maxHole = activeRound.round.holes_played === 9
      ? activeRound.round.starting_hole! + 8
      : 18;
    if (activeRound.currentHoleNumber >= maxHole) {
      navigation.navigate('EndRound');
      return;
    }
    setCurrentHole(activeRound.currentHoleNumber + 1);
    setScoringVisible(false);
    setShotStatus('idle');
    setCaddieAdvice(null);
  }, [activeRound, setCurrentHole, navigation]);

  const handleSaveScore = useCallback((score: Partial<HoleScore>) => {
    if (!activeRound) return;
    updateScore(activeRound.currentHoleNumber, score);
    setScoringVisible(false);
  }, [activeRound, updateScore]);

  const handleSaveAndNext = useCallback((score: Partial<HoleScore>) => {
    if (!activeRound) return;
    updateScore(activeRound.currentHoleNumber, score);
    setScoringVisible(false);
    goToNextHole();
  }, [activeRound, updateScore, goToNextHole]);

  const handleTrackShot = useCallback(() => {
    if (!location) {
      Alert.alert('No GPS', 'Waiting for GPS signal...');
      return;
    }
    setTrackingStart(location);
    setShotStatus('tracking');
  }, [location]);

  const handleSaveShot = useCallback(() => {
    if (!location || !trackingStart) return;
    const dist = haversineMetres(trackingStart, location);
    setPendingShotDistance(dist);
    setPendingShotEnd(location);
    setShotStatus('selecting_club');
    setClubModalVisible(true);
  }, [location, trackingStart]);

  const handleClubSelected = useCallback(async (clubId: string) => {
    if (!activeRound || !hole || !trackingStart || !pendingShotEnd) return;
    setClubModalVisible(false);

    const shotNumber = holeShots.length + 1;
    const newShot: Shot = {
      id: `temp-${Date.now()}`,
      round_id: activeRound.round.id,
      hole_id: hole.id,
      shot_number: shotNumber,
      start_lat: trackingStart.latitude,
      start_lng: trackingStart.longitude,
      end_lat: pendingShotEnd.latitude,
      end_lng: pendingShotEnd.longitude,
      distance_metres: pendingShotDistance,
      club_id: clubId,
      lie: shotNumber === 1 ? 'tee' : 'fairway',
      created_at: new Date().toISOString(),
    };

    addShot(activeRound.currentHoleNumber, newShot);

    await supabase.from('shots').insert({
      round_id: activeRound.round.id,
      hole_id: hole.id,
      shot_number: shotNumber,
      start_lat: trackingStart.latitude,
      start_lng: trackingStart.longitude,
      end_lat: pendingShotEnd.latitude,
      end_lng: pendingShotEnd.longitude,
      distance_metres: pendingShotDistance,
      club_id: clubId,
      lie: newShot.lie,
    });

    setShotStatus('idle');
    setTrackingStart(null);
    setPendingShotEnd(null);
  }, [activeRound, hole, trackingStart, pendingShotEnd, pendingShotDistance, holeShots.length, addShot]);

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

  const toPar = currentScore?.gross_score != null
    ? currentScore.gross_score - hole.par
    : null;

  const toParLabel = toPar === null ? '-'
    : toPar === 0 ? 'E'
    : toPar > 0 ? `+${toPar}`
    : `${toPar}`;

  const cumulativeToPar = activeRound.holes.reduce((acc, h) => {
    const s = activeRound.scores[h.number];
    if (s?.gross_score != null) return acc + s.gross_score - h.par;
    return acc;
  }, 0);

  const cumulativeLabel = cumulativeToPar === 0 ? 'E'
    : cumulativeToPar > 0 ? `+${cumulativeToPar}`
    : `${cumulativeToPar}`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Full-screen satellite map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
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
        showsCompass
        rotateEnabled
      >
        {/* Green mid marker */}
        {greenMid && (
          <Marker coordinate={greenMid} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.flagMarker}>
              <Text style={styles.flagEmoji}>⛳</Text>
            </View>
          </Marker>
        )}

        {/* Line from user to green */}
        {location && greenMid && (
          <Polyline
            coordinates={[location, greenMid]}
            strokeColor="rgba(255,255,255,0.6)"
            strokeWidth={2}
            lineDashPattern={[8, 6]}
          />
        )}

        {/* Shot start pin */}
        {trackingStart && (
          <Marker coordinate={trackingStart} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.startPin} />
          </Marker>
        )}

        {/* Hazard polygons — course-wide (OB) + current hole */}
        {hazards
          .filter(h => {
            const noRestriction = h.hole_number == null && (!h.hole_numbers || h.hole_numbers.length === 0);
            return noRestriction ||
              h.hole_number === activeRound.currentHoleNumber ||
              h.hole_numbers?.includes(activeRound.currentHoleNumber);
          })
          .map(hazard => (
            <Polygon
              key={hazard.id}
              coordinates={hazard.coordinates.map(c => ({ latitude: c.lat, longitude: c.lng }))}
              fillColor={HAZARD_COLORS[hazard.type] + (hazard.type === 'ob' ? '00' : '44')}
              strokeColor={HAZARD_COLORS[hazard.type]}
              strokeWidth={hazard.type === 'ob' ? 2 : 1.5}
              lineDashPattern={hazard.type === 'ob' ? [8, 5] : undefined}
            />
          ))}

        {/* Shot markers */}
        {holeShots.map((shot, idx) => (
          <React.Fragment key={shot.id}>
            {shot.end_lat && shot.end_lng && (
              <>
                <Polyline
                  coordinates={[
                    { latitude: shot.start_lat, longitude: shot.start_lng },
                    { latitude: shot.end_lat, longitude: shot.end_lng },
                  ]}
                  strokeColor={Colors.yellow}
                  strokeWidth={2}
                />
                <Marker
                  coordinate={{ latitude: shot.end_lat, longitude: shot.end_lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={styles.shotMarker}>
                    <Text style={styles.shotMarkerText}>{idx + 1}</Text>
                  </View>
                </Marker>
              </>
            )}
          </React.Fragment>
        ))}
      </MapView>

      {/* TOP bar — hole info + distances */}
      <View style={[styles.topBar, { top: insets.top + Spacing.sm }]}>
        <TouchableOpacity style={styles.holeNavBtn} onPress={goToPrevHole} activeOpacity={0.8}>
          <Text style={styles.holeNavText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <Text style={styles.holeNumber}>Hole {hole.number}</Text>
          <View style={styles.holeMetaRow}>
            <Text style={styles.holeMeta}>Par {hole.par}</Text>
            <Text style={styles.holeMetaDot}>·</Text>
            <Text style={styles.holeMeta}>{hole.white_metres ?? '—'}m</Text>
            <Text style={styles.holeMetaDot}>·</Text>
            <Text style={styles.holeMeta}>SI {hole.stroke_index}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.holeNavBtn} onPress={goToNextHole} activeOpacity={0.8}>
          <Text style={styles.holeNavText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Distance pill — GPS distances or static fallback */}
      {greenMid ? (
        <View style={[styles.distancePillWrapper, { top: insets.top + 90 }]}>
          <DistancePill
            front={distToFront}
            mid={distToMid}
            back={distToBack}
          />
        </View>
      ) : staticDist ? (
        <View style={[styles.distancePillWrapper, { top: insets.top + 90 }]}>
          <View style={styles.staticDistPill}>
            <Text style={styles.staticDistLabel}>Hole length</Text>
            <Text style={styles.staticDistValue}>{staticDist}m</Text>
            <Text style={styles.staticDistNote}>GPS walk needed for live distances</Text>
          </View>
        </View>
      ) : null}

      {/* Shot tracking status pill */}
      {shotStatus === 'tracking' && (
        <View style={[styles.trackingPill, { top: insets.top + 150 }]}>
          <View style={styles.trackingDot} />
          <Text style={styles.trackingText}>Walking to ball…</Text>
        </View>
      )}

      {/* BOTTOM action bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        {/* Score display */}
        <View style={styles.scoreDisplay}>
          <Text style={styles.scoreDisplayLabel}>H{hole.number}</Text>
          <Text style={styles.scoreDisplayValue}>
            {currentScore?.gross_score ?? '-'}
          </Text>
          {toPar !== null && (
            <Text style={[
              styles.toParChip,
              { color: toPar < 0 ? Colors.birdie : toPar === 0 ? Colors.scorePar : toPar === 1 ? Colors.bogey : Colors.doublePlus }
            ]}>
              {toParLabel}
            </Text>
          )}
        </View>

        {/* Track Shot button */}
        {shotStatus === 'idle' ? (
          <TouchableOpacity style={styles.trackBtn} onPress={handleTrackShot} activeOpacity={0.8}>
            <Text style={styles.trackBtnText}>📍 Track Shot</Text>
          </TouchableOpacity>
        ) : shotStatus === 'tracking' ? (
          <TouchableOpacity style={[styles.trackBtn, styles.trackBtnActive]} onPress={handleSaveShot} activeOpacity={0.8}>
            <Text style={styles.trackBtnText}>💾 Save Shot</Text>
          </TouchableOpacity>
        ) : null}

        {/* Caddie button */}
        <TouchableOpacity
          style={styles.caddieBtn}
          onPress={handleCaddie}
          activeOpacity={0.8}
        >
          <Text style={styles.caddieBtnText}>🎙 Caddie</Text>
        </TouchableOpacity>

        {/* Enter Score button */}
        <TouchableOpacity
          style={styles.scoreBtn}
          onPress={() => setScoringVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.scoreBtnText}>⛳ Score</Text>
        </TouchableOpacity>
      </View>

      {/* Caddie pop-up */}
      {caddieAdvice && (
        <View style={[styles.caddiePanelWrapper, { bottom: insets.bottom + 90 }]}>
          <CaddiePanel
            advice={caddieAdvice}
            onDismiss={() => setCaddieAdvice(null)}
          />
        </View>
      )}

      {/* Cumulative score pill */}
      <View style={[styles.cumulativePill, { bottom: insets.bottom + 80 }]}>
        <Text style={styles.cumulativeText}>Round: {cumulativeLabel}</Text>
      </View>

      {/* Hole notes button */}
      {hole.notes && (
        <TouchableOpacity
          style={[styles.notesBtn, { bottom: insets.bottom + 80, right: Spacing.base }]}
          onPress={() => Alert.alert(`Hole ${hole.number}`, hole.notes!)}
          activeOpacity={0.8}
        >
          <Text style={styles.notesBtnText}>ℹ</Text>
        </TouchableOpacity>
      )}

      {/* Scoring sheet */}
      <HoleScoringSheet
        visible={scoringVisible}
        onClose={() => setScoringVisible(false)}
        hole={hole}
        initialScore={currentScore ?? undefined}
        onSave={handleSaveScore}
        onSaveAndNext={handleSaveAndNext}
      />

      {/* Club select modal */}
      <ClubSelectModal
        visible={clubModalVisible}
        clubs={clubs}
        distance={pendingShotDistance}
        onSelect={handleClubSelected}
        onCancel={() => { setClubModalVisible(false); setShotStatus('idle'); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  noRound: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', gap: Spacing.base },
  noRoundText: { fontSize: FontSize.md, color: Colors.textSecondary },
  noRoundLink: { fontSize: FontSize.base, color: Colors.green, fontWeight: FontWeight.semibold },

  // Top bar
  topBar: {
    position: 'absolute',
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  holeNavBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holeNavText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text },
  topCenter: { flex: 1, alignItems: 'center' },
  holeNumber: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  holeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: 1 },
  holeMeta: { fontSize: FontSize.xs, color: Colors.textSecondary },
  holeMetaDot: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Distance pill
  distancePillWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  distancePill: {
    flexDirection: 'row',
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
    gap: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
  },
  distItem: { alignItems: 'center', minWidth: 44 },
  distMidItem: {},
  distLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium, marginBottom: 1 },
  distValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  distMidValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.text },

  staticDistPill: {
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  staticDistLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  staticDistValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.text },
  staticDistNote: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  // Tracking
  trackingPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.yellow,
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.yellow,
  },
  trackingText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.yellow },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.mapOverlay,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderStrong,
  },
  scoreDisplay: {
    alignItems: 'center',
    backgroundColor: Colors.surface2,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 52,
  },
  scoreDisplayLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  scoreDisplayValue: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: Colors.text },
  toParChip: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  trackBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackBtnActive: {
    borderColor: Colors.yellow,
    backgroundColor: 'rgba(251,191,36,0.12)',
  },
  trackBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  caddieBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caddieBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.green },
  caddiePanelWrapper: {
    position: 'absolute',
    left: Spacing.base,
    right: Spacing.base,
  },
  scoreBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#000' },

  cumulativePill: {
    position: 'absolute',
    left: Spacing.base,
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radius.full,
    paddingVertical: 4,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cumulativeText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.text },

  notesBtn: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.mapOverlay,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesBtnText: { fontSize: FontSize.base },

  // Map markers
  flagMarker: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.mapOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.green,
  },
  flagEmoji: { fontSize: 16 },
  startPin: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.yellow,
    borderWidth: 2,
    borderColor: '#000',
  },
  shotMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#000',
  },
  shotMarkerText: { fontSize: 10, fontWeight: FontWeight.bold, color: '#000' },

  // Club modal
  clubModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  clubModal: {
    backgroundColor: Colors.surface1,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Spacing.xxl,
  },
  clubModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  clubModalTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  clubModalDistance: { fontSize: FontSize.sm, color: Colors.green, fontWeight: FontWeight.semibold },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  clubDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.base },
  clubName: { fontSize: FontSize.base, fontWeight: FontWeight.medium, color: Colors.text },
  clubType: { fontSize: FontSize.sm, color: Colors.textMuted, textTransform: 'capitalize' },
  clubCancelBtn: {
    margin: Spacing.base,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubCancelText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
});
