import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: '#f87171', fontSize: 16, fontWeight: 700 }}>Map error</div>
          <div style={{ color: '#888', fontSize: 13, maxWidth: 480, textAlign: 'center' }}>{this.state.error}</div>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 8, padding: '8px 20px', background: '#4caf50', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer' }}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

import {
  GoogleMap,
  LoadScript,
  Marker,
  Polygon,
} from '@react-google-maps/api';
import { supabase } from './lib/supabase';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

type LatLng = { lat: number; lng: number };
type PrimaryZoneType = 'green' | 'fairway';
type HazardType = 'bunker' | 'water' | 'trees' | 'ob' | 'red_zone';
type DrawingType = PrimaryZoneType | HazardType;

type Course = { id: string; name: string };
type Hole = {
  id: string;
  number: number;
  par: number;
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
  zone_type: PrimaryZoneType;
  coordinates: LatLng[];
};
type Hazard = {
  id: string;
  course_id: string;
  hole_number: number | null;
  hole_numbers: number[] | null;
  type: HazardType;
  label: string | null;
  coordinates: LatLng[];
};

const ZONE_CONFIG: Record<DrawingType, {
  label: string;
  color: string;
  fillOpacity: number;
}> = {
  green: { label: 'Green', color: '#4caf50', fillOpacity: 0.25 },
  fairway: { label: 'Fairway', color: '#ffc107', fillOpacity: 0.15 },
  bunker: { label: 'Bunker', color: '#f5d76e', fillOpacity: 0.3 },
  water: { label: 'Water', color: '#42a5f5', fillOpacity: 0.3 },
  trees: { label: 'Trees', color: '#2e7d32', fillOpacity: 0.28 },
  ob: { label: 'Out of Bounds', color: '#ffffff', fillOpacity: 0.08 },
  red_zone: { label: 'Red Penalty', color: '#ef5350', fillOpacity: 0.25 },
};

const PRIMARY_TYPES: PrimaryZoneType[] = ['green', 'fairway'];
const HAZARD_TYPES: HazardType[] = ['bunker', 'water', 'red_zone', 'ob', 'trees'];

function isPrimaryZone(type: DrawingType): type is PrimaryZoneType {
  return type === 'green' || type === 'fairway';
}

const MAP_OPTIONS: google.maps.MapOptions = {
  mapTypeId: 'satellite',
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  rotateControl: false,
  tilt: 0,
  clickableIcons: false,
  disableDoubleClickZoom: true,
};

