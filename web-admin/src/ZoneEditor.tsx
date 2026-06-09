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
  DrawingManager,
  GoogleMap,
  LoadScript,
  Marker,
  Polygon,
} from '@react-google-maps/api';
import { supabase } from './lib/supabase';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
const LIBS: ('drawing')[] = ['drawing'];

type LatLng = { lat: number; lng: number };
type ZoneType = 'green' | 'fairway';

type Course = { id: string; name: string };
type Hole = {
  id: string;
  number: number;
  par: number;
  tee_lat: number | null;
  tee_lng: number | null;
  green_mid_lat: number | null;
  green_mid_lng: number | null;
};
type HoleZone = {
  id: string;
  course_id: string;
  hole_number: number;
  zone_type: ZoneType;
  coordinates: LatLng[];
};

const MAP_OPTIONS: google.maps.MapOptions = {
  mapTypeId: 'satellite',
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  rotateControl: false,
  tilt: 0,
  clickableIcons: false,
};

export default function ZoneEditor() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [holes, setHoles] = useState<Hole[]>([]);
  const [holeNumber, setHoleNumber] = useState<number | null>(null);
  const [allZones, setAllZones] = useState<HoleZone[]>([]);
  const [drawing, setDrawing] = useState<ZoneType | null>(null);
  const [saving, setSaving] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);

  const mapRef = useRef<google.maps.Map | null>(null);
  // Always-current ref so polygon edit listeners never capture stale saveZone
  const saveZoneRef = useRef<(t: ZoneType, c: LatLng[]) => Promise<void>>(async () => {});

  const hole = holes.find(h => h.number === holeNumber) ?? null;
  const holeZones = allZones.filter(z => z.hole_number === holeNumber);
  const greenZone = holeZones.find(z => z.zone_type === 'green');
  const fairwayZone = holeZones.find(z => z.zone_type === 'fairway');

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
      .select('id, number, par, tee_lat, tee_lng, green_mid_lat, green_mid_lng')
      .eq('course_id', courseId)
      .order('number')
      .then(({ data }) => {
        const list = (data ?? []) as Hole[];
        setHoles(list);
        if (list.length > 0) setHoleNumber(list[0].number);
      });
  }, [courseId]);

  useEffect(() => {
    if (!courseId) { setAllZones([]); return; }
    supabase
      .from('hole_zones')
      .select('id, course_id, hole_number, zone_type, coordinates')
      .eq('course_id', courseId)
      .then(({ data }) => setAllZones((data ?? []) as HoleZone[]));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole?.id]);

  // Esc cancels drawing
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawing(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Persistence ─────────────────────────────────────────────────

  const saveZone = useCallback(async (type: ZoneType, coords: LatLng[]) => {
    if (!courseId || holeNumber == null) return;
    setSaving(true);
    const existing = allZones.find(z => z.hole_number === holeNumber && z.zone_type === type);
    const payload = { course_id: courseId, hole_number: holeNumber, zone_type: type, coordinates: coords };
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
  }, [courseId, holeNumber, allZones]);

  useEffect(() => { saveZoneRef.current = saveZone; }, [saveZone]);

  const clearZone = useCallback(async (type: ZoneType) => {
    const z = allZones.find(x => x.hole_number === holeNumber && x.zone_type === type);
    if (!z) return;
    await supabase.from('hole_zones').delete().eq('id', z.id);
    setAllZones(prev => prev.filter(x => x.id !== z.id));
  }, [allZones, holeNumber]);

  // ── Drawing ──────────────────────────────────────────────────────

  const onPolygonComplete = useCallback((polygon: google.maps.Polygon) => {
    const path = polygon.getPath();
    const coords: LatLng[] = Array.from({ length: path.getLength() }, (_, i) => ({
      lat: path.getAt(i).lat(),
      lng: path.getAt(i).lng(),
    }));
    polygon.setMap(null); // remove the draw overlay; we render our own Polygon
    if (drawing) void saveZoneRef.current(drawing, coords);
    setDrawing(null);
  }, [drawing]);

  // After drawing, polygons are editable — attach listeners to capture vertex drags
  const attachEditListeners = useCallback((polygon: google.maps.Polygon, type: ZoneType) => {
    const sync = () => {
      const path = polygon.getPath();
      const coords: LatLng[] = Array.from({ length: path.getLength() }, (_, i) => ({
        lat: path.getAt(i).lat(),
        lng: path.getAt(i).lng(),
      }));
      void saveZoneRef.current(type, coords);
    };
    const path = polygon.getPath();
    path.addListener('set_at', sync);
    path.addListener('insert_at', sync);
    path.addListener('remove_at', sync);
  }, []);

  const onGreenLoad = useCallback((p: google.maps.Polygon) => {
    attachEditListeners(p, 'green');
  }, [attachEditListeners]);

  const onFairwayLoad = useCallback((p: google.maps.Polygon) => {
    attachEditListeners(p, 'fairway');
  }, [attachEditListeners]);

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
    <LoadScript googleMapsApiKey={API_KEY} libraries={LIBS} onLoad={() => setMapsReady(true)}>
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
              {/* Green */}
              <button
                disabled={!hole}
                style={{
                  ...S.zoneBtn,
                  background: drawing === 'green' ? '#4caf50' : greenZone ? 'rgba(76,175,80,0.15)' : 'transparent',
                  borderColor: drawing === 'green' || greenZone ? '#4caf50' : '#333',
                  color: drawing === 'green' ? '#000' : greenZone ? '#4caf50' : '#888',
                }}
                onClick={() => setDrawing(d => d === 'green' ? null : 'green')}
              >
                {drawing === 'green' ? '✏ Drawing…'
                  : greenZone ? `✓ Green  (${greenZone.coordinates.length} pts)`
                  : '＋ Draw Green'}
              </button>
              {greenZone && drawing !== 'green' && (
                <button style={S.clearBtn} title="Clear green" onClick={() => clearZone('green')}>✕</button>
              )}

              <div style={S.divider} />

              {/* Fairway */}
              <button
                disabled={!hole}
                style={{
                  ...S.zoneBtn,
                  background: drawing === 'fairway' ? '#ffc107' : fairwayZone ? 'rgba(255,193,7,0.12)' : 'transparent',
                  borderColor: drawing === 'fairway' || fairwayZone ? '#ffc107' : '#333',
                  color: drawing === 'fairway' ? '#000' : fairwayZone ? '#ffc107' : '#888',
                }}
                onClick={() => setDrawing(d => d === 'fairway' ? null : 'fairway')}
              >
                {drawing === 'fairway' ? '✏ Drawing…'
                  : fairwayZone ? `✓ Fairway  (${fairwayZone.coordinates.length} pts)`
                  : '＋ Draw Fairway'}
              </button>
              {fairwayZone && drawing !== 'fairway' && (
                <button style={S.clearBtn} title="Clear fairway" onClick={() => clearZone('fairway')}>✕</button>
              )}

              {saving && <span style={S.savingBadge}>Saving…</span>}
            </div>
          </div>

          {drawing && (
            <div style={S.drawHint}>
              Click to place vertices · Double-click or click the first point to close the polygon · <kbd>Esc</kbd> to cancel
            </div>
          )}

          <GoogleMap
            mapContainerStyle={{ flex: 1 }}
            center={mapCenter}
            zoom={19}
            options={MAP_OPTIONS}
            onLoad={map => { mapRef.current = map; }}
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
            {hole?.green_mid_lat != null && (
              <Marker
                position={{ lat: hole.green_mid_lat, lng: hole.green_mid_lng! }}
                title="Green centre"
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#fff',
                  fillOpacity: 1,
                  strokeColor: '#4caf50',
                  strokeWeight: 2.5,
                }}
              />
            )}
            {hole?.tee_lat != null && (
              <Marker
                position={{ lat: hole.tee_lat, lng: hole.tee_lng! }}
                title="Tee"
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 6,
                  fillColor: '#fff',
                  fillOpacity: 0.8,
                  strokeColor: '#aaa',
                  strokeWeight: 2,
                }}
              />
            )}
            {mapsReady && drawing && (
              <DrawingManager
                drawingMode={'polygon' as google.maps.drawing.OverlayType}
                options={{
                  drawingControl: false,
                  polygonOptions: {
                    fillColor: drawing === 'green' ? '#4caf50' : '#ffc107',
                    fillOpacity: 0.25,
                    strokeColor: drawing === 'green' ? '#4caf50' : '#ffc107',
                    strokeWeight: 2,
                    editable: false,
                    clickable: false,
                  },
                }}
                onPolygonComplete={onPolygonComplete}
              />
            )}
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
  mapArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toolbar: {
    padding: '0 16px',
    height: 52,
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
    display: 'flex', alignItems: 'center', gap: 6,
  },
  zoneBtn: {
    padding: '6px 14px', borderRadius: 20,
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
};
