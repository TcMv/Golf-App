import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GoogleMap,
  LoadScript,
  Marker,
  Polygon,
  Polyline,
} from '@react-google-maps/api';
import {
  buildCaddieAdvice,
  buildCaddiePrompt,
  detectCaddieLie,
} from './lib/caddieEngine';
import type {
  CaddieAdvice,
  CaddieZone,
  Club,
  Coordinate,
  Hazard,
  HazardType,
} from './lib/caddieEngine';
import { supabase } from './lib/supabase';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

type Course = { id: string; name: string; lat: number; lng: number };
type Hole = {
  id: string;
  number: number;
  par: number;
  stroke_index: number;
  tee_lat: number | null;
  tee_lng: number | null;
  green_front_lat: number | null;
  green_front_lng: number | null;
  green_mid_lat: number | null;
  green_mid_lng: number | null;
  green_back_lat: number | null;
  green_back_lng: number | null;
};
type UserClub = {
  id: string;
  club_name: string;
  carry_distance_metres: number | null;
};

type Props = {
  courseId: string;
  userId: string;
  onBack: () => void;
};

const HAZARD_COLORS: Record<HazardType, string> = {
  bunker: '#f5d76e',
  water: '#42a5f5',
  trees: '#2e7d32',
  ob: '#ffffff',
  red_zone: '#ef5350',
};

const MAP_OPTIONS: google.maps.MapOptions = {
  mapTypeId: 'satellite',
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  clickableIcons: false,
};

function clubType(name: string): Club['type'] {
  const value = name.toLowerCase();
  if (value.includes('putter')) return 'putter';
  if (value.includes('driver')) return 'driver';
  if (value.includes('wood')) return 'wood';
  if (value.includes('hybrid')) return 'hybrid';
  if (value.includes('wedge')) return 'wedge';
  return 'iron';
}

function coordinate(lat: number | null, lng: number | null): Coordinate | null {
  return lat == null || lng == null ? null : { latitude: lat, longitude: lng };
}

function compassPoint(degrees: number) {
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round(degrees / 45) % 8];
}

