import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Hazard, HazardType } from '../../types';

type Mode = 'view' | 'edit' | 'draw' | 'gps';
type LatLng = { latitude: number; longitude: number };
type LayerKey = 'tees' | 'greens' | 'bunker' | 'water' | 'trees' | 'ob' | 'red_zone';
type Layers = Record<LayerKey, boolean>;
type GpsField = 'tee' | 'green_front' | 'green_mid' | 'green_back';

type Course = { id: string; name: string; lat: number; lng: number };

const HAZARD_COLORS: Record<HazardType, string> = {
  bunker: Colors.eagle,
  water: Colors.textMuted,
  trees: Colors.greenDark,
  ob: Colors.text,
  red_zone: Colors.doublePlus,
};

const HAZARD_LABELS: Record<HazardType, string> = {
  bunker: 'Bunker',
  water: 'Water',
  trees: 'Trees',
  ob: 'OB',
  red_zone: 'Red Zone',
};

const DEFAULT_LAYERS: Layers = {
  tees: true, greens: true, bunker: true, water: true, trees: true, ob: true, red_zone: true,
};

const LAYER_DEFS: { key: LayerKey; label: string; color: string }[] = [
  { key: 'tees', label: 'Tees', color: Colors.text },
  { key: 'greens', label: 'Greens', color: Colors.green },
  { key: 'bunker', label: 'Bunkers', color: Colors.eagle },
  { key: 'water', label: 'Water', color: Colors.textMuted },
  { key: 'trees', label: 'Trees', color: Colors.greenDark },
  { key: 'ob', label: 'OB', color: Colors.text },
  { key: 'red_zone', label: 'Red Zone', color: Colors.doublePlus },
];

const GPS_STAMPS: { field: GpsField; label: string }[] = [
  { field: 'tee', label: 'Tee' },
  { field: 'green_front', label: 'Front' },
  { field: 'green_mid', label: 'Mid' },
  { field: 'green_back', label: 'Back' },
];