export default function ZoneEditor() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [holes, setHoles] = useState<Hole[]>([]);
  const [holeNumber, setHoleNumber] = useState<number | null>(null);
  const [allZones, setAllZones] = useState<HoleZone[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [drawing, setDrawing] = useState<DrawingType | null>(null);
  const [draftCoords, setDraftCoords] = useState<LatLng[]>([]);
  const [hazardHoleNumbers, setHazardHoleNumbers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingPoint, setSavingPoint] = useState<string | null>(null);

  const mapRef = useRef<google.maps.Map | null>(null);
  // Always-current ref so polygon edit listeners never capture stale saveZone
  const saveDrawingRef = useRef<(t: DrawingType, c: LatLng[]) => Promise<void>>(async () => {});

  const hole = holes.find(h => h.number === holeNumber) ?? null;
  const holeZones = allZones.filter(z => z.hole_number === holeNumber);
  const greenZone = holeZones.find(z => z.zone_type === 'green');
  const fairwayZone = holeZones.find(z => z.zone_type === 'fairway');
  const holeHazards = hazards.filter(hazard =>
    (hazard.hole_number == null && (!hazard.hole_numbers || hazard.hole_numbers.length === 0))
    || hazard.hole_number === holeNumber
    || hazard.hole_numbers?.includes(holeNumber ?? -1)
  );

  // ── Data loading ────────────────────────────────────────────────

  useEffect(() => {
    supabase.from('courses').select('id, name').order('name').then(({ data }) => {
      const list = (data ?? []) as Course[];
      setCourses(list);
      if (list.length === 1) setCourseId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!courseId) return;
    setHoles([]);
    setHoleNumber(null);
    supabase
      .from('holes')
      .select('id, number, par, tee_lat, tee_lng, green_front_lat, green_front_lng, green_mid_lat, green_mid_lng, green_back_lat, green_back_lng')
      .eq('course_id', courseId)
      .order('number')
      .then(({ data }) => {
        const list = (data ?? []) as Hole[];
        setHoles(list);
        if (list.length > 0) setHoleNumber(list[0].number);
      });
  }, [courseId]);

  useEffect(() => {
    if (!courseId) {
      setAllZones([]);
      setHazards([]);
      return;
    }
    Promise.all([
      supabase
        .from('hole_zones')
        .select('id, course_id, hole_number, zone_type, coordinates')
        .eq('course_id', courseId),
      supabase
        .from('hazards')
        .select('id, course_id, hole_number, hole_numbers, type, label, coordinates')
        .eq('course_id', courseId),
    ]).then(([zonesResult, hazardsResult]) => {
      setAllZones((zonesResult.data ?? []) as HoleZone[]);
      setHazards((hazardsResult.data ?? []) as Hazard[]);
    });
  }, [courseId]);

  // Centre map on selected hole
  useEffect(() => {
    if (!hole || !mapRef.current) return;
    const centre = hole.green_mid_lat != null
      ? { lat: hole.green_mid_lat, lng: hole.green_mid_lng! }
      : hole.tee_lat != null
        ? { lat: hole.tee_lat, lng: hole.tee_lng! }
        : null;
    if (centre) {
      mapRef.current.panTo(centre);
      mapRef.current.setZoom(19);
    }
    setDrawing(null);
    setDraftCoords([]);
    setHazardHoleNumbers([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole?.id]);

  // Cursor crosshair while drawing
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setOptions({ draggableCursor: drawing ? 'crosshair' : '' });
  }, [drawing]);

  // ── Persistence ─────────────────────────────────────────────────

  const saveDrawing = useCallback(async (type: DrawingType, coords: LatLng[]) => {
    if (!courseId || holeNumber == null) return;
    setSaving(true);
    if (!isPrimaryZone(type)) {
      const assignedHoles = hazardHoleNumbers.length > 0
        ? hazardHoleNumbers
        : [holeNumber];
      const { data, error } = await supabase
        .from('hazards')
        .insert({
          course_id: courseId,
          hole_number: assignedHoles.length === 1 ? assignedHoles[0] : null,
          hole_numbers: assignedHoles,
          type,
          label: null,
          coordinates: coords,
        })
        .select()
        .single();
      setSaving(false);
      if (error) { alert('Save failed: ' + error.message); return; }
      setHazards(prev => [...prev, data as Hazard]);
      return;
    }

    const existing = allZones.find(zone =>
      zone.hole_number === holeNumber && zone.zone_type === type
    );
    const payload = {
      course_id: courseId,
      hole_number: holeNumber,
      zone_type: type,
      coordinates: coords,
    };
    const { data, error } = existing
      ? await supabase.from('hole_zones').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('hole_zones').insert(payload).select().single();
    setSaving(false);
    if (error) { alert('Save failed: ' + error.message); return; }
    const saved = data as HoleZone;
    setAllZones(prev => [
      ...prev.filter(z => !(z.hole_number === holeNumber && z.zone_type === type)),
      saved,
    ]);
  }, [courseId, holeNumber, allZones, hazardHoleNumbers]);

  useEffect(() => { saveDrawingRef.current = saveDrawing; }, [saveDrawing]);

  const clearZone = useCallback(async (type: PrimaryZoneType) => {
    const z = allZones.find(x => x.hole_number === holeNumber && x.zone_type === type);
    if (!z) return;
    await supabase.from('hole_zones').delete().eq('id', z.id);
    setAllZones(prev => prev.filter(x => x.id !== z.id));
  }, [allZones, holeNumber]);

  const deleteHazard = useCallback(async (hazard: Hazard) => {
    if (!confirm(`Delete this ${ZONE_CONFIG[hazard.type].label.toLowerCase()} polygon?`)) return;
    const { error } = await supabase.from('hazards').delete().eq('id', hazard.id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    setHazards(prev => prev.filter(item => item.id !== hazard.id));
  }, []);

  const toggleHazardHole = useCallback((number: number) => {
    setHazardHoleNumbers(current => {
      if (current.includes(number)) {
        if (current.length === 1) return current;
        return current.filter(item => item !== number);
      }
      return [...current, number].sort((a, b) => a - b);
    });
  }, []);

  const saveHolePoint = useCallback(async (
    field: 'tee' | 'green_front' | 'green_mid' | 'green_back',
    position: LatLng,
  ) => {
    if (!hole) return;
    setSavingPoint(field);
    const update = {
      [`${field}_lat`]: position.lat,
      [`${field}_lng`]: position.lng,
    };
    const { error } = await supabase.from('holes').update(update).eq('id', hole.id);
    setSavingPoint(null);
    if (error) {
      alert('Location save failed: ' + error.message);
      return;
    }
    setHoles(prev => prev.map(item => item.id === hole.id ? { ...item, ...update } : item));
  }, [hole]);

  // ── Drawing ──────────────────────────────────────────────────────

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!drawing || !e.latLng) return;
    setDraftCoords(prev => [...prev, { lat: e.latLng!.lat(), lng: e.latLng!.lng() }]);
  }, [drawing]);

  const finishDrawing = useCallback((removeDoubleClickPoint = false) => {
    if (!drawing || saving) return;
    const coords = removeDoubleClickPoint && draftCoords.length > 1
      ? draftCoords.slice(0, -1)
      : draftCoords;
    if (coords.length < 3) return;

    const type = drawing;
    setDrawing(null);
    setDraftCoords([]);
    void saveDrawingRef.current(type, coords);
  }, [draftCoords, drawing, saving]);

  // dblclick fires a click event immediately before it, so slice off that last point
  const onMapDblClick = useCallback((_e: google.maps.MapMouseEvent) => {
    finishDrawing(true);
  }, [finishDrawing]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!drawing) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        finishDrawing();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawing(null);
        setDraftCoords([]);
        return;
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && draftCoords.length > 0) {
        event.preventDefault();
        setDraftCoords(coords => coords.slice(0, -1));
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [draftCoords.length, drawing, finishDrawing]);

  // After saving, polygons are editable — attach listeners to capture vertex drags
  const attachZoneEditListeners = useCallback((
    polygon: google.maps.Polygon,
    type: PrimaryZoneType,
  ) => {
    const sync = () => {
      const path = polygon.getPath();
      const coords: LatLng[] = Array.from({ length: path.getLength() }, (_, i) => ({
        lat: path.getAt(i).lat(),
        lng: path.getAt(i).lng(),
      }));
      void saveDrawingRef.current(type, coords);
    };
    const path = polygon.getPath();
    path.addListener('set_at', sync);
    path.addListener('insert_at', sync);
    path.addListener('remove_at', sync);
  }, []);

  const onGreenLoad = useCallback((p: google.maps.Polygon) => {
    attachZoneEditListeners(p, 'green');
  }, [attachZoneEditListeners]);

  const onFairwayLoad = useCallback((p: google.maps.Polygon) => {
    attachZoneEditListeners(p, 'fairway');
  }, [attachZoneEditListeners]);

  const attachHazardEditListeners = useCallback((
    polygon: google.maps.Polygon,
    hazardId: string,
  ) => {
    const sync = async () => {
      const path = polygon.getPath();
      const coordinates: LatLng[] = Array.from({ length: path.getLength() }, (_, index) => ({
        lat: path.getAt(index).lat(),
        lng: path.getAt(index).lng(),
      }));
      const { error } = await supabase
        .from('hazards')
        .update({ coordinates })
        .eq('id', hazardId);
      if (error) {
        alert('Save failed: ' + error.message);
        return;
      }
      setHazards(prev => prev.map(hazard =>
        hazard.id === hazardId ? { ...hazard, coordinates } : hazard
      ));
    };
    const path = polygon.getPath();
    path.addListener('set_at', sync);
    path.addListener('insert_at', sync);
    path.addListener('remove_at', sync);
  }, []);

  // ── Sidebar status ───────────────────────────────────────────────

  const holeStatus = useMemo(() => {
    const m: Record<number, { green: boolean; fairway: boolean }> = {};
    allZones.forEach(z => {
      m[z.hole_number] ??= { green: false, fairway: false };
      if (z.zone_type === 'green') m[z.hole_number].green = true;
      if (z.zone_type === 'fairway') m[z.hole_number].fairway = true;
    });
    return m;
  }, [allZones]);

  const mappedCount = Object.values(holeStatus).filter(s => s.green && s.fairway).length;

  const mapCenter: LatLng = hole?.green_mid_lat != null
    ? { lat: hole.green_mid_lat, lng: hole.green_mid_lng! }
    : { lat: -26.6317, lng: 152.9587 };

  // ── Render ───────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
    <LoadScript googleMapsApiKey={API_KEY}>
      <div style={S.root}>

        {/* ── Sidebar ──────────────────────────────────────────── */}
        <div style={S.sidebar}>
          <div style={S.sidebarHeader}>
            <span style={S.logo}>⛳ Zone Admin</span>
            <button style={S.signOut} onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>

          <div style={S.sidebarBody}>
            <div style={S.sectionLabel}>COURSE</div>
            <select style={S.select} value={courseId} onChange={e => setCourseId(e.target.value)}>
              <option value=''>Select…</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {holes.length > 0 && (
              <>
                <div style={{ ...S.sectionLabel, marginTop: 24 }}>
                  HOLES
                  <span style={S.mappedBadge}>{mappedCount}/{holes.length} full</span>
                </div>
                <div style={S.holeList}>
                  {holes.map(h => {
                    const st = holeStatus[h.number] ?? { green: false, fairway: false };
                    const active = h.number === holeNumber;
                    return (
                      <button
                        key={h.id}
                        style={{ ...S.holeBtn, ...(active ? S.holeBtnActive : {}) }}
                        onClick={() => setHoleNumber(h.number)}
                      >
                        <span style={S.holeNum}>H{h.number}</span>
                        <span style={S.holePar}>Par {h.par}</span>
                        <span style={S.dots}>
                          <span title="Green" style={{ color: st.green ? '#4caf50' : '#2a2a2a', fontSize: 18 }}>●</span>
                          <span title="Fairway" style={{ color: st.fairway ? '#ffc107' : '#2a2a2a', fontSize: 18 }}>●</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {hole && (
                  <>
                    <div style={{ ...S.sectionLabel, marginTop: 24 }}>
                      H{hole.number} HAZARDS
                      <span style={S.mappedBadge}>{holeHazards.length}</span>
                    </div>
                    {holeHazards.length === 0 ? (
                      <div style={S.emptyHazards}>No hazards mapped</div>
                    ) : (
                      <div style={S.hazardList}>
                        {holeHazards.map(hazard => (
                          <div key={hazard.id} style={S.hazardRow}>
                            <span
                              style={{
                                ...S.hazardDot,
                                background: ZONE_CONFIG[hazard.type].color,
                              }}
                            />
                            <span style={S.hazardName}>
                              {hazard.label || ZONE_CONFIG[hazard.type].label}
                              {hazard.hole_number == null
                                && (!hazard.hole_numbers || hazard.hole_numbers.length === 0)
                                ? ' (course-wide)'
                                : hazard.hole_numbers && hazard.hole_numbers.length > 1
                                  ? ` (H${hazard.hole_numbers.join(', H')})`
                                  : ''}
                            </span>
                            <button
                              style={S.hazardDelete}
                              title="Delete polygon"
                              onClick={() => void deleteHazard(hazard)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Map area ─────────────────────────────────────────── */}
        <div style={S.mapArea}>

          {/* Toolbar */}
          <div style={S.toolbar}>
            <span style={S.holeTitle}>
              {hole ? `Hole ${hole.number}  ·  Par ${hole.par}` : 'Select a hole to start'}
            </span>
            <div style={S.toolbarActions}>
              {PRIMARY_TYPES.map(type => {
                const existing = type === 'green' ? greenZone : fairwayZone;
                const config = ZONE_CONFIG[type];
                return (
                  <div key={type} style={S.toolGroup}>
                    <button
                      disabled={!hole}
                      style={{
                        ...S.zoneBtn,
                        background: drawing === type
                          ? config.color
                          : existing ? `${config.color}22` : 'transparent',
                        borderColor: drawing === type || existing ? config.color : '#333',
                        color: drawing === type ? '#000' : existing ? config.color : '#888',
                      }}
                      onClick={() => {
                        setDrawing(current => current === type ? null : type);
                        setDraftCoords([]);
                        setHazardHoleNumbers([]);
                      }}
                    >
                      {drawing === type
                        ? `Drawing ${config.label} (${draftCoords.length})`
                        : existing ? `✓ ${config.label}`
                        : `+ ${config.label}`}
                    </button>
                    {existing && drawing !== type && (
                      <button
                        style={S.clearBtn}
                        title={`Clear ${config.label.toLowerCase()}`}
                        onClick={() => void clearZone(type)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}

              <div style={S.divider} />

              {HAZARD_TYPES.map(type => {
                const config = ZONE_CONFIG[type];
                return (
                  <button
                    key={type}
                    disabled={!hole}
                    style={{
                      ...S.zoneBtn,
                      background: drawing === type ? config.color : 'transparent',
                      borderColor: drawing === type ? config.color : '#333',
                      color: drawing === type
                        ? type === 'ob' ? '#000' : '#111'
                        : config.color,
                    }}
                    onClick={() => {
                      setDrawing(current => {
                        const next = current === type ? null : type;
                        setHazardHoleNumbers(next && holeNumber != null ? [holeNumber] : []);
                        return next;
                      });
                      setDraftCoords([]);
                    }}
                  >
                    {drawing === type
                      ? `Drawing ${config.label} (${draftCoords.length})`
                      : `+ ${config.label}`}
                  </button>
                );
              })}

              {saving && <span style={S.savingBadge}>Saving...</span>}
              {savingPoint && (
                <span style={S.savingBadge}>
                  Saving {savingPoint.replace(/_/g, ' ')}...
                </span>
              )}
            </div>
          </div>

          <div style={S.pointHint}>
            Drag T, F, M, or B markers to update tee and green locations.
          </div>

          {drawing && !isPrimaryZone(drawing) && (
            <div style={S.holeAssignment}>
              <span style={S.assignmentLabel}>Applies to holes</span>
              <button
                style={{
                  ...S.assignmentAll,
                  ...(hazardHoleNumbers.length === holes.length ? S.assignmentActive : {}),
                }}
                onClick={() => setHazardHoleNumbers(holes.map(item => item.number))}
              >
                All holes
              </button>
              <div style={S.assignmentHoles}>
                {holes.map(item => {
                  const selected = hazardHoleNumbers.includes(item.number);
                  return (
                    <button
                      key={item.id}
                      style={{
                        ...S.assignmentHole,
                        ...(selected ? S.assignmentActive : {}),
                      }}
                      onClick={() => toggleHazardHole(item.number)}
                    >
                      {item.number}
                    </button>
                  );
                })}
              </div>
              <span style={S.assignmentSummary}>
                {hazardHoleNumbers.length === holes.length
                  ? 'All holes selected'
                  : `Holes ${hazardHoleNumbers.join(', ')}`}
              </span>
            </div>
          )}

          {drawing && (
            <div style={S.drawHint}>
              Click to place vertices · <kbd>Enter</kbd> closes &amp; saves
              {' '}· double-click also works · <kbd>Backspace</kbd> undoes · <kbd>Esc</kbd> cancels
            </div>
          )}

          <GoogleMap
            mapContainerStyle={{ flex: 1 }}
            defaultCenter={mapCenter}
            defaultZoom={19}
            options={MAP_OPTIONS}
            onLoad={map => {
              mapRef.current = map;
              map.panTo(mapCenter);
              map.setZoom(19);
            }}
            onClick={onMapClick}
            onDblClick={onMapDblClick}
          >
            {greenZone && (
              <Polygon
                key={`green-${greenZone.id}`}
                paths={greenZone.coordinates}
                editable
                onLoad={onGreenLoad}
                options={{
                  fillColor: '#4caf50', fillOpacity: 0.25,
                  strokeColor: '#4caf50', strokeWeight: 2,
                  strokeOpacity: 0.9,
                }}
              />
            )}
            {fairwayZone && (
              <Polygon
                key={`fairway-${fairwayZone.id}`}
                paths={fairwayZone.coordinates}
                editable
                onLoad={onFairwayLoad}
                options={{
                  fillColor: '#ffc107', fillOpacity: 0.15,
                  strokeColor: '#ffc107', strokeWeight: 2,
                  strokeOpacity: 0.9,
                }}
              />
            )}
            {holeHazards.map(hazard => {
              const config = ZONE_CONFIG[hazard.type];
              return (
                <Polygon
                  key={`hazard-${hazard.id}`}
                  paths={hazard.coordinates}
                  editable
                  onLoad={polygon => attachHazardEditListeners(polygon, hazard.id)}
                  options={{
                    fillColor: config.color,
                    fillOpacity: config.fillOpacity,
                    strokeColor: config.color,
                    strokeWeight: hazard.type === 'ob' ? 3 : 2,
                    strokeOpacity: 0.95,
                    zIndex: hazard.type === 'trees' ? 1 : 2,
                  }}
                />
              );
            })}
            {hole?.green_mid_lat != null && (
              <Marker
                position={{ lat: hole.green_mid_lat, lng: hole.green_mid_lng! }}
                title="Green middle - drag to update"
                label={{ text: 'M', color: '#0f0f0f', fontWeight: '700' }}
                draggable={!drawing}
                onDragEnd={event => {
                  if (!event.latLng) return;
                  void saveHolePoint('green_mid', {
                    lat: event.latLng.lat(),
                    lng: event.latLng.lng(),
                  });
                }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 10,
                  fillColor: '#4caf50',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2.5,
                }}
              />
            )}
            {hole?.green_front_lat != null && (
              <Marker
                position={{ lat: hole.green_front_lat, lng: hole.green_front_lng! }}
                title="Green front - drag to update"
                label={{ text: 'F', color: '#0f0f0f', fontWeight: '700' }}
                draggable={!drawing}
                onDragEnd={event => {
                  if (!event.latLng) return;
                  void saveHolePoint('green_front', {
                    lat: event.latLng.lat(),
                    lng: event.latLng.lng(),
                  });
                }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 9,
                  fillColor: '#81c784',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2,
                }}
              />
            )}
            {hole?.green_back_lat != null && (
              <Marker
                position={{ lat: hole.green_back_lat, lng: hole.green_back_lng! }}
                title="Green back - drag to update"
                label={{ text: 'B', color: '#0f0f0f', fontWeight: '700' }}
                draggable={!drawing}
                onDragEnd={event => {
                  if (!event.latLng) return;
                  void saveHolePoint('green_back', {
                    lat: event.latLng.lat(),
                    lng: event.latLng.lng(),
                  });
                }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 9,
                  fillColor: '#2e7d32',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2,
                }}
              />
            )}
            {hole?.tee_lat != null && (
              <Marker
                position={{ lat: hole.tee_lat, lng: hole.tee_lng! }}
                title="Tee - drag to update"
                label={{ text: 'T', color: '#0f0f0f', fontWeight: '700' }}
                draggable={!drawing}
                onDragEnd={event => {
                  if (!event.latLng) return;
                  void saveHolePoint('tee', {
                    lat: event.latLng.lat(),
                    lng: event.latLng.lng(),
                  });
                }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 9,
                  fillColor: '#fff',
                  fillOpacity: 1,
                  strokeColor: '#aaa',
                  strokeWeight: 2,
                }}
              />
            )}

            {/* Draft polygon while drawing */}
            {drawing && draftCoords.length >= 2 && (
              <Polygon
                paths={draftCoords}
                options={{
                  fillColor: ZONE_CONFIG[drawing].color,
                  fillOpacity: ZONE_CONFIG[drawing].fillOpacity,
                  strokeColor: ZONE_CONFIG[drawing].color,
                  strokeWeight: 2,
                  strokeOpacity: 0.7,
                  clickable: false,
                  editable: false,
                }}
              />
            )}
            {/* Draft vertex dots */}
            {drawing && draftCoords.map((pt, i) => (
              <Marker
                key={`draft-${i}`}
                position={pt}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: i === 0 ? 6 : 4,
                  fillColor: ZONE_CONFIG[drawing].color,
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2,
                }}
              />
            ))}
          </GoogleMap>
        </div>
      </div>
    </LoadScript>
    </ErrorBoundary>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100vh',
    background: '#0f0f0f',
    color: '#fff',
    overflow: 'hidden',
  },
  sidebar: {
    width: 220,
    flexShrink: 0,
    background: '#141414',
    borderRight: '1px solid #222',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarHeader: {
    padding: '16px 14px',
    borderBottom: '1px solid #222',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  logo: { color: '#fff', fontWeight: 700, fontSize: 15 },
  signOut: {
    background: 'transparent', border: 'none', color: '#555',
    fontSize: 11, cursor: 'pointer', padding: '4px 6px',
    borderRadius: 4,
  },
  sidebarBody: {
    flex: 1, overflowY: 'auto', padding: '16px 12px',
  },
  sectionLabel: {
    color: '#555', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.8px', textTransform: 'uppercase',
    marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8,
  },
  mappedBadge: {
    color: '#4caf50', fontSize: 10, fontWeight: 600,
  },
  select: {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    background: '#1e1e1e', border: '1px solid #2a2a2a', color: '#ddd',
    fontSize: 13, cursor: 'pointer',
  },
  holeList: { display: 'flex', flexDirection: 'column', gap: 2 },
  holeBtn: {
    display: 'flex', alignItems: 'center', gap: 0,
    padding: '7px 8px', borderRadius: 6,
    background: 'transparent', border: '1px solid transparent',
    cursor: 'pointer', color: '#999', fontSize: 13, textAlign: 'left',
    width: '100%',
  },
  holeBtnActive: {
    background: '#1e1e1e', borderColor: '#2a2a2a', color: '#fff',
  },
  holeNum: { fontWeight: 700, width: 32, fontSize: 13, color: 'inherit' },
  holePar: { flex: 1, color: '#555', fontSize: 11 },
  dots: { display: 'flex', gap: 3, lineHeight: 1 },
  emptyHazards: {
    color: '#555', fontSize: 11, padding: '6px 8px',
  },
  hazardList: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  hazardRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 8px', borderRadius: 6,
    background: '#1b1b1b', border: '1px solid #242424',
  },
  hazardDot: {
    width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
  },
  hazardName: {
    flex: 1, color: '#aaa', fontSize: 11,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  hazardDelete: {
    width: 22, height: 22, borderRadius: '50%',
    background: 'transparent', border: '1px solid #333',
    color: '#777', cursor: 'pointer', lineHeight: 1,
  },
  mapArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toolbar: {
    padding: '8px 16px',
    minHeight: 52,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#141414',
    borderBottom: '1px solid #222',
    gap: 12,
    flexShrink: 0,
  },
  holeTitle: {
    color: '#aaa', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
  },
  toolbarActions: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
    gap: 6, flexWrap: 'wrap',
  },
  toolGroup: {
    display: 'flex', alignItems: 'center', gap: 4,
  },
  zoneBtn: {
    padding: '6px 11px', borderRadius: 20,
    border: '1px solid',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  clearBtn: {
    width: 26, height: 26, borderRadius: '50%',
    background: 'transparent', border: '1px solid #333',
    color: '#555', fontSize: 11, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  divider: {
    width: 1, height: 20, background: '#2a2a2a', margin: '0 4px',
  },
  savingBadge: {
    color: '#4caf50', fontSize: 11, marginLeft: 8,
  },
  drawHint: {
    background: 'rgba(76,175,80,0.12)',
    borderBottom: '1px solid rgba(76,175,80,0.3)',
    padding: '8px 16px',
    fontSize: 12, color: '#4caf50',
    flexShrink: 0,
  },
  pointHint: {
    background: 'rgba(255,255,255,0.05)',
    borderBottom: '1px solid #222',
    padding: '6px 16px',
    fontSize: 11,
    color: '#888',
    flexShrink: 0,
  },
  holeAssignment: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 16px',
    background: '#171717',
    borderBottom: '1px solid #292929',
    flexShrink: 0,
    overflowX: 'auto',
  },
  assignmentLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    marginRight: 4,
  },
  assignmentAll: {
    padding: '5px 10px',
    borderRadius: 14,
    background: '#222',
    border: '1px solid #333',
    color: '#aaa',
    fontSize: 11,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  assignmentHoles: {
    display: 'flex',
    gap: 4,
  },
  assignmentHole: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#222',
    border: '1px solid #333',
    color: '#888',
    fontSize: 11,
    cursor: 'pointer',
  },
  assignmentActive: {
    background: '#42a5f5',
    borderColor: '#42a5f5',
    color: '#0f0f0f',
    fontWeight: 700,
  },
  assignmentSummary: {
    color: '#42a5f5',
    fontSize: 11,
    whiteSpace: 'nowrap',
    marginLeft: 4,
  },
};
