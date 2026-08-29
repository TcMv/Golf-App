import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Course, Hazard, HazardType } from '../../types';

type Mode = 'view' | 'edit' | 'draw';
type LatLng = { latitude: number; longitude: number };
type LayerKey = 'tees' | 'greens' | 'bunker' | 'water' | 'trees' | 'ob' | 'red_zone';
type Layers = Record<LayerKey, boolean>;
type PointField = 'tee' | 'green_front' | 'green_mid' | 'green_back';

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

const POINT_LABELS: Record<PointField, string> = {
  tee: 'Tee',
  green_front: 'Green Front',
  green_mid: 'Green Centre',
  green_back: 'Green Back',
};

const DEFAULT_LAYERS: Layers = {
  tees: true,
  greens: true,
  bunker: true,
  water: true,
  trees: true,
  ob: true,
  red_zone: true,
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

const midpt = (a: LatLng, b: LatLng): LatLng => ({
  latitude: (a.latitude + b.latitude) / 2,
  longitude: (a.longitude + b.longitude) / 2,
});

const holeCoordinates = (hole: HoleMarker): LatLng[] => {
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

export default function AdminMapScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('view');
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [holes, setHoles] = useState<HoleMarker[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [activeHole, setActiveHole] = useState<number | null>(null);
  const [placementField, setPlacementField] = useState<PointField | null>(null);

  // Draw mode
  const [drawVertices, setDrawVertices] = useState<LatLng[]>([]);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [hazardType, setHazardType] = useState<HazardType>('bunker');
  const [hazardHoles, setHazardHoles] = useState<number[]>([]);
  const [hazardCourseWide, setHazardCourseWide] = useState(false);
  const [hazardLabel, setHazardLabel] = useState('');
  const [saving, setSaving] = useState(false);

  // Vertex edit mode
  const [editingHazardId, setEditingHazardId] = useState<string | null>(null);
  const [editingVertices, setEditingVertices] = useState<LatLng[]>([]);
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);

  const selectedCourse = useMemo(
    () => courses.find(course => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const selectedHole = useMemo(
    () => activeHole == null ? null : holes.find(hole => hole.number === activeHole) ?? null,
    [activeHole, holes],
  );

  const visibleHoles = useMemo(
    () => activeHole == null ? holes : holes.filter(hole => hole.number === activeHole),
    [activeHole, holes],
  );

  const visibleHazards = useMemo(() => {
    if (activeHole == null) return hazards;
    return hazards.filter(hazard => {
      const isCourseWide = hazard.hole_number == null && (hazard.hole_numbers == null || hazard.hole_numbers.length === 0);
      return isCourseWide
        || hazard.hole_number === activeHole
        || hazard.hole_numbers?.includes(activeHole) === true;
    });
  }, [activeHole, hazards]);

  const cancelVertexEdit = useCallback(() => {
    setEditingHazardId(null);
    setEditingVertices([]);
    setSelectedVertexIdx(null);
  }, []);

  const clearDraw = useCallback(() => {
    setDrawVertices([]);
    setTagModalVisible(false);
    setHazardLabel('');
    setHazardHoles([]);
    setHazardCourseWide(false);
    setHazardType('bunker');
  }, []);

  const resetEditingState = useCallback(() => {
    clearDraw();
    cancelVertexEdit();
    setPlacementField(null);
  }, [cancelVertexEdit, clearDraw]);

  const loadCourses = useCallback(async () => {
    setCourseLoading(true);
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, lat, lng, holes, created_at')
      .order('name');
    setCourseLoading(false);
    if (error) {
      Alert.alert('Course Error', 'Could not load the course database.');
      return;
    }
    const loaded = (data ?? []) as Course[];
    setCourses(loaded);
    setSelectedCourseId(current => current && loaded.some(course => course.id === current)
      ? current
      : loaded[0]?.id ?? null);
  }, []);

  const loadCourseData = useCallback(async (courseId: string) => {
    const [{ data: holesData, error: holesError }, { data: hazardsData, error: hazardsError }] = await Promise.all([
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
    if (holesError || hazardsError) {
      Alert.alert('Map Error', 'Could not load all mapping data for this course.');
    }
    setHoles((holesData ?? []) as HoleMarker[]);
    setHazards((hazardsData ?? []) as Hazard[]);
  }, []);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    resetEditingState();
    setActiveHole(null);
    if (!selectedCourseId) {
      setHoles([]);
      setHazards([]);
      return;
    }
    void loadCourseData(selectedCourseId);
  }, [loadCourseData, resetEditingState, selectedCourseId]);

  useEffect(() => {
    if (!selectedCourse) return;
    mapRef.current?.animateToRegion({
      latitude: selectedCourse.lat,
      longitude: selectedCourse.lng,
      latitudeDelta: 0.015,
      longitudeDelta: 0.015,
    }, 450);
  }, [selectedCourse?.id, selectedCourse?.lat, selectedCourse?.lng]);

  const focusHole = useCallback((holeNumber: number | null) => {
    resetEditingState();
    setActiveHole(holeNumber);
    if (holeNumber == null) {
      if (selectedCourse) {
        mapRef.current?.animateToRegion({
          latitude: selectedCourse.lat,
          longitude: selectedCourse.lng,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }, 350);
      }
      return;
    }
    const hole = holes.find(item => item.number === holeNumber);
    if (!hole) return;
    const coords = holeCoordinates(hole);
    if (coords.length >= 2) {
      mapRef.current?.fitToCoordinates(coords, {
        animated: true,
        edgePadding: { top: 190, right: 60, bottom: 180, left: 60 },
      });
    } else if (coords.length === 1) {
      mapRef.current?.animateToRegion({
        ...coords[0],
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      }, 350);
    }
  }, [holes, resetEditingState, selectedCourse]);

  const toggleLayer = useCallback((key: LayerKey) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const updateHolePoint = useCallback(async (
    holeId: string,
    field: PointField,
    coord: LatLng,
  ) => {
    const update = {
      [`${field}_lat`]: coord.latitude,
      [`${field}_lng`]: coord.longitude,
    };
    const { error } = await supabase.from('holes').update(update).eq('id', holeId);
    if (error) {
      Alert.alert('Save failed', error.message);
      return false;
    }
    setHoles(prev => prev.map(hole => hole.id === holeId ? { ...hole, ...update } : hole));
    return true;
  }, []);

  const handleMapPress = useCallback(async (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const coord = { latitude, longitude };

    if (placementField) {
      if (!selectedHole) {
        Alert.alert('Select a hole', 'Choose a hole before placing a tee or green point.');
        setPlacementField(null);
        return;
      }
      const saved = await updateHolePoint(selectedHole.id, placementField, coord);
      if (saved) setPlacementField(null);
      return;
    }

    if (mode !== 'draw') return;
    setDrawVertices(prev => [...prev, coord]);
  }, [mode, placementField, selectedHole, updateHolePoint]);

  const enterVertexEdit = useCallback((hazard: Hazard) => {
    setEditingHazardId(hazard.id);
    setEditingVertices(hazard.coordinates.map(coord => ({ latitude: coord.lat, longitude: coord.lng })));
    setSelectedVertexIdx(null);
  }, []);

  const saveVertexEdit = useCallback(async () => {
    if (!editingHazardId) return;
    setSaving(true);
    const { error } = await supabase
      .from('hazards')
      .update({ coordinates: editingVertices.map(vertex => ({ lat: vertex.latitude, lng: vertex.longitude })) })
      .eq('id', editingHazardId);
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    setHazards(prev => prev.map(hazard =>
      hazard.id === editingHazardId
        ? { ...hazard, coordinates: editingVertices.map(vertex => ({ lat: vertex.latitude, lng: vertex.longitude })) }
        : hazard,
    ));
    cancelVertexEdit();
  }, [cancelVertexEdit, editingHazardId, editingVertices]);

  const deleteVertexEditHazard = useCallback(() => {
    if (!editingHazardId) return;
    Alert.alert('Delete polygon?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('hazards').delete().eq('id', editingHazardId);
          if (error) {
            Alert.alert('Delete failed', error.message);
            return;
          }
          setHazards(prev => prev.filter(hazard => hazard.id !== editingHazardId));
          cancelVertexEdit();
        },
      },
    ]);
  }, [cancelVertexEdit, editingHazardId]);

  const deleteSelectedVertex = useCallback(() => {
    if (selectedVertexIdx === null || editingVertices.length <= 3) return;
    setEditingVertices(prev => prev.filter((_, index) => index !== selectedVertexIdx));
    setSelectedVertexIdx(null);
  }, [editingVertices.length, selectedVertexIdx]);

  const insertVertex = useCallback((afterIdx: number) => {
    const a = editingVertices[afterIdx];
    const b = editingVertices[(afterIdx + 1) % editingVertices.length];
    setEditingVertices(prev => [
      ...prev.slice(0, afterIdx + 1),
      midpt(a, b),
      ...prev.slice(afterIdx + 1),
    ]);
  }, [editingVertices]);

  const toggleHazardHole = useCallback((holeNumber: number) => {
    setHazardCourseWide(false);
    setHazardHoles(prev => prev.includes(holeNumber)
      ? prev.filter(item => item !== holeNumber)
      : [...prev, holeNumber].sort((a, b) => a - b));
  }, []);

  const openTagModal = useCallback(() => {
    if (!hazardCourseWide && hazardHoles.length === 0 && activeHole != null) {
      setHazardHoles([activeHole]);
    }
    setTagModalVisible(true);
  }, [activeHole, hazardCourseWide, hazardHoles.length]);

  const saveHazard = useCallback(async () => {
    if (drawVertices.length < 3 || !selectedCourseId) return;
    if (!hazardCourseWide && hazardHoles.length === 0) {
      Alert.alert('Choose a hole', 'Select at least one hole, or explicitly mark this polygon as course-wide.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('hazards').insert({
      course_id: selectedCourseId,
      hole_number: !hazardCourseWide && hazardHoles.length === 1 ? hazardHoles[0] : null,
      hole_numbers: !hazardCourseWide && hazardHoles.length > 0 ? hazardHoles : null,
      type: hazardType,
      label: hazardLabel.trim() || null,
      coordinates: drawVertices.map(vertex => ({ lat: vertex.latitude, lng: vertex.longitude })),
    });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    clearDraw();
    void loadCourseData(selectedCourseId);
  }, [clearDraw, drawVertices, hazardCourseWide, hazardHoles, hazardLabel, hazardType, loadCourseData, selectedCourseId]);

  const isVertexEditing = editingHazardId !== null;
  const canDeleteVertex = selectedVertexIdx !== null && editingVertices.length > 3;
  const closingSegment: LatLng[] = drawVertices.length >= 3
    ? [drawVertices[drawVertices.length - 1], drawVertices[0]]
    : [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        mapType="satellite"
        initialRegion={{
          latitude: -26.609,
          longitude: 152.969,
          latitudeDelta: 0.013,
          longitudeDelta: 0.013,
        }}
        onPress={event => { void handleMapPress(event); }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        rotateEnabled={false}
      >
        {visibleHoles.map(hole => (
          <React.Fragment key={hole.id}>
            {layers.tees && hole.tee_lat != null && hole.tee_lng != null && (
              <Marker
                coordinate={{ latitude: hole.tee_lat, longitude: hole.tee_lng }}
                title={`H${hole.number} Tee`}
                draggable={mode === 'edit' && !isVertexEditing && !placementField}
                onDragEnd={event => { void updateHolePoint(hole.id, 'tee', event.nativeEvent.coordinate); }}
                pinColor="white"
              />
            )}
            {layers.greens && hole.green_front_lat != null && hole.green_front_lng != null && (
              <Marker
                coordinate={{ latitude: hole.green_front_lat, longitude: hole.green_front_lng }}
                title={`H${hole.number} Front`}
                draggable={mode === 'edit' && !isVertexEditing && !placementField}
                onDragEnd={event => { void updateHolePoint(hole.id, 'green_front', event.nativeEvent.coordinate); }}
                pinColor={Colors.green}
              />
            )}
            {layers.greens && hole.green_mid_lat != null && hole.green_mid_lng != null && (
              <Marker
                coordinate={{ latitude: hole.green_mid_lat, longitude: hole.green_mid_lng }}
                title={`H${hole.number} Centre`}
                draggable={mode === 'edit' && !isVertexEditing && !placementField}
                onDragEnd={event => { void updateHolePoint(hole.id, 'green_mid', event.nativeEvent.coordinate); }}
                pinColor={Colors.greenDark}
              />
            )}
            {layers.greens && hole.green_back_lat != null && hole.green_back_lng != null && (
              <Marker
                coordinate={{ latitude: hole.green_back_lat, longitude: hole.green_back_lng }}
                title={`H${hole.number} Back`}
                draggable={mode === 'edit' && !isVertexEditing && !placementField}
                onDragEnd={event => { void updateHolePoint(hole.id, 'green_back', event.nativeEvent.coordinate); }}
                pinColor={Colors.greenDark}
              />
            )}
          </React.Fragment>
        ))}

        {visibleHazards.map(hazard => {
          if (!layers[hazard.type as LayerKey]) return null;
          const isBeingEdited = editingHazardId === hazard.id;
          const verts = isBeingEdited
            ? editingVertices
            : hazard.coordinates.map(coord => ({ latitude: coord.lat, longitude: coord.lng }));
          return (
            <Polygon
              key={hazard.id}
              coordinates={verts}
              fillColor={HAZARD_COLORS[hazard.type] + (isBeingEdited ? '33' : '55')}
              strokeColor={isBeingEdited ? Colors.text : HAZARD_COLORS[hazard.type]}
              strokeWidth={isBeingEdited ? 2.5 : 2}
              tappable={mode === 'edit' && !isVertexEditing && !placementField}
              onPress={() => {
                if (mode === 'edit' && !isVertexEditing && !placementField) enterVertexEdit(hazard);
              }}
            />
          );
        })}

        {isVertexEditing && editingVertices.map((vertex, index) => (
          <Marker
            key={`ev${index}`}
            coordinate={vertex}
            anchor={{ x: 0.5, y: 0.5 }}
            draggable
            onDragEnd={event => {
              const coord = event.nativeEvent.coordinate;
              setEditingVertices(prev => prev.map((point, pointIndex) => pointIndex === index ? coord : point));
            }}
            onPress={() => setSelectedVertexIdx(selectedVertexIdx === index ? null : index)}
          >
            <View style={[styles.vertexHandle, selectedVertexIdx === index && styles.vertexHandleSelected]}>
              <Text style={styles.vertexHandleLabel}>{index + 1}</Text>
            </View>
          </Marker>
        ))}

        {isVertexEditing && editingVertices.map((vertex, index) => {
          const nextIdx = (index + 1) % editingVertices.length;
          return (
            <Marker
              key={`mp${index}`}
              coordinate={midpt(vertex, editingVertices[nextIdx])}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => insertVertex(index)}
            >
              <View style={styles.midpointHandle}>
                <Text style={styles.midpointLabel}>+</Text>
              </View>
            </Marker>
          );
        })}

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
            {drawVertices.map((vertex, index) => (
              <Marker key={`dv${index}`} coordinate={vertex} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.drawVertex}>
                  <Text style={styles.drawVertexLabel}>{index + 1}</Text>
                </View>
              </Marker>
            ))}
          </>
        )}
      </MapView>

      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.title}>Course Editor</Text>
            <Text style={styles.subtitle}>{selectedCourse?.name ?? (courseLoading ? 'Loading courses…' : 'No course selected')}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.courseScroll}
          contentContainerStyle={styles.courseScrollContent}
        >
          {courses.map(course => {
            const selected = course.id === selectedCourseId;
            return (
              <TouchableOpacity
                key={course.id}
                style={[styles.courseChip, selected && styles.courseChipActive]}
                onPress={() => setSelectedCourseId(course.id)}
              >
                <Text style={[styles.courseChipText, selected && styles.courseChipTextActive]}>{course.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {holes.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.holeScroll}
            contentContainerStyle={styles.holeScrollContent}
          >
            <TouchableOpacity
              style={[styles.holeChip, activeHole == null && styles.holeChipActive]}
              onPress={() => focusHole(null)}
            >
              <Text style={[styles.holeChipText, activeHole == null && styles.holeChipTextActive]}>All</Text>
            </TouchableOpacity>
            {holes.map(hole => (
              <TouchableOpacity
                key={hole.id}
                style={[styles.holeChip, activeHole === hole.number && styles.holeChipActive]}
                onPress={() => focusHole(hole.number)}
              >
                <Text style={[styles.holeChipText, activeHole === hole.number && styles.holeChipTextActive]}>{hole.number}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.modeBar}>
          {(['view', 'edit', 'draw'] as Mode[]).map(item => (
            <TouchableOpacity
              key={item}
              style={[styles.modeBtn, mode === item && styles.modeBtnActive]}
              onPress={() => {
                setMode(item);
                resetEditingState();
              }}
            >
              <Text style={[styles.modeBtnText, mode === item && styles.modeBtnTextActive]}>
                {item === 'view' ? 'View' : item === 'edit' ? 'Edit' : 'Draw'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'edit' && activeHole != null && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.placeScroll}
            contentContainerStyle={styles.placeScrollContent}
          >
            {(Object.keys(POINT_LABELS) as PointField[]).map(field => (
              <TouchableOpacity
                key={field}
                style={[styles.placeChip, placementField === field && styles.placeChipActive]}
                onPress={() => setPlacementField(current => current === field ? null : field)}
              >
                <Text style={[styles.placeChipText, placementField === field && styles.placeChipTextActive]}>
                  {placementField === field ? `Tap map: ${POINT_LABELS[field]}` : `Place ${POINT_LABELS[field]}`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

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
              <Text style={[styles.layerChipText, layers[def.key] && styles.layerChipTextActive]}>{def.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>

      <View style={[styles.bottomBar, { bottom: 20 + insets.bottom }]} pointerEvents="box-none">
        {placementField && (
          <View style={styles.placementHint}>
            <Text style={styles.placementHintText}>
              Hole {activeHole} · tap the map to place {POINT_LABELS[placementField]}
            </Text>
            <TouchableOpacity onPress={() => setPlacementField(null)}>
              <Text style={styles.cancelPlacementText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {isVertexEditing && !placementField && (
          <View style={styles.vertexBar}>
            <Text style={styles.vertexCount}>
              {editingVertices.length} vertices{selectedVertexIdx !== null ? ` · vertex ${selectedVertexIdx + 1} selected` : ' · tap to select'}
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

        {!isVertexEditing && !placementField && mode === 'view' && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>Choose a course and hole above · switch to Edit to modify</Text>
          </View>
        )}
        {!isVertexEditing && !placementField && mode === 'edit' && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>
              {activeHole == null ? 'Choose a hole to place missing GPS points · existing markers remain draggable' : `Hole ${activeHole} · drag markers, place missing points, or tap a polygon to edit`}
            </Text>
          </View>
        )}
        {!isVertexEditing && !placementField && mode === 'draw' && drawVertices.length === 0 && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>
              {activeHole == null ? 'Tap the map to draw · choose holes explicitly when saving' : `Hole ${activeHole} · tap the map to start drawing a polygon`}
            </Text>
          </View>
        )}
        {!isVertexEditing && !placementField && mode === 'draw' && drawVertices.length > 0 && (
          <View style={styles.drawRow}>
            {drawVertices.length < 3 && (
              <View style={styles.hint}>
                <Text style={styles.hintText}>{drawVertices.length} pt{drawVertices.length > 1 ? 's' : ''} · need at least 3</Text>
              </View>
            )}
            <View style={styles.drawBtns}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setDrawVertices(prev => prev.slice(0, -1))}>
                <Text style={styles.ghostBtnText}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={clearDraw}>
                <Text style={styles.ghostBtnText}>Clear</Text>
              </TouchableOpacity>
              {drawVertices.length >= 3 && (
                <TouchableOpacity style={styles.greenBtn} onPress={openTagModal}>
                  <Text style={styles.greenBtnText}>Save ({drawVertices.length} pts)</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

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
                {(Object.keys(HAZARD_LABELS) as HazardType[]).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeBtn,
                      hazardType === type && { backgroundColor: HAZARD_COLORS[type], borderColor: HAZARD_COLORS[type] },
                    ]}
                    onPress={() => setHazardType(type)}
                  >
                    <Text style={[
                      styles.typeBtnText,
                      hazardType === type && { color: type === 'trees' ? Colors.text : Colors.bg },
                    ]}>
                      {HAZARD_LABELS[type]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.holeLabelRow}>
                <Text style={styles.modalSectionLabel}>Applies to</Text>
                {hazardHoles.length > 0 && !hazardCourseWide && (
                  <TouchableOpacity onPress={() => setHazardHoles([])}>
                    <Text style={styles.clearHolesText}>Clear ({hazardHoles.length})</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.courseWideBtn, hazardCourseWide && styles.courseWideBtnActive]}
                onPress={() => {
                  setHazardCourseWide(value => !value);
                  setHazardHoles([]);
                }}
              >
                <Text style={[styles.courseWideText, hazardCourseWide && styles.courseWideTextActive]}>
                  Course-wide polygon
                </Text>
              </TouchableOpacity>

              {!hazardCourseWide && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.holeRow}>
                    {holes.map(hole => {
                      const selected = hazardHoles.includes(hole.number);
                      return (
                        <TouchableOpacity
                          key={hole.id}
                          style={[styles.holePip, selected && styles.holePipActive]}
                          onPress={() => toggleHazardHole(hole.number)}
                        >
                          <Text style={[styles.holePipText, selected && styles.holePipTextActive]}>{hole.number}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              {!hazardCourseWide && hazardHoles.length === 0 && (
                <Text style={styles.holeHintText}>Select at least one hole before saving.</Text>
              )}

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
  headerTitleWrap: { alignItems: 'center', flex: 1, minWidth: 0 },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
  },
  backBtnText: { fontSize: FontSize.base, color: Colors.text },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  courseScroll: { backgroundColor: Colors.mapOverlay },
  courseScrollContent: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.xs, gap: Spacing.xs },
  courseChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
  },
  courseChipActive: { borderColor: Colors.green, backgroundColor: Colors.greenMuted },
  courseChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  courseChipTextActive: { color: Colors.green, fontWeight: FontWeight.bold },
  holeScroll: { backgroundColor: Colors.mapOverlay },
  holeScrollContent: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xs, gap: Spacing.xs },
  holeChip: {
    minWidth: 34,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  holeChipActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  holeChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.textMuted },
  holeChipTextActive: { color: Colors.green, fontWeight: FontWeight.bold },
  modeBar: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.xs,
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radius.md,
    padding: 3,
    gap: 3,
  },
  modeBtn: { flex: 1, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  modeBtnActive: { backgroundColor: Colors.surface3 },
  modeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textMuted },
  modeBtnTextActive: { color: Colors.text, fontWeight: FontWeight.semibold },
  placeScroll: { marginTop: Spacing.xs },
  placeScrollContent: { paddingHorizontal: Spacing.base, gap: Spacing.xs },
  placeChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.mapOverlay,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  placeChipActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  placeChipText: { fontSize: FontSize.xs, color: Colors.text },
  placeChipTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },
  layerScroll: { marginTop: Spacing.xs },
  layerScrollContent: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.xs, gap: Spacing.xs },
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.mapOverlay,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  layerChipActive: { borderColor: Colors.textMuted, backgroundColor: Colors.surface2 },
  layerDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: Colors.border },
  layerChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.textMuted },
  layerChipTextActive: { color: Colors.text },
  bottomBar: { position: 'absolute', left: Spacing.base, right: Spacing.base, alignItems: 'center', gap: Spacing.sm },
  placementHint: {
    width: '100%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.green,
  },
  placementHintText: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  cancelPlacementText: { marginLeft: Spacing.sm, fontSize: FontSize.sm, color: Colors.green, fontWeight: FontWeight.bold },
  vertexBar: {
    width: '100%',
    backgroundColor: Colors.mapOverlay,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  vertexCount: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
  vertexBtns: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
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
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ghostBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text },
  dangerBtn: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.redMuted,
    borderWidth: 1,
    borderColor: Colors.doublePlus,
  },
  dangerBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.doublePlus },
  greenBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.green },
  greenBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg },
  vertexHandle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.eagle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  vertexHandleSelected: { backgroundColor: Colors.text, borderColor: Colors.doublePlus },
  vertexHandleLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.bg },
  midpointHandle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.textMuted,
  },
  midpointLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, lineHeight: 16 },
  drawVertex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.eagle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  drawVertexLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.bg },
  modalOverlay: { flex: 1, backgroundColor: Colors.mapOverlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface1,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  modalSectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeBtn: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
  },
  typeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text },
  holeLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearHolesText: { fontSize: FontSize.xs, color: Colors.green, fontWeight: FontWeight.semibold },
  holeHintText: { fontSize: FontSize.xs, color: Colors.textMuted },
  courseWideBtn: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
  },
  courseWideBtnActive: { borderColor: Colors.green, backgroundColor: Colors.greenMuted },
  courseWideText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  courseWideTextActive: { color: Colors.green, fontWeight: FontWeight.bold },
  holeRow: { flexDirection: 'row', gap: Spacing.xs, paddingVertical: Spacing.xs },
  holePip: {
    width: 40,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holePipActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  holePipText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary },
  holePipTextActive: { color: Colors.green, fontWeight: FontWeight.bold },
  labelInput: {
    height: 48,
    backgroundColor: Colors.surface3,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: Spacing.base,
    fontSize: FontSize.base,
    color: Colors.text,
  },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  modalBackBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  modalSaveBtn: {
    flex: 2,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.bg },
});
