import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

type Course = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  holes: number;
};

type HoleSummary = {
  course_id: string;
  par: number;
};

type CourseIdRow = {
  course_id: string;
};

type CourseLandingProps = {
  user: User;
  onSelectCourse: (courseId: string) => void;
};

export default function CourseLanding({ user, onSelectCourse }: CourseLandingProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [holes, setHoles] = useState<HoleSummary[]>([]);
  const [zones, setZones] = useState<CourseIdRow[]>([]);
  const [hazards, setHazards] = useState<CourseIdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('courses').select('id, name, lat, lng, holes').order('name'),
      supabase.from('holes').select('course_id, par'),
      supabase.from('hole_zones').select('course_id'),
      supabase.from('hazards').select('course_id'),
    ]).then(([coursesResult, holesResult, zonesResult, hazardsResult]) => {
      const firstError = coursesResult.error
        || holesResult.error
        || zonesResult.error
        || hazardsResult.error;
      if (firstError) {
        setError(firstError.message);
      } else {
        setCourses((coursesResult.data ?? []) as Course[]);
        setHoles((holesResult.data ?? []) as HoleSummary[]);
        setZones((zonesResult.data ?? []) as CourseIdRow[]);
        setHazards((hazardsResult.data ?? []) as CourseIdRow[]);
      }
      setLoading(false);
    });
  }, []);

  const summaries = useMemo(() => new Map(courses.map(course => {
    const courseHoles = holes.filter(hole => hole.course_id === course.id);
    return [course.id, {
      par: courseHoles.reduce((total, hole) => total + hole.par, 0),
      zones: zones.filter(zone => zone.course_id === course.id).length,
      hazards: hazards.filter(hazard => hazard.course_id === course.id).length,
    }];
  })), [courses, hazards, holes, zones]);

  return (
    <main style={S.page}>
      <div style={S.glowOne} />
      <div style={S.glowTwo} />

      <header style={S.header}>
        <div style={S.brand}>
          <span style={S.brandMark}>F</span>
          <div>
            <div style={S.brandName}>FAIRWAY</div>
            <div style={S.brandSub}>COURSE STUDIO</div>
          </div>
        </div>
        <div style={S.account}>
          <div style={S.accountText}>
            <span style={S.accountLabel}>SIGNED IN AS</span>
            <span style={S.accountEmail}>{user.email}</span>
          </div>
          <button style={S.signOut} onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <section style={S.hero}>
        <div style={S.eyebrow}>COURSE MAPPING</div>
        <h1 style={S.title}>
          Build a smarter view
          <br />
          <span style={S.titleAccent}>of every hole.</span>
        </h1>
        <p style={S.intro}>
          Select a club to map greens, fairways, hazards, tee positions and
          the detail your caddie needs to make better decisions.
        </p>
      </section>

      <section style={S.content}>
        <div style={S.sectionHeading}>
          <div>
            <div style={S.eyebrow}>YOUR CLUBS</div>
            <h2 style={S.heading}>Choose a course to edit</h2>
          </div>
          <span style={S.courseCount}>
            {courses.length} {courses.length === 1 ? 'course' : 'courses'}
          </span>
        </div>

        {loading && <div style={S.message}>Loading your courses...</div>}
        {error && <div style={{ ...S.message, color: '#ff9b8f' }}>{error}</div>}

        {!loading && !error && (
          <div style={S.grid}>
            {courses.map((course, index) => {
              const summary = summaries.get(course.id) ?? { par: 0, zones: 0, hazards: 0 };
              const mappedHoles = Math.min(course.holes, Math.floor(summary.zones / 2));
              const progress = course.holes > 0 ? mappedHoles / course.holes * 100 : 0;
              return (
                <button
                  key={course.id}
                  style={S.card}
                  onClick={() => onSelectCourse(course.id)}
                >
                  <div style={{
                    ...S.courseArt,
                    background: index % 2 === 0
                      ? 'linear-gradient(145deg, #1c5638 0%, #123e2b 55%, #0c2c20 100%)'
                      : 'linear-gradient(145deg, #42684c 0%, #1f4935 55%, #123425 100%)',
                  }}>
                    <div style={S.sun} />
                    <div style={S.fairway} />
                    <div style={S.green} />
                    <div style={S.bunker} />
                    <div style={S.pin}>
                      <span style={S.pinPole} />
                      <span style={S.pinFlag} />
                    </div>
                    <span style={S.holeBadge}>{course.holes} HOLES</span>
                  </div>

                  <div style={S.cardBody}>
                    <div style={S.cardTop}>
                      <div>
                        <h3 style={S.courseName}>{course.name}</h3>
                        <p style={S.location}>
                          {Math.abs(course.lat).toFixed(4)}°S · {course.lng.toFixed(4)}°E
                        </p>
                      </div>
                      <span style={S.arrow}>↗</span>
                    </div>

                    <div style={S.stats}>
                      <div style={S.stat}>
                        <span style={S.statValue}>{summary.par || '—'}</span>
                        <span style={S.statLabel}>TOTAL PAR</span>
                      </div>
                      <div style={S.stat}>
                        <span style={S.statValue}>{summary.zones}</span>
                        <span style={S.statLabel}>COURSE ZONES</span>
                      </div>
                      <div style={S.stat}>
                        <span style={S.statValue}>{summary.hazards}</span>
                        <span style={S.statLabel}>HAZARDS</span>
                      </div>
                    </div>

                    <div style={S.progressHeader}>
                      <span>Hole mapping</span>
                      <span>{mappedHoles}/{course.holes} complete</span>
                    </div>
                    <div style={S.progressTrack}>
                      <span style={{ ...S.progressFill, width: `${progress}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <footer style={S.footer}>
        <span>FAIRWAY COURSE INTELLIGENCE</span>
        <span>ADMIN STUDIO · {new Date().getFullYear()}</span>
      </footer>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    position: 'relative',
    overflow: 'hidden',
    background: '#071711',
    color: '#f4f1e8',
    padding: '0 clamp(22px, 5vw, 76px)',
  },
  glowOne: {
    position: 'absolute',
    width: 620,
    height: 620,
    borderRadius: '50%',
    right: -220,
    top: -260,
    background: 'radial-gradient(circle, rgba(117,168,98,0.2), transparent 68%)',
    pointerEvents: 'none',
  },
  glowTwo: {
    position: 'absolute',
    width: 500,
    height: 500,
    borderRadius: '50%',
    left: -280,
    top: 280,
    background: 'radial-gradient(circle, rgba(34,113,76,0.18), transparent 68%)',
    pointerEvents: 'none',
  },
  header: {
    height: 92,
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(240,238,225,0.12)',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12 },
  brandMark: {
    width: 38,
    height: 38,
    display: 'grid',
    placeItems: 'center',
    border: '1px solid #a7c78b',
    borderRadius: '50%',
    color: '#cfe3ae',
    fontFamily: 'Georgia, serif',
    fontSize: 22,
    fontStyle: 'italic',
  },
  brandName: { fontSize: 13, letterSpacing: '0.26em', fontWeight: 700 },
  brandSub: { marginTop: 3, color: '#789282', fontSize: 8, letterSpacing: '0.22em' },
  account: { display: 'flex', alignItems: 'center', gap: 20 },
  accountText: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 },
  accountLabel: { color: '#5f7b69', fontSize: 8, letterSpacing: '0.18em' },
  accountEmail: { color: '#b6c5bb', fontSize: 11 },
  signOut: {
    padding: '9px 14px',
    borderRadius: 999,
    border: '1px solid rgba(240,238,225,0.18)',
    color: '#c5d0c8',
    background: 'rgba(255,255,255,0.03)',
    cursor: 'pointer',
  },
  hero: {
    position: 'relative',
    zIndex: 1,
    padding: 'clamp(62px, 9vw, 112px) 0 68px',
    maxWidth: 900,
  },
  eyebrow: {
    color: '#a6c98a',
    fontSize: 10,
    letterSpacing: '0.28em',
    fontWeight: 700,
  },
  title: {
    margin: '20px 0 22px',
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontWeight: 400,
    fontSize: 'clamp(48px, 7vw, 94px)',
    lineHeight: 0.98,
    letterSpacing: '-0.045em',
  },
  titleAccent: { color: '#a9c98f', fontStyle: 'italic' },
  intro: {
    maxWidth: 610,
    color: '#91a298',
    fontSize: 'clamp(14px, 1.5vw, 17px)',
    lineHeight: 1.7,
  },
  content: { position: 'relative', zIndex: 1, paddingBottom: 90 },
  sectionHeading: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  heading: {
    marginTop: 10,
    fontFamily: 'Georgia, serif',
    fontSize: 'clamp(25px, 3vw, 38px)',
    fontWeight: 400,
  },
  courseCount: { color: '#6e8577', fontSize: 12 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
    gap: 22,
  },
  card: {
    padding: 0,
    overflow: 'hidden',
    borderRadius: 22,
    border: '1px solid rgba(240,238,225,0.13)',
    background: '#0d2119',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: '0 24px 70px rgba(0,0,0,0.2)',
  },
  courseArt: {
    height: 210,
    position: 'relative',
    overflow: 'hidden',
  },
  sun: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: '50%',
    right: -45,
    top: -100,
    background: 'rgba(219,227,169,0.09)',
  },
  fairway: {
    position: 'absolute',
    width: '75%',
    height: 280,
    left: '20%',
    top: 52,
    borderRadius: '48% 52% 30% 25%',
    background: 'linear-gradient(120deg, rgba(127,165,91,0.75), rgba(81,130,75,0.7))',
    transform: 'rotate(-14deg)',
  },
  green: {
    position: 'absolute',
    width: 116,
    height: 72,
    right: '11%',
    top: 34,
    borderRadius: '50%',
    background: '#90b878',
    transform: 'rotate(-12deg)',
  },
  bunker: {
    position: 'absolute',
    width: 56,
    height: 20,
    right: '29%',
    top: 98,
    borderRadius: '50%',
    background: '#d8c9a2',
    transform: 'rotate(-18deg)',
  },
  pin: { position: 'absolute', right: '24%', top: 35, width: 26, height: 56 },
  pinPole: {
    position: 'absolute',
    width: 2,
    height: 48,
    left: 4,
    top: 5,
    background: '#f8f0da',
  },
  pinFlag: {
    position: 'absolute',
    left: 6,
    top: 5,
    width: 20,
    height: 12,
    background: '#f1d06d',
    clipPath: 'polygon(0 0, 100% 40%, 0 100%)',
  },
  holeBadge: {
    position: 'absolute',
    left: 18,
    top: 18,
    padding: '7px 10px',
    borderRadius: 999,
    background: 'rgba(5,23,16,0.7)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: '#d9e6d7',
    fontSize: 9,
    letterSpacing: '0.16em',
  },
  cardBody: { padding: '24px 24px 25px' },
  cardTop: { display: 'flex', justifyContent: 'space-between', gap: 14 },
  courseName: {
    fontFamily: 'Georgia, serif',
    fontSize: 25,
    fontWeight: 400,
    lineHeight: 1.15,
  },
  location: { marginTop: 7, color: '#668071', fontSize: 10, letterSpacing: '0.08em' },
  arrow: {
    width: 36,
    height: 36,
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    borderRadius: '50%',
    border: '1px solid rgba(167,199,139,0.32)',
    color: '#b9d29f',
    fontSize: 17,
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    margin: '25px 0 23px',
    padding: '19px 0',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  stat: { display: 'flex', flexDirection: 'column', gap: 5 },
  statValue: { color: '#dce7d6', fontFamily: 'Georgia, serif', fontSize: 21 },
  statLabel: { color: '#567061', fontSize: 8, letterSpacing: '0.13em' },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#7e9588',
    fontSize: 10,
    marginBottom: 9,
  },
  progressTrack: {
    height: 3,
    overflow: 'hidden',
    borderRadius: 4,
    background: '#1d352a',
  },
  progressFill: {
    display: 'block',
    height: '100%',
    borderRadius: 4,
    background: '#a7c78b',
  },
  message: {
    padding: 28,
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    color: '#91a298',
  },
  footer: {
    position: 'relative',
    zIndex: 1,
    height: 80,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid rgba(240,238,225,0.1)',
    color: '#486254',
    fontSize: 8,
    letterSpacing: '0.18em',
  },
};