export default function CaddieSimulator({ courseId, userId, onBack }: Props) {
  const [course, setCourse] = useState<Course | null>(null);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [zones, setZones] = useState<CaddieZone[]>([]);
  const [holeNumber, setHoleNumber] = useState<number | null>(null);
  const [playerPosition, setPlayerPosition] = useState<Coordinate | null>(null);
  const [windSpeed, setWindSpeed] = useState(0);
  const [windDirection, setWindDirection] = useState(0);
  const [elevationDifference, setElevationDifference] = useState(0);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [customTarget, setCustomTarget] = useState<Coordinate | null>(null);
  const [mapMode, setMapMode] = useState<'player' | 'target'>('player');
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('courses').select('id, name, lat, lng').eq('id', courseId).single(),
      supabase
        .from('holes')
        .select('id, number, par, stroke_index, tee_lat, tee_lng, green_front_lat, green_front_lng, green_mid_lat, green_mid_lng, green_back_lat, green_back_lng')
        .eq('course_id', courseId)
        .order('number'),
      supabase
        .from('hazards')
        .select('id, course_id, hole_number, hole_numbers, type, label, coordinates, created_at')
        .eq('course_id', courseId),
      supabase
        .from('hole_zones')
        .select('hole_number, zone_type, coordinates')
        .eq('course_id', courseId),
      supabase
        .from('user_clubs')
        .select('id, club_name, carry_distance_metres')
        .eq('user_id', userId)
        .order('carry_distance_metres', { ascending: false }),
      supabase
        .from('clubs')
        .select('id, name, type, loft, custom_name, sort_order, carry_metres, carry_stddev_metres')
        .order('sort_order'),
    ]).then(([courseResult, holesResult, hazardsResult, zonesResult, userClubsResult, globalClubsResult]) => {
      const firstError = courseResult.error || holesResult.error || hazardsResult.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }
      const loadedHoles = (holesResult.data ?? []) as Hole[];
      const personalClubs = (userClubsResult.data ?? []) as UserClub[];
      setCourse(courseResult.data as Course);
      setHoles(loadedHoles);
      setHazards((hazardsResult.data ?? []) as Hazard[]);
      setZones((zonesResult.data ?? []) as (CaddieZone & { hole_number: number })[]);
      setHoleNumber(loadedHoles[0]?.number ?? null);
      setClubs(personalClubs.length > 0
        ? personalClubs.map((club, index) => ({
            id: club.id,
            name: club.club_name,
            type: clubType(club.club_name),
            loft: null,
            custom_name: null,
            sort_order: index,
            carry_metres: club.carry_distance_metres,
            carry_stddev_metres: null,
          }))
        : (globalClubsResult.data ?? []) as Club[]);
    });
  }, [courseId, userId]);

  const hole = holes.find(item => item.number === holeNumber) ?? null;
  const tee = coordinate(hole?.tee_lat ?? null, hole?.tee_lng ?? null);
  const greenMid = coordinate(hole?.green_mid_lat ?? null, hole?.green_mid_lng ?? null);
  const greenFront = coordinate(hole?.green_front_lat ?? null, hole?.green_front_lng ?? null);
  const greenBack = coordinate(hole?.green_back_lat ?? null, hole?.green_back_lng ?? null);

  const holeHazards = useMemo(() => hazards.filter(hazard =>
    (hazard.hole_number == null && (!hazard.hole_numbers || hazard.hole_numbers.length === 0))
    || hazard.hole_number === holeNumber
    || hazard.hole_numbers?.includes(holeNumber ?? -1)
  ), [hazards, holeNumber]);
  const holeZones = useMemo(() => (
    (zones as (CaddieZone & { hole_number?: number })[])
      .filter(zone => zone.hole_number === holeNumber)
  ), [holeNumber, zones]);
  const playerLie = useMemo(() => (
    playerPosition
      ? detectCaddieLie({ playerPos: playerPosition, hazards: holeHazards, zones: holeZones, tee })
      : 'rough'
  ), [holeHazards, holeZones, playerPosition, tee]);

  useEffect(() => {
    const position = tee ?? greenMid;
    setPlayerPosition(position);
    setCustomTarget(null);
    setMapMode('player');
    setAiText('');
    if (position && mapRef.current) {
      mapRef.current.panTo({ lat: position.latitude, lng: position.longitude });
      mapRef.current.setZoom(18);
    }
  }, [hole?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const windLabel = windSpeed < 3
    ? 'Calm'
    : `${windSpeed}km/h ${compassPoint(windDirection)}`;

  const advice = useMemo<CaddieAdvice | null>(() => {
    if (!playerPosition || !greenMid || !hole) return null;
    return buildCaddieAdvice({
      playerPos: playerPosition,
      greenMid,
      hazards: holeHazards,
      clubs,
      windSpeed,
      windDir: windDirection,
      windLabel,
      playerElevation: 0,
      greenElevation: elevationDifference,
      holeNumber: hole.number,
      holePar: hole.par,
      holeIndex: hole.stroke_index,
      lie: playerLie,
      customTarget,
    });
  }, [
    clubs,
    elevationDifference,
    greenMid,
    hole,
    holeHazards,
    playerPosition,
    customTarget,
    playerLie,
    windDirection,
    windLabel,
    windSpeed,
  ]);

  const placePlayer = useCallback((lat: number, lng: number) => {
    setPlayerPosition({ latitude: lat, longitude: lng });
    setCustomTarget(null);
    setAiText('');
  }, []);

  const requestAiRead = useCallback(async () => {
    if (!advice || !course || aiLoading) return;
    setAiLoading(true);
    setAiText('');
    const { system, userMessage } = buildCaddiePrompt(advice, course.name);
    const { data, error: invokeError } = await supabase.functions.invoke('golf-coach', {
      body: { system, userMessage },
    });
    setAiLoading(false);
    if (invokeError) {
      setAiText(`AI read failed: ${invokeError.message}`);
      return;
    }
    setAiText(typeof data?.text === 'string' ? data.text : 'The AI service returned no advice.');
  }, [advice, aiLoading, course]);

  const center = playerPosition ?? greenMid ?? tee ?? {
    latitude: course?.lat ?? -26.6317,
    longitude: course?.lng ?? 152.9587,
  };
  const needsRecoveryTarget = advice?.shotType === 'recovery' && !customTarget;

  return (
    <LoadScript googleMapsApiKey={API_KEY}>
      <div style={S.root}>
        <header style={S.header}>
          <div>
            <button style={S.backButton} onClick={onBack}>← All clubs</button>
            <div style={S.kicker}>CADDIE LAB</div>
            <h1 style={S.title}>{course?.name ?? 'Loading course...'}</h1>
          </div>
          <div style={S.testBadge}><span style={S.liveDot} /> TEST MODE · NO ROUND DATA SAVED</div>
        </header>

        <div style={S.workspace}>
          <aside style={S.sidebar}>
            <label style={S.label}>HOLE</label>
            <div style={S.holeGrid}>
              {holes.map(item => (
                <button
                  key={item.id}
                  style={{ ...S.holeButton, ...(item.number === holeNumber ? S.holeButtonActive : {}) }}
                  onClick={() => setHoleNumber(item.number)}
                >
                  {item.number}
                </button>
              ))}
            </div>

            <div style={S.divider} />
            <label style={S.label}>SIMULATED CONDITIONS</label>
            <label style={S.controlLabel}>
              Wind speed <strong>{windSpeed} km/h</strong>
              <input
                style={S.range}
                type="range"
                min="0"
                max="45"
                value={windSpeed}
                onChange={event => {
                  setWindSpeed(Number(event.target.value));
                  setAiText('');
                }}
              />
            </label>
            <label style={S.controlLabel}>
              Wind from <strong>{windDirection}° {compassPoint(windDirection)}</strong>
              <input
                style={S.range}
                type="range"
                min="0"
                max="359"
                value={windDirection}
                onChange={event => {
                  setWindDirection(Number(event.target.value));
                  setAiText('');
                }}
              />
            </label>
            <label style={S.controlLabel}>
              Green elevation <strong>{elevationDifference > 0 ? '+' : ''}{elevationDifference}m</strong>
              <input
                style={S.range}
                type="range"
                min="-30"
                max="30"
                value={elevationDifference}
                onChange={event => {
                  setElevationDifference(Number(event.target.value));
                  setAiText('');
                }}
              />
            </label>

            <div style={S.divider} />
            <label style={S.label}>PLAYER POSITION</label>
            <p style={S.help}>Click anywhere on the map or drag the orange player marker.</p>
            <div style={S.quickPositions}>
              <button style={S.quickButton} disabled={!tee} onClick={() => tee && setPlayerPosition(tee)}>
                Place at tee
              </button>
              <button
                style={S.quickButton}
                disabled={!greenFront}
                onClick={() => greenFront && setPlayerPosition(greenFront)}
              >
                Green front
              </button>
            </div>
            <div style={S.modeButtons}>
              <button
                style={{ ...S.quickButton, ...(mapMode === 'player' ? S.modeActive : {}) }}
                onClick={() => setMapMode('player')}
              >
                Move player
              </button>
              <button
                style={{ ...S.quickButton, ...(mapMode === 'target' ? S.modeActive : {}) }}
                onClick={() => setMapMode('target')}
              >
                Choose shot target
              </button>
            </div>
            <div style={S.lieBadge}>Detected lie: <strong>{playerLie}</strong></div>
            {customTarget && (
              <button
                style={S.resetTarget}
                onClick={() => {
                  setCustomTarget(null);
                  setMapMode('player');
                  setAiText('');
                }}
              >
                Use caddie target
              </button>
            )}

            <div style={S.divider} />
            <label style={S.label}>BAG USED FOR TEST</label>
            <div style={S.clubList}>
              {clubs.filter(club => club.type !== 'putter' && club.carry_metres != null).map(club => (
                <div key={club.id} style={S.clubRow}>
                  <span>{club.custom_name ?? club.name}</span>
                  <strong>{club.carry_metres}m</strong>
                </div>
              ))}
            </div>
          </aside>

          <main style={S.mapPanel}>
            {error && <div style={S.error}>{error}</div>}
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={{ lat: center.latitude, lng: center.longitude }}
              zoom={18}
              options={MAP_OPTIONS}
              onLoad={map => { mapRef.current = map; }}
              onClick={event => {
                if (!event.latLng) return;
                if (mapMode === 'target') {
                  setCustomTarget({
                    latitude: event.latLng.lat(),
                    longitude: event.latLng.lng(),
                  });
                  setMapMode('player');
                  setAiText('');
                } else {
                  placePlayer(event.latLng.lat(), event.latLng.lng());
                }
              }}
            >
              {holeHazards.map(hazard => (
                <Polygon
                  key={hazard.id}
                  paths={hazard.coordinates}
                  options={{
                    fillColor: HAZARD_COLORS[hazard.type],
                    fillOpacity: 0.3,
                    strokeColor: HAZARD_COLORS[hazard.type],
                    strokeOpacity: 0.9,
                    strokeWeight: hazard.type === 'ob' ? 3 : 2,
                    clickable: false,
                  }}
                />
              ))}
              {tee && (
                <Marker
                  position={{ lat: tee.latitude, lng: tee.longitude }}
                  label={{ text: 'T', color: '#111', fontWeight: '700' }}
                />
              )}
              {greenMid && (
                <Marker
                  position={{ lat: greenMid.latitude, lng: greenMid.longitude }}
                  label={{ text: 'G', color: '#111', fontWeight: '700' }}
                />
              )}
              {playerPosition && (
                <Marker
                  position={{ lat: playerPosition.latitude, lng: playerPosition.longitude }}
                  draggable
                  title="Simulated player position"
                  label={{ text: 'P', color: '#111', fontWeight: '800' }}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 13,
                    fillColor: '#ff9f43',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 3,
                  }}
                  onDragEnd={event => {
                    if (event.latLng) placePlayer(event.latLng.lat(), event.latLng.lng());
                  }}
                />
              )}
              {customTarget && !advice && (
                <Marker
                  position={{ lat: customTarget.latitude, lng: customTarget.longitude }}
                  title="Player-selected shot target"
                  label={{ text: 'TARGET', color: '#111', fontWeight: '800', fontSize: '10px' }}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 20,
                    fillColor: '#f5d76e',
                    fillOpacity: 0.95,
                    strokeColor: '#fff',
                    strokeWeight: 3,
                  }}
                />
              )}
              {playerPosition && greenMid && !needsRecoveryTarget && (
                <>
                  <Polyline
                    path={[
                      { lat: playerPosition.latitude, lng: playerPosition.longitude },
                      {
                        lat: advice?.target.latitude ?? greenMid.latitude,
                        lng: advice?.target.longitude ?? greenMid.longitude,
                      },
                    ]}
                    options={{
                      strokeColor: advice ? '#b7d29e' : '#ffffff',
                      strokeOpacity: 0.95,
                      strokeWeight: advice ? 4 : 2,
                    }}
                  />
                  {advice && (
                    <>
                      <Polyline
                        path={[
                          { lat: advice.target.latitude, lng: advice.target.longitude },
                          { lat: greenMid.latitude, lng: greenMid.longitude },
                        ]}
                        options={{
                          strokeColor: '#ffffff',
                          strokeOpacity: 0.7,
                          strokeWeight: 2,
                          icons: [{
                            icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
                            offset: '0',
                            repeat: '16px',
                          }],
                        }}
                      />
                      <Marker
                        position={{
                          lat: advice.target.latitude,
                          lng: advice.target.longitude,
                        }}
                        title={`Recommended landing area: ${advice.targetDistance}m`}
                        label={{
                          text: `${advice.targetDistance}m`,
                          color: '#ffffff',
                          fontWeight: '800',
                          fontSize: '12px',
                        }}
                        icon={{
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 24,
                          fillColor: '#13251b',
                          fillOpacity: 0.82,
                          strokeColor: '#b7d29e',
                          strokeWeight: 4,
                        }}
                      />
                    </>
                  )}
                </>
              )}
            </GoogleMap>
            <div style={S.mapInstruction}>CLICK MAP TO MOVE PLAYER</div>
          </main>

          <aside style={S.advicePanel}>
            <div style={S.adviceHeader}>
              <span style={S.label}>LIVE CADDIE READ</span>
              <span style={S.windPill}>{windLabel}</span>
            </div>

            {!advice ? (
              <div style={S.emptyAdvice}>
                {!greenMid
                  ? 'This hole needs a green middle location before it can be tested.'
                  : clubs.length === 0
                    ? 'Add club carry distances before testing.'
                    : 'Place the player on the map.'}
              </div>
            ) : (
              <>
                <div style={S.primaryAdvice}>
                  <div style={S.distance}>{advice.playingDistance}<span>m</span></div>
                  <div>
                    <div style={S.clubName}>
                      {advice.recommended.club.custom_name ?? advice.recommended.club.name}
                    </div>
                    <div style={S.actualDistance}>{advice.distToPin}m actual · {advice.recommended.adjustedCarry}m carry</div>
                  </div>
                </div>

                <div style={S.shortAdvice}>{advice.shortText}</div>
                <div style={S.shotPlan}>
                  <span>
                    {advice.shotType === 'recovery'
                      ? 'RECOVERY PLAN'
                      : advice.shotType === 'layup' ? 'LAYUP PLAN' : advice.shotType === 'putt' ? 'PUTT PLAN' : 'ATTACK PLAN'}
                  </span>
                  <strong>{advice.aimInstruction}</strong>
                  <small>
                    Target {advice.targetDistance}m · {advice.remainingDistance}m remaining
                  </small>
                  <small>Lie: {advice.lie}{advice.customTarget ? ' · player-selected target' : ''}</small>
                </div>

                <div style={S.metrics}>
                  <Metric label="Wind effect" value={`${advice.windAdjustment > 0 ? '+' : ''}${advice.windAdjustment}m`} />
                  <Metric label="Elevation" value={`${advice.elevDiff > 0 ? '+' : ''}${advice.elevDiff}m`} />
                  <Metric label="Hazards read" value={String(holeHazards.length)} />
                </div>

                <label style={S.label}>ENGINE STRATEGY</label>
                <ol style={S.strategyList}>
                  {advice.strategy.map(line => <li key={line}>{line}</li>)}
                </ol>

                {advice.alternatives.length > 0 && (
                  <>
                    <label style={S.label}>ALTERNATIVES</label>
                    <div style={S.alternatives}>
                      {advice.alternatives.map(option => (
                        <div key={option.club.id} style={S.alternative}>
                          <strong>{option.club.custom_name ?? option.club.name}</strong>
                          <span>{option.adjustedCarry}m</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <button
                  style={S.aiButton}
                  disabled={aiLoading}
                  onClick={() => void requestAiRead()}
                >
                  {aiLoading ? 'Asking caddie...' : 'Generate AI caddie wording'}
                </button>
                {aiText && <div style={S.aiRead}>{aiText}</div>}

                <details style={S.debug}>
                  <summary>Show engine context</summary>
                  <pre style={S.context}>{advice.context}</pre>
                </details>
              </>
            )}
          </aside>
        </div>
      </div>
    </LoadScript>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={S.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: { height: '100vh', background: '#09130f', color: '#f3f0e8', overflow: 'hidden' },
  header: {
    height: 88, padding: '0 22px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', borderBottom: '1px solid #24352c', background: '#0b1913',
  },
  backButton: { border: 'none', background: 'transparent', color: '#789486', cursor: 'pointer', fontSize: 11, padding: 0 },
  kicker: { color: '#91b879', fontSize: 9, letterSpacing: '0.2em', fontWeight: 800, marginTop: 7 },
  title: { fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 25, marginTop: 3 },
  testBadge: {
    padding: '8px 12px', borderRadius: 20, background: '#14271e', border: '1px solid #294535',
    color: '#8db69c', fontSize: 9, letterSpacing: '0.1em',
  },
  liveDot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#ff9f43', marginRight: 7 },
  workspace: { height: 'calc(100vh - 88px)', display: 'grid', gridTemplateColumns: '235px minmax(420px, 1fr) 350px' },
  sidebar: { overflowY: 'auto', padding: 18, borderRight: '1px solid #24352c', background: '#0d1c16' },
  advicePanel: { overflowY: 'auto', padding: 20, borderLeft: '1px solid #24352c', background: '#0d1c16' },
  label: { display: 'block', color: '#6f8b7b', fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', marginBottom: 10 },
  holeGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 },
  holeButton: {
    height: 29, borderRadius: 6, border: '1px solid #2a3b32', background: '#14231c',
    color: '#75887e', cursor: 'pointer', fontSize: 10,
  },
  holeButtonActive: { background: '#9fc187', borderColor: '#9fc187', color: '#102016', fontWeight: 800 },
  divider: { height: 1, background: '#24352c', margin: '20px 0' },
  controlLabel: { display: 'block', color: '#aab8b0', fontSize: 11, marginBottom: 17 },
  range: { display: 'block', width: '100%', marginTop: 10, accentColor: '#9fc187' },
  help: { color: '#71847a', fontSize: 11, lineHeight: 1.5, marginBottom: 12 },
  quickPositions: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  modeButtons: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 7 },
  modeActive: { borderColor: '#f5d76e', color: '#f5d76e' },
  lieBadge: { marginTop: 10, color: '#788d81', fontSize: 10, textTransform: 'capitalize' },
  resetTarget: {
    width: '100%', marginTop: 8, padding: 8, borderRadius: 6, border: '1px solid #536d5e',
    background: 'transparent', color: '#b8c8bf', cursor: 'pointer', fontSize: 10,
  },
  quickButton: {
    padding: '8px 5px', borderRadius: 6, border: '1px solid #30463a', background: '#15271e',
    color: '#a4b7ac', cursor: 'pointer', fontSize: 10,
  },
  clubList: { display: 'flex', flexDirection: 'column', gap: 5 },
  clubRow: {
    display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 5,
    background: '#13221b', color: '#8da096', fontSize: 10,
  },
  mapPanel: { position: 'relative', minWidth: 0 },
  mapInstruction: {
    position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
    padding: '8px 12px', borderRadius: 18, background: 'rgba(8,20,14,0.88)',
    border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 9,
    letterSpacing: '0.12em', pointerEvents: 'none',
  },
  error: { position: 'absolute', zIndex: 2, top: 10, left: 10, right: 10, padding: 10, background: '#6d2824', color: '#fff' },
  adviceHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  windPill: { padding: '5px 8px', borderRadius: 12, background: '#172920', color: '#9ab4a5', fontSize: 9 },
  emptyAdvice: { marginTop: 25, padding: 20, borderRadius: 10, border: '1px dashed #304339', color: '#75887e', lineHeight: 1.6, fontSize: 12 },
  primaryAdvice: { display: 'flex', alignItems: 'center', gap: 17, margin: '18px 0 15px' },
  distance: { fontFamily: 'Georgia, serif', color: '#b7d29e', fontSize: 52, lineHeight: 1 },
  clubName: { fontFamily: 'Georgia, serif', fontSize: 25 },
  actualDistance: { color: '#6e8478', fontSize: 10, marginTop: 5 },
  shortAdvice: { padding: 14, borderRadius: 9, background: '#14271e', color: '#cfdbd3', fontSize: 12, lineHeight: 1.55 },
  shotPlan: {
    display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, padding: 13,
    borderRadius: 9, border: '1px solid #39523f', background: '#101f17',
    color: '#aab9b0', fontSize: 11, lineHeight: 1.45,
  },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, margin: '14px 0 22px' },
  metric: { padding: 9, borderRadius: 7, background: '#111f19', display: 'flex', flexDirection: 'column', gap: 5, color: '#64786e', fontSize: 8 },
  strategyList: { margin: '0 0 22px', paddingLeft: 20, color: '#aebdb5', fontSize: 11, lineHeight: 1.55 },
  alternatives: { display: 'flex', gap: 7, marginBottom: 20 },
  alternative: { flex: 1, display: 'flex', justifyContent: 'space-between', padding: 9, borderRadius: 7, background: '#14231c', color: '#a7b6ae', fontSize: 10 },
  aiButton: {
    width: '100%', padding: 11, borderRadius: 8, border: '1px solid #a7c78b',
    background: '#a7c78b', color: '#102016', fontWeight: 800, cursor: 'pointer', fontSize: 11,
  },
  aiRead: { marginTop: 10, padding: 13, borderRadius: 8, background: '#23372b', color: '#e0eadb', fontSize: 12, lineHeight: 1.55 },
  debug: { marginTop: 16, color: '#63796c', fontSize: 10, cursor: 'pointer' },
  context: { whiteSpace: 'pre-wrap', marginTop: 8, padding: 10, borderRadius: 7, background: '#09140f', color: '#71867a', fontSize: 9, lineHeight: 1.5 },
};
