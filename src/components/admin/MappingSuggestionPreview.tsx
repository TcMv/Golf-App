import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { supabase } from '../../lib/supabase';
import {
  validateMappingSuggestion,
  type MappingSuggestion,
  type SuggestionCoordinate,
} from '../../utils/courseMappingSuggestions';
import { Colors, Font, FontSize, Radius, Spacing } from '../../constants/theme';

type SuggestionWithId = MappingSuggestion & { id: string };
type LatLng = { latitude: number; longitude: number };
type HoleContext = {
  tee_lat: number | null;
  tee_lng: number | null;
  green_front_lat: number | null;
  green_front_lng: number | null;
  green_mid_lat: number | null;
  green_mid_lng: number | null;
  green_back_lat: number | null;
  green_back_lng: number | null;
};
type ExistingGeometry = { geometry: 'point' | 'line' | 'polygon'; coordinates: SuggestionCoordinate[] };

type Props = {
  suggestion: SuggestionWithId;
  onSaved: (coordinates: SuggestionCoordinate[]) => void;
};

const pointFeatures = new Set(['tee', 'green_front', 'green_centre', 'green_back']);
const zoneFeatures = new Set(['green', 'fairway', 'tee_box', 'fairway_centreline']);
const hazardFeatures = new Set(['bunker', 'water', 'trees', 'ob', 'red_zone']);

function toMapCoordinate(point: SuggestionCoordinate): LatLng {
  return { latitude: point.lat, longitude: point.lng };
}

function validPair(lat: number | null, lng: number | null): SuggestionCoordinate | null {
  return lat != null && lng != null ? { lat, lng } : null;
}

function approvedPoint(feature: string, hole: HoleContext | null): SuggestionCoordinate | null {
  if (!hole) return null;
  if (feature === 'tee') return validPair(hole.tee_lat, hole.tee_lng);
  if (feature === 'green_front') return validPair(hole.green_front_lat, hole.green_front_lng);
  if (feature === 'green_centre') return validPair(hole.green_mid_lat, hole.green_mid_lng);
  if (feature === 'green_back') return validPair(hole.green_back_lat, hole.green_back_lng);
  return null;
}

