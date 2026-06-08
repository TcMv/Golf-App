import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
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
import type { Hazard, HazardType } from '../../types';

type Mode = 'view' | 'edit' | 'draw';
type LatLng = { latitude: number; longitude: number };

const COURSE_ID = '00000000-0000-0000-0000-000000000001';

const HAZARD_COLORS: Record<HazardType, string> = {
  bunker: '#F5C518',
  water: '#4A90D9',
  trees: '#2D6A2D',
  ob: '#FFFFFF',
  red_zone: '#E53E3E',
};

const HAZARD_LABELS: Record<HazardType, string> = {
  bunker: 'Bunker',
  water: 'Water',
  trees: 'Trees',
  ob: 'OB',
  red_zone: 'Red Zone',
};

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

export default function AdminMapScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [mode, setMode] = useState<Mode>('view');
  const [holes, setHoles] = useState<HoleMarker[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [drawVertices, setDrawVertices] = useState<LatLng[]>([]);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [hazardType, setHazardType] = useState<HazardType>('bunker');
  const [hazardHole, setHazardHole] = useState<number | null>(null);
  const [hazardLabel, setHazardLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [{ data: holesData }, { data: hazardsData }] = await Promise.all([
      supabase
        .from('holes')
        .select('id,number,tee_lat,tee_lng,green_front_lat,green_front_lng,green_mid_lat,green_mid_lng,green_back_lat,green_back_lng')
        .eq('course_id', COURSE_ID)
        .order('number'),
      supabase.from('hazards').select('*').eq('course_id', COURSE_ID),
    ]);
    if (holesData) setHoles(holesData as HoleMarker[]);
    if (hazardsData) setHazards(hazardsData as Hazard[]);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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
    setHazardHole(null);
    setHazardType('bunker');
  }, []);

  const saveHazard = useCallback(async () => {
    if (drawVertices.length < 3) return;
    setSaving(true);
    const { error } = await supabase.from('hazards').insert({
      course_id: COURSE_ID,
      hole_number: hazardHole,
      type: hazardType,
      label: hazardLabel || null,
      coordinates: drawVertices.map(v => ({ lat: v.latitude, lng: v.longitude })),
    });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    clearDraw();
    loadData();
  }, [drawVertices, hazardHole, hazardType, hazardLabel, clearDraw, loadData]);

  const deleteHazard = useCallback((id: string) => {
    Alert.alert('Delete hazard?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('hazards').delete().eq('id', id);
          setHazards(prev => prev.filter(h => h.id !== id));
        },
      },
    ]);
  }, []);

  const closingSegment: LatLng[] =
    drawVertices.length >= 3
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
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        rotateEnabled={false}
      >
        {/* Hole markers */}
        {holes.map(hole => (
          <React.Fragment key={hole.id}>
            {hole.tee_lat != null && hole.tee_lng != null && (
              <Marker
                coordinate={{ latitude: hole.tee_lat, longitude: hole.tee_lng }}
                title={`H${hole.number} Tee`}
                draggable={mode === 'edit'}
                onDragEnd={e => handleMarkerDragEnd(hole.id, 'tee', e.nativeEvent.coordinate)}
                pinColor="white"
              />
            )}
            {hole.green_front_lat != null && hole.green_front_lng != null && (
              <Marker
                coordinate={{ latitude: hole.green_front_lat, longitude: hole.green_front_lng }}
                title={`H${hole.number} Front`}
                draggable={mode === 'edit'}
                onDragEnd={e => handleMarkerDragEnd(hole.id, 'green_front', e.nativeEvent.coordinate)}
                pinColor="#22c55e"
              />
            )}
            {hole.green_mid_lat != null && hole.green_mid_lng != null && (
              <Marker
                coordinate={{ latitude: hole.green_mid_lat, longitude: hole.green_mid_lng }}
                title={`H${hole.number} Mid`}
                draggable={mode === 'edit'}
                onDragEnd={e => handleMarkerDragEnd(hole.id, 'green_mid', e.nativeEvent.coordinate)}
                pinColor="#16a34a"
              />
            )}
            {hole.green_back_lat != null && hole.green_back_lng != null && (
              <Marker
                coordinate={{ latitude: hole.green_back_lat, longitude: hole.green_back_lng }}
                title={`H${hole.number} Back`}
                draggable={mode === 'edit'}
                onDragEnd={e => handleMarkerDragEnd(hole.id, 'green_back', e.nativeEvent.coordinate)}
                pinColor="#15803d"
              />
            )}
          </React.Fragment>
        ))}

        {/* Hazard polygons */}
        {hazards.map(hazard => (
          <Polygon
            key={hazard.id}
            coordinates={hazard.coordinates.map(c => ({ latitude: c.lat, longitude: c.lng }))}
            fillColor={HAZARD_COLORS[hazard.type] + '55'}
            strokeColor={HAZARD_COLORS[hazard.type]}
            strokeWidth={2}
            tappable={mode === 'edit'}
            onPress={() => mode === 'edit' && deleteHazard(hazard.id)}
          />
        ))}

        {/* Drawing in progress */}
        {drawVertices.length > 0 && (
          <>
            <Polyline
              coordinates={drawVertices}
              strokeColor="#F5C518"
              strokeWidth={2}
            />
            {closingSegment.length === 2 && (
              <Polyline
                coordinates={closingSegment}
                strokeColor="#F5C51888"
                strokeWidth={1.5}
                lineDashPattern={[6, 4]}
              />
            )}
            {drawVertices.map((v, i) => (
              <Marker key={`v${i}`} coordinate={v} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.vertex}>
                  <Text style={styles.vertexLabel}>{i + 1}</Text>
                </View>
              </Marker>
            ))}
          </>
        )}
      </MapView>

      {/* Header + mode bar */}
      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Course Editor</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.modeBar}>
          {(['view', 'edit', 'draw'] as Mode[]).map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              onPress={() => { setMode(m); clearDraw(); }}
            >
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                {m === 'view' ? 'View' : m === 'edit' ? 'Edit Points' : 'Draw'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      {/* Bottom contextual bar */}
      <View style={[styles.bottomBar, { bottom: 20 + insets.bottom }]} pointerEvents="box-none">
        {mode === 'view' && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>White = tees  ·  Green = greens  ·  Tap polygon in Edit to delete</Text>
          </View>
        )}
        {mode === 'edit' && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>Drag markers to reposition · auto-saves  ·  Tap polygon to delete</Text>
          </View>
        )}
        {mode === 'draw' && drawVertices.length === 0 && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>Tap the map to start drawing a polygon</Text>
          </View>
        )}
        {mode === 'draw' && drawVertices.length > 0 && (
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
      </View>

      {/* Tag polygon modal */}
      <Modal
        visible={tagModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTagModalVisible(false)}
      >
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
                    hazardType === t && {
                      backgroundColor: HAZARD_COLORS[t],
                      borderColor: HAZARD_COLORS[t],
                    },
                  ]}
                  onPress={() => setHazardType(t)}
                >
                  <Text style={[
                    styles.typeBtnText,
                    hazardType === t && { color: t === 'trees' ? '#fff' : '#000' },
                  ]}>
                    {HAZARD_LABELS[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalSectionLabel}>Hole (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.holeRow}>
                <TouchableOpacity
                  style={[styles.holePip, hazardHole === null && styles.holePipActive]}
                  onPress={() => setHazardHole(null)}
                >
                  <Text style={[styles.holePipText, hazardHole === null && styles.holePipTextActive]}>All</Text>
                </TouchableOpacity>
                {Array.from({ length: 18 }, (_, i) => i + 1).map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.holePip, hazardHole === n && styles.holePipActive]}
                    onPress={() => setHazardHole(n)}
                  >
                    <Text style={[styles.holePipText, hazardHole === n && styles.holePipTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
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
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  backBtnText: { fontSize: FontSize.base, color: '#fff' },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: '#fff' },
  modeBar: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: Radius.md,
    padding: 3,
    gap: 3,
  },
  modeBtn: {
    flex: 1, height: 36, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  modeBtnActive: { backgroundColor: Colors.surface3 },
  modeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: 'rgba(255,255,255,0.5)' },
  modeBtnTextActive: { color: '#fff', fontWeight: FontWeight.semibold },
  bottomBar: {
    position: 'absolute', left: Spacing.base, right: Spacing.base,
    alignItems: 'center', gap: Spacing.sm,
  },
  hint: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  hintText: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  drawRow: { width: '100%', alignItems: 'center', gap: Spacing.sm },
  drawBtns: { flexDirection: 'row', gap: Spacing.sm },
  ghostBtn: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  ghostBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: '#fff' },
  greenBtn: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, backgroundColor: Colors.green,
  },
  greenBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#000' },
  vertex: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#F5C518',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#000',
  },
  vertexLabel: { fontSize: 10, fontWeight: FontWeight.bold, color: '#000' },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
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
    flex: 1, height: 48, borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    alignItems: 'center', justifyContent: 'center',
  },
  modalBackText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  modalSaveBtn: {
    flex: 2, height: 48, borderRadius: Radius.full,
    backgroundColor: Colors.green,
    alignItems: 'center', justifyContent: 'center',
  },
  modalSaveText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#000' },
});
