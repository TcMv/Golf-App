import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { supabase } from '../../lib/supabase';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Course } from '../../types';

type LatLng = { latitude: number; longitude: number };
type ZoneType = 'green' | 'fairway' | 'tee_box' | 'fairway_centreline';

type HoleRow = {
  id: string;
  number: number;
  tee_lat: number | null;
  tee_lng: number | null;
  green_front_lat: number | null;
  green_front_lng: number | null;
  green_mid_lat: number | null;
  green_mid_lng: number | null;
  green_back_lat: number | null;
  green_back_lng: number | null;
};

type HoleZone = {
  id: string;
  course_id: string;
  hole_number: number;
  zone_type: ZoneType;
  coordinates: { lat: number; lng: number }[];
};

const ZONE_LABELS: Record<ZoneType, string> = {
  fairway: 'Fairway',
  green: 'Green',
  fairway_centreline: 'Centreline',
  tee_box: 'Tee Box',
};

const ZONE_ORDER: ZoneType[] = ['fairway', 'green', 'fairway_centreline', 'tee_box'];

const isLineZone = (zoneType: ZoneType) => zoneType === 'fairway_centreline';

const toMapCoords = (coordinates: HoleZone['coordinates']): LatLng[] =>
  coordinates.map(coord => ({ latitude: coord.lat, longitude: coord.lng }));

const holeCoords = (hole: HoleRow | null): LatLng[] => {
  if (!hole) return [];
  const pairs: [number | null, number | null][] = [
    [hole.tee_lat, hole.tee_lng],
    [hole.green_front_lat, hole.green_front_lng],
    [hole.green_mid_lat, hole.green_mid_lng],
    [hole.green_back_lat, hole.green_back_lng],
  ];
  return pairs
    .filter((pair): pair is [number, number] => pair[0] != null && pair[1] != null)
    .map(([latitude, longitude]) => ({ latitude, longitude }));
};