export default function MappingSuggestionPreview({ suggestion, onSaved }: Props) {
  const mapRef = useRef<MapView>(null);
  const [coordinates, setCoordinates] = useState<SuggestionCoordinate[]>(suggestion.coordinates);
  const [existing, setExisting] = useState<ExistingGeometry[]>([]);
  const [holeContext, setHoleContext] = useState<HoleContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setCoordinates(suggestion.coordinates);
    setEditing(false);
  }, [suggestion.id, suggestion.coordinates]);

  const loadContext = useCallback(async () => {
    setLoading(true);
    try {
      const { data: hole, error: holeError } = await supabase
        .from('holes')
        .select('tee_lat, tee_lng, green_front_lat, green_front_lng, green_mid_lat, green_mid_lng, green_back_lat, green_back_lng')
        .eq('course_id', suggestion.course_id)
        .eq('number', suggestion.hole_number)
        .maybeSingle();
      if (holeError) throw holeError;
      setHoleContext((hole ?? null) as HoleContext | null);

      const approved: ExistingGeometry[] = [];
      if (pointFeatures.has(suggestion.feature_type)) {
        const point = approvedPoint(suggestion.feature_type, (hole ?? null) as HoleContext | null);
        if (point) approved.push({ geometry: 'point', coordinates: [point] });
      } else if (zoneFeatures.has(suggestion.feature_type)) {
        const { data, error } = await supabase
          .from('hole_zones')
          .select('zone_type, coordinates')
          .eq('course_id', suggestion.course_id)
          .eq('hole_number', suggestion.hole_number)
          .eq('zone_type', suggestion.feature_type);
        if (error) throw error;
        for (const row of data ?? []) {
          const coords = Array.isArray(row.coordinates) ? row.coordinates as SuggestionCoordinate[] : [];
          if (coords.length > 0) approved.push({ geometry: suggestion.feature_type === 'fairway_centreline' ? 'line' : 'polygon', coordinates: coords });
        }
      } else if (hazardFeatures.has(suggestion.feature_type)) {
        const { data, error } = await supabase
          .from('hazards')
          .select('type, coordinates, hole_number, hole_numbers')
          .eq('course_id', suggestion.course_id)
          .eq('type', suggestion.feature_type);
        if (error) throw error;
        for (const row of data ?? []) {
          const applies = row.hole_number === suggestion.hole_number
            || (Array.isArray(row.hole_numbers) && row.hole_numbers.includes(suggestion.hole_number));
          const coords = Array.isArray(row.coordinates) ? row.coordinates as SuggestionCoordinate[] : [];
          if (applies && coords.length > 0) approved.push({ geometry: 'polygon', coordinates: coords });
        }
      }
      setExisting(approved);
    } catch (error: any) {
      Alert.alert('Preview Error', error?.message ?? 'Could not load approved geometry for comparison.');
      setExisting([]);
    } finally {
      setLoading(false);
    }
  }, [suggestion.course_id, suggestion.feature_type, suggestion.hole_number]);

  useEffect(() => { void loadContext(); }, [loadContext]);

  const contextPoints = useMemo(() => {
    if (!holeContext) return [] as Array<{ label: string; point: SuggestionCoordinate }>;
    const rows: Array<{ label: string; point: SuggestionCoordinate | null }> = [
      { label: 'Tee', point: validPair(holeContext.tee_lat, holeContext.tee_lng) },
      { label: 'Green front', point: validPair(holeContext.green_front_lat, holeContext.green_front_lng) },
      { label: 'Green centre', point: validPair(holeContext.green_mid_lat, holeContext.green_mid_lng) },
      { label: 'Green back', point: validPair(holeContext.green_back_lat, holeContext.green_back_lng) },
    ];
    return rows.filter((row): row is { label: string; point: SuggestionCoordinate } => row.point != null);
  }, [holeContext]);

  const allMapPoints = useMemo(() => [
    ...coordinates,
    ...existing.flatMap(item => item.coordinates),
    ...contextPoints.map(item => item.point),
  ], [contextPoints, coordinates, existing]);

  useEffect(() => {
    if (allMapPoints.length === 0) return;
    const timer = setTimeout(() => {
      if (allMapPoints.length === 1) {
        mapRef.current?.animateToRegion({
          latitude: allMapPoints[0].lat,
          longitude: allMapPoints[0].lng,
          latitudeDelta: 0.0025,
          longitudeDelta: 0.0025,
        }, 300);
      } else {
        mapRef.current?.fitToCoordinates(allMapPoints.map(toMapCoordinate), {
          edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
          animated: true,
        });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [allMapPoints]);

  const updateCoordinate = (index: number, coordinate: LatLng) => {
    setCoordinates(current => current.map((point, pointIndex) => pointIndex === index
      ? { lat: coordinate.latitude, lng: coordinate.longitude }
      : point));
  };

  const dirty = JSON.stringify(coordinates) !== JSON.stringify(suggestion.coordinates);
  const editedSuggestion = useMemo(() => ({ ...suggestion, coordinates }), [coordinates, suggestion]);
  const validation = useMemo(() => validateMappingSuggestion(editedSuggestion), [editedSuggestion]);

  const saveEdits = async () => {
    if (!dirty || saving || !validation.valid) return;
    setSaving(true);
    const { error } = await supabase.from('course_mapping_suggestions').update({
      coordinates,
      updated_at: new Date().toISOString(),
    }).eq('id', suggestion.id).eq('review_status', 'pending');
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    onSaved(coordinates);
    setEditing(false);
  };

  const suggestedMapCoordinates = coordinates.map(toMapCoordinate);

  return (
    <View style={styles.wrap}>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.green }]} /><Text style={styles.legendText}>Suggested</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.blue }]} /><Text style={styles.legendText}>Approved</Text></View>
        <Text style={styles.hint}>{editing ? 'Drag the suggested vertices' : 'Satellite comparison'}</Text>
      </View>

      <View style={styles.mapFrame}>
        {loading ? <ActivityIndicator color={Colors.green} style={styles.loader} /> : (
          <MapView ref={mapRef} provider={PROVIDER_GOOGLE} mapType="satellite" style={StyleSheet.absoluteFillObject}>
            {contextPoints.map(item => <Marker key={item.label} coordinate={toMapCoordinate(item.point)} title={item.label} pinColor={Colors.blue} opacity={0.55} />)}

            {existing.map((item, index) => item.geometry === 'point'
              ? <Marker key={`approved-${index}`} coordinate={toMapCoordinate(item.coordinates[0])} title="Approved" pinColor={Colors.blue} />
              : item.geometry === 'line'
                ? <Polyline key={`approved-${index}`} coordinates={item.coordinates.map(toMapCoordinate)} strokeColor={Colors.blue} strokeWidth={5} />
                : <Polygon key={`approved-${index}`} coordinates={item.coordinates.map(toMapCoordinate)} strokeColor={Colors.blue} fillColor={Colors.blueMuted} strokeWidth={3} />)}

            {suggestion.geometry_type === 'point' && suggestedMapCoordinates[0] ? (
              <Marker
                coordinate={suggestedMapCoordinates[0]}
                title="Suggested"
                pinColor={Colors.green}
                draggable={editing}
                onDragEnd={event => updateCoordinate(0, event.nativeEvent.coordinate)}
              />
            ) : suggestion.geometry_type === 'line' ? (
              <Polyline coordinates={suggestedMapCoordinates} strokeColor={Colors.green} strokeWidth={5} />
            ) : (
              <Polygon coordinates={suggestedMapCoordinates} strokeColor={Colors.green} fillColor={Colors.greenMuted} strokeWidth={3} />
            )}

            {editing && suggestion.geometry_type !== 'point' && suggestedMapCoordinates.map((point, index) => (
              <Marker
                key={`edit-${index}`}
                coordinate={point}
                title={`Vertex ${index + 1}`}
                pinColor={Colors.green}
                draggable
                onDragEnd={event => updateCoordinate(index, event.nativeEvent.coordinate)}
              />
            ))}
          </MapView>
        )}
      </View>

      {validation.errors.map((error, index) => <Text key={index} style={styles.errorText}>✕ {error}</Text>)}
      <View style={styles.actions}>
        {editing ? (
          <>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => { setCoordinates(suggestion.coordinates); setEditing(false); }} disabled={saving}>
              <Text style={styles.secondaryText}>Cancel edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton, (!dirty || !validation.valid || saving) && styles.disabled]} onPress={() => void saveEdits()} disabled={!dirty || !validation.valid || saving}>
              {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.primaryText}>Save corrected shape</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setEditing(true)}>
            <Text style={styles.secondaryText}>Edit before approval</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.xs },
  hint: { flex: 1, textAlign: 'right', color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  mapFrame: { height: 310, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2 },
  loader: { flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  secondaryButton: { flex: 1, minHeight: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface3 },
  secondaryText: { color: Colors.textSecondary, fontFamily: Font.bold, fontSize: FontSize.sm },
  primaryButton: { flex: 1.3, minHeight: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green },
  primaryText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.sm },
  errorText: { marginTop: Spacing.sm, color: Colors.red, fontFamily: Font.regular, fontSize: FontSize.xs },
  disabled: { opacity: 0.45 },
});