type HoleMarker = {
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

const midpt = (a: LatLng, b: LatLng): LatLng => ({
  latitude: (a.latitude + b.latitude) / 2,
  longitude: (a.longitude + b.longitude) / 2,
});

function holeHasGps(hole: HoleMarker | undefined, field: GpsField): boolean {
  if (!hole) return false;
  switch (field) {
    case 'tee': return hole.tee_lat != null;
    case 'green_front': return hole.green_front_lat != null;
    case 'green_mid': return hole.green_mid_lat != null;
    case 'green_back': return hole.green_back_lat != null;
  }
}

export default function AdminMapScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [courseId, setCourseId] = useState('00000000-0000-0000-0000-000000000001');
  const [courses, setCourses] = useState<Course[]>([]);
  const [mode, setMode] = useState<Mode>('view');
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [holes, setHoles] = useState<HoleMarker[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);

  // Draw mode
  const [drawVertices, setDrawVertices] = useState<LatLng[]>([]);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [hazardType, setHazardType] = useState<HazardType>('bunker');
  const [hazardHoles, setHazardHoles] = useState<number[]>([]);
  const [hazardLabel, setHazardLabel] = useState('');
  const [saving, setSaving] = useState(false);

  // Vertex edit mode
  const [editingHazardId, setEditingHazardId] = useState<string | null>(null);
  const [editingVertices, setEditingVertices] = useState<LatLng[]>([]);
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);

  // GPS capture mode
  const [gpsCaptureHole, setGpsCaptureHole] = useState(1);
  const [stampingField, setStampingField] = useState<GpsField | null>(null);
  const [lastSaved, setLastSaved] = useState<GpsField | null>(null);

  const loadCourses = useCallback(async () => {
    const { data } = await supabase.from('courses').select('id,name,lat,lng').order('name');
    if (data) setCourses(data as Course[]);
  }, []);

  const loadData = useCallback(async () => {
    const [{ data: holesData }, { data: hazardsData }] = await Promise.all([
      supabase
        .from('holes')
        .select('id,number,tee_lat,tee_lng,green_front_lat,green_front_lng,green_mid_lat,green_mid_lng,green_back_lat,green_back_lng')
        .eq('course_id', courseId)
        .order('number'),
      supabase
        .from('hazards')
        .select('id, course_id, hole_number, hole_numbers, type, label, coordinates, created_at')
        .eq('course_id', courseId),
    ]);
    if (holesData) setHoles(holesData as HoleMarker[]);
    if (hazardsData) setHazards(hazardsData as Hazard[]);
  }, [courseId]);

  useEffect(() => { loadCourses(); }, [loadCourses]);
  useEffect(() => { loadData(); }, [loadData]);

  // Pan map to selected course
  useEffect(() => {
    const course = courses.find(c => c.id === courseId);
    if (course && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: course.lat,
        longitude: course.lng,
        latitudeDelta: 0.013,
        longitudeDelta: 0.013,
      }, 800);
    }
  }, [courseId, courses]);

  const toggleLayer = useCallback((key: LayerKey) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleMapPress = useCallback((e: any) => {
    if (mode !== 'draw') return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setDrawVertices(prev => [...prev, { latitude, longitude }]);
  }, [mode]);

  const handleMarkerDragEnd = useCallback(async (
    holeId: string,
    field: 'tee' | 'green_front' | 'green_mid' | 'green_back',
    coord: LatLng,
  ) => {
    const update = {
      [`${field}_lat`]: coord.latitude,
      [`${field}_lng`]: coord.longitude,
    };
    const { error } = await supabase.from('holes').update(update).eq('id', holeId);
    if (error) { Alert.alert('Save failed', error.message); return; }
    setHoles(prev => prev.map(h => h.id === holeId ? { ...h, ...update } : h));
  }, []);

  const clearDraw = useCallback(() => {
    setDrawVertices([]);
    setTagModalVisible(false);
    setHazardLabel('');
    setHazardHoles([]);
    setHazardType('bunker');
  }, []);

  const enterVertexEdit = useCallback((hazard: Hazard) => {
    setEditingHazardId(hazard.id);
    setEditingVertices(hazard.coordinates.map(c => ({ latitude: c.lat, longitude: c.lng })));
    setSelectedVertexIdx(null);
  }, []);

  const cancelVertexEdit = useCallback(() => {
    setEditingHazardId(null);
    setEditingVertices([]);
    setSelectedVertexIdx(null);
  }, []);

  const saveVertexEdit = useCallback(async () => {
    if (!editingHazardId) return;
    setSaving(true);
    const { error } = await supabase
      .from('hazards')
      .update({ coordinates: editingVertices.map(v => ({ lat: v.latitude, lng: v.longitude })) })
      .eq('id', editingHazardId);
    setSaving(false);
    if (error) { Alert.alert('Save failed', error.message); return; }
    setHazards(prev => prev.map(h =>
      h.id === editingHazardId
        ? { ...h, coordinates: editingVertices.map(v => ({ lat: v.latitude, lng: v.longitude })) }
        : h
    ));
    cancelVertexEdit();
  }, [editingHazardId, editingVertices, cancelVertexEdit]);

  const deleteVertexEditHazard = useCallback(() => {
    if (!editingHazardId) return;
    Alert.alert('Delete polygon?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('hazards').delete().eq('id', editingHazardId);
          setHazards(prev => prev.filter(h => h.id !== editingHazardId));
          cancelVertexEdit();
        },
      },
    ]);
  }, [editingHazardId, cancelVertexEdit]);

  const deleteSelectedVertex = useCallback(() => {
    if (selectedVertexIdx === null || editingVertices.length <= 3) return;
    setEditingVertices(prev => prev.filter((_, i) => i !== selectedVertexIdx));
    setSelectedVertexIdx(null);
  }, [selectedVertexIdx, editingVertices.length]);

  const insertVertex = useCallback((afterIdx: number) => {
    const a = editingVertices[afterIdx];
    const b = editingVertices[(afterIdx + 1) % editingVertices.length];
    setEditingVertices(prev => [
      ...prev.slice(0, afterIdx + 1),
      midpt(a, b),
      ...prev.slice(afterIdx + 1),
    ]);
  }, [editingVertices]);

  const toggleHazardHole = useCallback((n: number) => {
    setHazardHoles(prev =>
      prev.includes(n) ? prev.filter(h => h !== n) : [...prev, n].sort((a, b) => a - b)
    );
  }, []);

  const captureGps = useCallback(async (field: GpsField) => {
    const hole = holes.find(h => h.number === gpsCaptureHole);
    if (!hole) {
      Alert.alert('Hole not found', `Hole ${gpsCaptureHole} is not in the database for this course.`);
      return;
    }
    setStampingField(field);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location permission is required to stamp GPS coordinates.');
        setStampingField(null);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const update = {
        [`${field}_lat`]: pos.coords.latitude,
        [`${field}_lng`]: pos.coords.longitude,
      };
      const { error } = await supabase.from('holes').update(update).eq('id', hole.id);
      if (error) {
        Alert.alert('Save failed', error.message);
        setStampingField(null);
        return;
      }
      setHoles(prev => prev.map(h => h.id === hole.id ? { ...h, ...update } : h));
      setLastSaved(field);
      setTimeout(() => setLastSaved(null), 2500);
    } catch (err) {
      Alert.alert('GPS Error', err instanceof Error ? err.message : 'Failed to get location');
    }
    setStampingField(null);
  }, [holes, gpsCaptureHole]);

  const saveHazard = useCallback(async () => {
    if (drawVertices.length < 3) return;
    setSaving(true);
    const { error } = await supabase.from('hazards').insert({
      course_id: courseId,
      hole_number: hazardHoles.length === 1 ? hazardHoles[0] : null,
      hole_numbers: hazardHoles.length > 0 ? hazardHoles : null,
      type: hazardType,
      label: hazardLabel || null,
      coordinates: drawVertices.map(v => ({ lat: v.latitude, lng: v.longitude })),
    });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    clearDraw();
    loadData();
  }, [drawVertices, hazardHoles, hazardType, hazardLabel, courseId, clearDraw, loadData]);

  const isVertexEditing = editingHazardId !== null;
  const canDeleteVertex = selectedVertexIdx !== null && editingVertices.length > 3;

  const closingSegment: LatLng[] =
    drawVertices.length >= 3
      ? [drawVertices[drawVertices.length - 1], drawVertices[0]]
      : [];

  const selectedHole = holes.find(h => h.number === gpsCaptureHole);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        mapType="satellite"
        initialRegion={{
          latitude: -26.6317,
          longitude: 152.9587,
          latitudeDelta: 0.013,
          longitudeDelta: 0.013,
        }}
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        rotateEnabled={false}
      >
        {/* Hole point markers */}
        {holes.map(hole => (
          <React.Fragment key={hole.id}>
            {layers.tees && hole.tee_lat != null && hole.tee_lng != null && (
              <Marker
                coordinate={{ latitude: hole.tee_lat, longitude: hole.tee_lng }}
                title={`H${hole.number} Tee`}
                draggable={mode === 'edit' && !isVertexEditing}
                onDragEnd={e => handleMarkerDragEnd(hole.id, 'tee', e.nativeEvent.coordinate)}
                pinColor="white"
              />
            )}
            {layers.greens && hole.green_front_lat != null && hole.green_front_lng != null && (
              <Marker
                coordinate={{ latitude: hole.green_front_lat, longitude: hole.green_front_lng }}
                title={`H${hole.number} Front`}
                draggable={mode === 'edit' && !isVertexEditing}
                onDragEnd={e => handleMarkerDragEnd(hole.id, 'green_front', e.nativeEvent.coordinate)}
                pinColor={Colors.green}
              />
            )}
            {layers.greens && hole.green_mid_lat != null && hole.green_mid_lng != null && (
              <Marker
                coordinate={{ latitude: hole.green_mid_lat, longitude: hole.green_mid_lng }}
                title={`H${hole.number} Mid`}
                draggable={mode === 'edit' && !isVertexEditing}
                onDragEnd={e => handleMarkerDragEnd(hole.id, 'green_mid', e.nativeEvent.coordinate)}
                pinColor={Colors.greenDark}
              />
            )}
            {layers.greens && hole.green_back_lat != null && hole.green_back_lng != null && (
              <Marker
                coordinate={{ latitude: hole.green_back_lat, longitude: hole.green_back_lng }}
                title={`H${hole.number} Back`}
                draggable={mode === 'edit' && !isVertexEditing}
                onDragEnd={e => handleMarkerDragEnd(hole.id, 'green_back', e.nativeEvent.coordinate)}
                pinColor={Colors.greenDark}
              />
            )}
          </React.Fragment>
        ))}

        {/* Hazard polygons */}
        {hazards.map(hazard => {
          if (!layers[hazard.type as LayerKey]) return null;
          const isBeingEdited = editingHazardId === hazard.id;
          const verts = isBeingEdited
            ? editingVertices
            : hazard.coordinates.map(c => ({ latitude: c.lat, longitude: c.lng }));
          return (
            <Polygon
              key={hazard.id}
              coordinates={verts}
              fillColor={HAZARD_COLORS[hazard.type] + (isBeingEdited ? '33' : '55')}
              strokeColor={isBeingEdited ? Colors.text : HAZARD_COLORS[hazard.type]}
              strokeWidth={isBeingEdited ? 2.5 : 2}
              tappable={mode === 'edit' && !isVertexEditing}
              onPress={() => {
                if (mode === 'edit' && !isVertexEditing) enterVertexEdit(hazard);
              }}
            />
          );
        })}

        {/* Vertex edit handles */}
        {isVertexEditing && editingVertices.map((v, i) => (
          <Marker
            key={`ev${i}`}
            coordinate={v}
            anchor={{ x: 0.5, y: 0.5 }}
            draggable
            onDragEnd={e => {
              const coord = e.nativeEvent.coordinate;
              setEditingVertices(prev => prev.map((pt, idx) => idx === i ? coord : pt));
            }}
            onPress={() => setSelectedVertexIdx(selectedVertexIdx === i ? null : i)}
          >
            <View style={[styles.vertexHandle, selectedVertexIdx === i && styles.vertexHandleSelected]}>
              <Text style={styles.vertexHandleLabel}>{i + 1}</Text>
            </View>
          </Marker>
        ))}

        {/* Midpoint insert handles */}
        {isVertexEditing && editingVertices.map((v, i) => {
          const nextIdx = (i + 1) % editingVertices.length;
          return (
            <Marker
              key={`mp${i}`}
              coordinate={midpt(v, editingVertices[nextIdx])}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => insertVertex(i)}
            >
              <View style={styles.midpointHandle}>
                <Text style={styles.midpointLabel}>+</Text>
              </View>
            </Marker>
          );
        })}

        {/* Draw-in-progress */}
        {drawVertices.length > 0 && (
          <>
            <Polyline coordinates={drawVertices} strokeColor={Colors.eagle} strokeWidth={2} />
            {closingSegment.length === 2 && (
              <Polyline
                coordinates={closingSegment}
                strokeColor={Colors.eagle}
                strokeWidth={1.5}
                lineDashPattern={[6, 4]}
              />
            )}
            {drawVertices.map((v, i) => (
              <Marker key={`dv${i}`} coordinate={v} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.drawVertex}>
                  <Text style={styles.drawVertexLabel}>{i + 1}</Text>
                </View>
              </Marker>
            ))}
          </>
        )}
      </MapView>

      {/* Overlay: header + course selector + mode bar + layer toggles */}
      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Course Editor</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Course selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.courseScroll}
          contentContainerStyle={styles.courseScrollContent}
        >
          {courses.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[styles.courseChip, courseId === c.id && styles.courseChipActive]}
              onPress={() => {
                setCourseId(c.id);
                setHoles([]);
                setHazards([]);
                setGpsCaptureHole(1);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.courseChipText, courseId === c.id && styles.courseChipTextActive]}>
                {c.name.replace(' Golf Club', '').replace(' Golf Course', '')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.modeBar}>
          {(['view', 'edit', 'draw', 'gps'] as Mode[]).map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              onPress={() => { setMode(m); clearDraw(); cancelVertexEdit(); }}
            >
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                {m === 'view' ? 'View' : m === 'edit' ? 'Edit' : m === 'draw' ? 'Draw' : 'GPS'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.layerScroll}
          contentContainerStyle={styles.layerScrollContent}
        >
          {LAYER_DEFS.map(def => (
            <TouchableOpacity
              key={def.key}
              style={[styles.layerChip, layers[def.key] && styles.layerChipActive]}
              onPress={() => toggleLayer(def.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.layerDot, { backgroundColor: def.color }]} />
              <Text style={[styles.layerChipText, layers[def.key] && styles.layerChipTextActive]}>
                {def.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { bottom: 20 + insets.bottom }]} pointerEvents="box-none">
        {isVertexEditing && (
          <View style={styles.vertexBar}>
            <Text style={styles.vertexCount}>
              {editingVertices.length} vertices{selectedVertexIdx !== null ? `  ·  vertex ${selectedVertexIdx + 1} selected` : '  ·  tap to select'}
            </Text>
            <View style={styles.vertexBtns}>
              {canDeleteVertex && (
                <TouchableOpacity style={styles.dangerBtn} onPress={deleteSelectedVertex}>
                  <Text style={styles.dangerBtnText}>Del vertex</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.dangerBtn} onPress={deleteVertexEditHazard}>
                <Text style={styles.dangerBtnText}>Del polygon</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={cancelVertexEdit}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.greenBtn, saving && { opacity: 0.5 }]}
                onPress={saveVertexEdit}
                disabled={saving}
              >
                <Text style={styles.greenBtnText}>{saving ? '…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!isVertexEditing && mode === 'view' && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>Tap layers above to show/hide  ·  Switch to Edit to modify</Text>
          </View>
        )}
        {!isVertexEditing && mode === 'edit' && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>Drag markers to move  ·  Tap a polygon to edit vertices</Text>
          </View>
        )}
        {!isVertexEditing && mode === 'draw' && drawVertices.length === 0 && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>Tap the map to start drawing a polygon</Text>
          </View>
        )}
        {!isVertexEditing && mode === 'draw' && drawVertices.length > 0 && (
          <View style={styles.drawRow}>
            {drawVertices.length < 3 && (
              <View style={styles.hint}>
                <Text style={styles.hintText}>{drawVertices.length} pt{drawVertices.length > 1 ? 's' : ''}  ·  Need at least 3</Text>
              </View>
            )}
            <View style={styles.drawBtns}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setDrawVertices(p => p.slice(0, -1))}>
                <Text style={styles.ghostBtnText}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={clearDraw}>
                <Text style={styles.ghostBtnText}>Clear</Text>
              </TouchableOpacity>
              {drawVertices.length >= 3 && (
                <TouchableOpacity style={styles.greenBtn} onPress={() => setTagModalVisible(true)}>
                  <Text style={styles.greenBtnText}>Save ({drawVertices.length} pts)</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        {!isVertexEditing && mode === 'gps' && (
          <View style={styles.gpsPanel}>
            <View style={styles.gpsHoleRow}>
              <Text style={styles.gpsLabel}>Hole</Text>
              <View style={styles.gpsHoleStepper}>
                <TouchableOpacity
                  style={styles.gpsStepBtn}
                  onPress={() => setGpsCaptureHole(h => Math.max(1, h - 1))}
                >
                  <Text style={styles.gpsStepBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.gpsHoleNumber}>{gpsCaptureHole}</Text>
                <TouchableOpacity
                  style={styles.gpsStepBtn}
                  onPress={() => setGpsCaptureHole(h => Math.min(18, h + 1))}
                >
                  <Text style={styles.gpsStepBtnText}>›</Text>
                </TouchableOpacity>
              </View>
              {lastSaved ? (
                <Text style={styles.gpsSavedText}>✓ {lastSaved.replace('_', ' ')} saved</Text>
              ) : (
                <Text style={styles.gpsAccuracyHint}>stand still for best accuracy</Text>
              )}
            </View>
            <View style={styles.gpsStampRow}>
              {GPS_STAMPS.map(({ field, label }) => {
                const done = holeHasGps(selectedHole, field);
                const stamping = stampingField === field;
                return (
                  <TouchableOpacity
                    key={field}
                    style={[
                      styles.gpsStampBtn,
                      done && styles.gpsStampBtnDone,
                      stamping && { opacity: 0.6 },
                    ]}
                    onPress={() => captureGps(field)}
                    disabled={stampingField !== null}
                  >
                    <Text style={[styles.gpsStampBtnText, done && styles.gpsStampBtnTextDone]}>
                      {stamping ? '…' : done ? `✓ ${label}` : `📍 ${label}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* Tag polygon modal */}
      <Modal
        visible={tagModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTagModalVisible(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Tag Polygon</Text>

            <Text style={styles.modalSectionLabel}>Type</Text>
            <View style={styles.typeRow}>
              {(Object.keys(HAZARD_LABELS) as HazardType[]).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.typeBtn,
                    hazardType === t && { backgroundColor: HAZARD_COLORS[t], borderColor: HAZARD_COLORS[t] },
                  ]}
                  onPress={() => setHazardType(t)}
                >
                  <Text style={[
                    styles.typeBtnText,
                    hazardType === t && { color: t === 'trees' ? Colors.text : Colors.bg },
                  ]}>
                    {HAZARD_LABELS[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.holeLabelRow}>
              <Text style={styles.modalSectionLabel}>Holes (optional)</Text>
              {hazardHoles.length > 0 && (
                <TouchableOpacity onPress={() => setHazardHoles([])}>
                  <Text style={styles.clearHolesText}>Clear ({hazardHoles.length} selected)</Text>
                </TouchableOpacity>
              )}
              {hazardHoles.length === 0 && (
                <Text style={styles.holeHintText}>none = applies to all holes</Text>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.holeRow}>
                {Array.from({ length: 18 }, (_, i) => i + 1).map(n => {
                  const selected = hazardHoles.includes(n);
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[styles.holePip, selected && styles.holePipActive]}
                      onPress={() => toggleHazardHole(n)}
                    >
                      <Text style={[styles.holePipText, selected && styles.holePipTextActive]}>{n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={styles.modalSectionLabel}>Label (optional)</Text>
            <TextInput
              style={styles.labelInput}
              value={hazardLabel}
              onChangeText={setHazardLabel}
              placeholder="e.g. Left greenside bunker"
              placeholderTextColor={Colors.textMuted}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalBackBtn} onPress={() => setTagModalVisible(false)}>
                <Text style={styles.modalBackText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, saving && { opacity: 0.5 }]}
                onPress={saveHazard}
                disabled={saving}
              >
                <Text style={styles.modalSaveText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.mapOverlay,
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
  },
  backBtnText: { fontSize: FontSize.base, color: Colors.text },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  courseScroll: { marginTop: 2 },
  courseScrollContent: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  courseChip: {
    paddingHorizontal: Spacing.base, paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.mapOverlay,
    borderWidth: 1, borderColor: Colors.border,
  },
  courseChipActive: {
    borderColor: Colors.green,
    backgroundColor: Colors.greenMuted,
  },
  courseChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textMuted },
  courseChipTextActive: { color: Colors.green, fontWeight: FontWeight.semibold },
  modeBar: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.xs,
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radius.md,
    padding: 3,
    gap: 3,
  },
  modeBtn: {
    flex: 1, height: 36, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  modeBtnActive: { backgroundColor: Colors.surface3 },
  modeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textMuted },
  modeBtnTextActive: { color: Colors.text, fontWeight: FontWeight.semibold },
  layerScroll: { marginTop: Spacing.xs },
  layerScrollContent: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  layerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.mapOverlay,
    borderWidth: 1, borderColor: Colors.border,
  },
  layerChipActive: {
    borderColor: Colors.textMuted,
    backgroundColor: Colors.surface2,
  },
  layerDot: {
    width: 8, height: 8, borderRadius: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  layerChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.textMuted },
  layerChipTextActive: { color: Colors.text },
  bottomBar: {
    position: 'absolute', left: Spacing.base, right: Spacing.base,
    alignItems: 'center', gap: Spacing.sm,
  },
  vertexBar: {
    width: '100%',
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  vertexCount: {
    fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center',
  },
  vertexBtns: {
    flexDirection: 'row', gap: Spacing.sm,
    flexWrap: 'wrap', justifyContent: 'center',
  },
  hint: {
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  hintText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },
  drawRow: { width: '100%', alignItems: 'center', gap: Spacing.sm },
  drawBtns: { flexDirection: 'row', gap: Spacing.sm },
  ghostBtn: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.border,
  },
  ghostBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text },
  dangerBtn: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.redMuted,
    borderWidth: 1, borderColor: Colors.doublePlus,
  },
  dangerBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.doublePlus },
  greenBtn: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, backgroundColor: Colors.green,
  },
  greenBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg },
  gpsPanel: {
    width: '100%',
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  gpsHoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  gpsLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted },
  gpsHoleStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface2,
    borderRadius: Radius.md,
    paddingHorizontal: 2,
  },
  gpsStepBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  gpsStepBtnText: { fontSize: 22, color: Colors.text, lineHeight: 28 },
  gpsHoleNumber: {
    fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text,
    minWidth: 28, textAlign: 'center',
  },
  gpsSavedText: { fontSize: FontSize.sm, color: Colors.green, fontWeight: FontWeight.semibold, marginLeft: 'auto' as any },
  gpsAccuracyHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginLeft: 'auto' as any },
  gpsStampRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  gpsStampBtn: {
    flex: 1, height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  gpsStampBtnDone: {
    backgroundColor: Colors.greenMuted,
    borderColor: Colors.green,
  },
  gpsStampBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  gpsStampBtnTextDone: { color: Colors.green },
  vertexHandle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.eagle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.bg,
  },
  vertexHandleSelected: {
    backgroundColor: Colors.text,
    borderColor: Colors.doublePlus,
  },
  vertexHandleLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.bg },
  midpointHandle: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.text,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.textMuted,
  },
  midpointLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, lineHeight: 16 },
  drawVertex: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.eagle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.bg,
  },
  drawVertexLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.bg },
  modalOverlay: {
    flex: 1, backgroundColor: Colors.mapOverlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface1,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.xl, gap: Spacing.md,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  modalSectionLabel: {
    fontSize: FontSize.xs, fontWeight: FontWeight.semibold,
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeBtn: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface2,
  },
  typeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text },
  holeLabelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  clearHolesText: { fontSize: FontSize.xs, color: Colors.green, fontWeight: FontWeight.semibold },
  holeHintText: { fontSize: FontSize.xs, color: Colors.textMuted },
  holeRow: { flexDirection: 'row', gap: Spacing.xs, paddingVertical: Spacing.xs },
  holePip: {
    width: 40, height: 36, borderRadius: Radius.sm,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  holePipActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  holePipText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary },
  holePipTextActive: { color: Colors.green, fontWeight: FontWeight.bold },
  labelInput: {
    height: 48, backgroundColor: Colors.surface3,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderStrong,
    paddingHorizontal: Spacing.base,
    fontSize: FontSize.base, color: Colors.text,
  },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  modalBackBtn: {
    flex: 1, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.surface3,
    alignItems: 'center', justifyContent: 'center',
  },
  modalBackText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  modalSaveBtn: {
    flex: 2, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.green,
    alignItems: 'center', justifyContent: 'center',
  },
  modalSaveText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.bg },
});