export default function AdminHoleZonesScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [holes, setHoles] = useState<HoleRow[]>([]);
  const [activeHole, setActiveHole] = useState<number | null>(null);
  const [zones, setZones] = useState<HoleZone[]>([]);
  const [selectedZoneType, setSelectedZoneType] = useState<ZoneType>('fairway');
  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<LatLng[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedCourse = useMemo(
    () => courses.find(course => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );
  const selectedHole = useMemo(
    () => holes.find(hole => hole.number === activeHole) ?? null,
    [activeHole, holes],
  );
  const selectedZone = useMemo(
    () => zones.find(zone => zone.zone_type === selectedZoneType) ?? null,
    [selectedZoneType, zones],
  );

  const cancelDrawing = useCallback(() => {
    setDrawing(false);
    setDraftPoints([]);
  }, []);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, lat, lng, holes, created_at')
      .order('name');
    setLoading(false);
    if (error) {
      Alert.alert('Course Error', 'Could not load courses.');
      return;
    }
    const loaded = (data ?? []) as Course[];
    setCourses(loaded);
    setSelectedCourseId(current => current && loaded.some(course => course.id === current)
      ? current
      : loaded[0]?.id ?? null);
  }, []);

  const loadHoles = useCallback(async (courseId: string) => {
    const { data, error } = await supabase
      .from('holes')
      .select('id, number, tee_lat, tee_lng, green_front_lat, green_front_lng, green_mid_lat, green_mid_lng, green_back_lat, green_back_lng')
      .eq('course_id', courseId)
      .order('number');
    if (error) {
      Alert.alert('Hole Error', 'Could not load holes for this course.');
      return;
    }
    const loaded = (data ?? []) as HoleRow[];
    setHoles(loaded);
    setActiveHole(current => current && loaded.some(hole => hole.number === current)
      ? current
      : loaded[0]?.number ?? null);
  }, []);

  const loadZones = useCallback(async (courseId: string, holeNumber: number) => {
    const { data, error } = await supabase
      .from('hole_zones')
      .select('id, course_id, hole_number, zone_type, coordinates')
      .eq('course_id', courseId)
      .eq('hole_number', holeNumber);
    if (error) {
      Alert.alert('Geometry Error', 'Could not load hole geometry.');
      return;
    }
    setZones((data ?? []) as HoleZone[]);
  }, []);

  useEffect(() => { void loadCourses(); }, [loadCourses]);

  useEffect(() => {
    cancelDrawing();
    setZones([]);
    setHoles([]);
    setActiveHole(null);
    if (!selectedCourseId) return;
    void loadHoles(selectedCourseId);
  }, [cancelDrawing, loadHoles, selectedCourseId]);

  useEffect(() => {
    cancelDrawing();
    setZones([]);
    if (!selectedCourseId || activeHole == null) return;
    void loadZones(selectedCourseId, activeHole);
  }, [activeHole, cancelDrawing, loadZones, selectedCourseId]);

  useEffect(() => {
    if (!selectedCourse) return;
    mapRef.current?.animateToRegion({
      latitude: selectedCourse.lat,
      longitude: selectedCourse.lng,
      latitudeDelta: 0.015,
      longitudeDelta: 0.015,
    }, 350);
  }, [selectedCourse?.id, selectedCourse?.lat, selectedCourse?.lng]);

  useEffect(() => {
    const coords = holeCoords(selectedHole);
    if (coords.length >= 2) {
      mapRef.current?.fitToCoordinates(coords, {
        animated: true,
        edgePadding: { top: 220, right: 60, bottom: 200, left: 60 },
      });
    } else if (coords.length === 1) {
      mapRef.current?.animateToRegion({
        ...coords[0],
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      }, 350);
    }
  }, [selectedHole?.id]);

  const startDrawing = () => {
    if (activeHole == null) {
      Alert.alert('Select a hole', 'Choose a hole before drawing geometry.');
      return;
    }
    setDraftPoints([]);
    setDrawing(true);
  };

  const handleMapPress = (event: any) => {
    if (!drawing) return;
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setDraftPoints(current => [...current, { latitude, longitude }]);
  };

  const saveZone = async () => {
    if (!selectedCourseId || activeHole == null || saving) return;
    const minimum = isLineZone(selectedZoneType) ? 2 : 3;
    if (draftPoints.length < minimum) {
      Alert.alert('More points needed', `${ZONE_LABELS[selectedZoneType]} needs at least ${minimum} points.`);
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('hole_zones').upsert({
      course_id: selectedCourseId,
      hole_number: activeHole,
      zone_type: selectedZoneType,
      coordinates: draftPoints.map(point => ({ lat: point.latitude, lng: point.longitude })),
    }, { onConflict: 'course_id,hole_number,zone_type' });
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    cancelDrawing();
    await loadZones(selectedCourseId, activeHole);
  };

  const deleteZone = () => {
    if (!selectedZone || !selectedCourseId || activeHole == null) return;
    Alert.alert('Delete geometry?', `${ZONE_LABELS[selectedZoneType]} for Hole ${activeHole} will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('hole_zones').delete().eq('id', selectedZone.id);
          if (error) {
            Alert.alert('Delete failed', error.message);
            return;
          }
          await loadZones(selectedCourseId, activeHole);
        },
      },
    ]);
  };

  const draftMinimum = isLineZone(selectedZoneType) ? 2 : 3;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        mapType="satellite"
        initialRegion={{ latitude: -26.63, longitude: 153.0, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton={false}
        rotateEnabled={false}
      >
        {selectedHole?.tee_lat != null && selectedHole.tee_lng != null && (
          <Marker coordinate={{ latitude: selectedHole.tee_lat, longitude: selectedHole.tee_lng }} title={`H${selectedHole.number} Tee`} pinColor="white" />
        )}
        {selectedHole?.green_mid_lat != null && selectedHole.green_mid_lng != null && (
          <Marker coordinate={{ latitude: selectedHole.green_mid_lat, longitude: selectedHole.green_mid_lng }} title={`H${selectedHole.number} Green`} pinColor={Colors.green} />
        )}

        {zones.map(zone => {
          const coords = toMapCoords(zone.coordinates);
          if (zone.zone_type === 'fairway_centreline') {
            return <Polyline key={zone.id} coordinates={coords} strokeColor={Colors.eagle} strokeWidth={4} />;
          }
          const fill = zone.zone_type === 'green' ? `${Colors.green}55` : zone.zone_type === 'tee_box' ? '#FFFFFF33' : `${Colors.greenDark}33`;
          const stroke = zone.zone_type === 'green' ? Colors.green : zone.zone_type === 'tee_box' ? Colors.text : Colors.greenDark;
          return <Polygon key={zone.id} coordinates={coords} fillColor={fill} strokeColor={stroke} strokeWidth={2} />;
        })}

        {drawing && draftPoints.length > 0 && (
          <>
            {isLineZone(selectedZoneType) ? (
              <Polyline coordinates={draftPoints} strokeColor={Colors.text} strokeWidth={4} lineDashPattern={[8, 4]} />
            ) : draftPoints.length >= 3 ? (
              <Polygon coordinates={draftPoints} fillColor="#FFFFFF22" strokeColor={Colors.text} strokeWidth={2} />
            ) : (
              <Polyline coordinates={draftPoints} strokeColor={Colors.text} strokeWidth={2} />
            )}
            {draftPoints.map((point, index) => (
              <Marker key={`draft-${index}`} coordinate={point} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.pointHandle}><Text style={styles.pointText}>{index + 1}</Text></View>
              </Marker>
            ))}
          </>
        )}
      </MapView>

      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>✕</Text></TouchableOpacity>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Hole Geometry</Text>
            <Text style={styles.subtitle}>{selectedCourse?.name ?? (loading ? 'Loading…' : 'No course')}</Text>
          </View>
          <View style={styles.backButton} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {courses.map(course => {
            const active = course.id === selectedCourseId;
            return (
              <TouchableOpacity key={course.id} style={[styles.courseChip, active && styles.activeChip]} onPress={() => setSelectedCourseId(course.id)}>
                <Text style={[styles.chipText, active && styles.activeChipText]}>{course.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {holes.map(hole => {
            const active = hole.number === activeHole;
            return (
              <TouchableOpacity key={hole.id} style={[styles.holeChip, active && styles.activeChip]} onPress={() => setActiveHole(hole.number)}>
                <Text style={[styles.chipText, active && styles.activeChipText]}>{hole.number}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {ZONE_ORDER.map(zoneType => {
            const active = zoneType === selectedZoneType;
            const exists = zones.some(zone => zone.zone_type === zoneType);
            return (
              <TouchableOpacity
                key={zoneType}
                style={[styles.zoneChip, active && styles.activeChip]}
                onPress={() => { cancelDrawing(); setSelectedZoneType(zoneType); }}
              >
                <Text style={[styles.chipText, active && styles.activeChipText]}>{exists ? '✓ ' : ''}{ZONE_LABELS[zoneType]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <View style={[styles.bottomBar, { bottom: 20 + insets.bottom }]}>
        {drawing ? (
          <View style={styles.drawPanel}>
            <Text style={styles.hintText}>
              Hole {activeHole} · {ZONE_LABELS[selectedZoneType]} · {draftPoints.length} point{draftPoints.length === 1 ? '' : 's'}
            </Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setDraftPoints(current => current.slice(0, -1))} disabled={draftPoints.length === 0}><Text style={styles.secondaryText}>Undo</Text></TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={cancelDrawing}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, draftPoints.length < draftMinimum && styles.disabled]} onPress={() => { void saveZone(); }} disabled={draftPoints.length < draftMinimum || saving}>
                {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.primaryText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.drawPanel}>
            <Text style={styles.hintText}>
              {selectedZone ? `${ZONE_LABELS[selectedZoneType]} is mapped. Redraw replaces it.` : `Map ${ZONE_LABELS[selectedZoneType]} for Hole ${activeHole ?? '—'}.`}
            </Text>
            <View style={styles.actionRow}>
              {selectedZone && (
                <TouchableOpacity style={styles.deleteButton} onPress={deleteZone}><Text style={styles.deleteText}>Delete</Text></TouchableOpacity>
              )}
              <TouchableOpacity style={styles.primaryButton} onPress={startDrawing} disabled={activeHole == null}>
                <Text style={styles.primaryText}>{selectedZone ? 'Redraw' : 'Draw'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, backgroundColor: Colors.mapOverlay },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface2 },
  backText: { color: Colors.text, fontSize: FontSize.base },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { color: Colors.text, fontFamily: Font.bold, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  subtitle: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, marginTop: 2 },
  chipRow: { gap: Spacing.xs, paddingHorizontal: Spacing.base, paddingVertical: 4 },
  courseChip: { paddingHorizontal: Spacing.sm, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.mapOverlay, borderWidth: 1, borderColor: Colors.border },
  holeChip: { width: 36, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.mapOverlay, borderWidth: 1, borderColor: Colors.border },
  zoneChip: { paddingHorizontal: Spacing.sm, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.mapOverlay, borderWidth: 1, borderColor: Colors.border },
  activeChip: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  chipText: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.xs },
  activeChipText: { color: Colors.green, fontFamily: Font.bold },
  pointHandle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.text, borderWidth: 2, borderColor: Colors.bg },
  pointText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.xs },
  bottomBar: { position: 'absolute', left: Spacing.base, right: Spacing.base },
  drawPanel: { padding: Spacing.base, gap: Spacing.sm, borderRadius: Radius.lg, backgroundColor: Colors.mapOverlay, borderWidth: 1, borderColor: Colors.border },
  hintText: { color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm, textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  primaryButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.green, paddingHorizontal: Spacing.base },
  primaryText: { color: Colors.bg, fontFamily: Font.bold },
  secondaryButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface3 },
  secondaryText: { color: Colors.text, fontFamily: Font.semibold },
  deleteButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.redMuted, paddingHorizontal: Spacing.base },
  deleteText: { color: Colors.red, fontFamily: Font.semibold },
  disabled: { opacity: 0.45 },
});
