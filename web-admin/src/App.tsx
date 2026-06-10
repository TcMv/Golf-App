import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { isAdminEmail } from './lib/admin';
import ZoneEditor from './ZoneEditor';
import CourseLanding from './CourseLanding';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session || isAdminEmail(data.session.user.email)) {
        setSession(data.session);
        return;
      }
      setError('This account does not have administrator access.');
      setSession(null);
      await supabase.auth.signOut();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, nextSession) => {
      if (!nextSession) {
        setSelectedCourseId(null);
      }
      if (nextSession && !isAdminEmail(nextSession.user.email)) {
        setError('This account does not have administrator access.');
        setSession(null);
        return;
      }
      setSession(nextSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#aaa' }}>Loading…</div>;
  }

  if (session) {
    if (selectedCourseId) {
      return (
        <ZoneEditor
          initialCourseId={selectedCourseId}
          onBack={() => setSelectedCourseId(null)}
        />
      );
    }
    return (
      <CourseLanding
        user={session.user}
        onSelectCourse={setSelectedCourseId}
      />
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (!isAdminEmail(data.session?.user.email)) {
      await supabase.auth.signOut();
      setSession(null);
      setError('This account does not have administrator access.');
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f' }}>
      <form onSubmit={handleLogin} style={formStyle}>
        <h2 style={{ color: '#fff', marginBottom: 8 }}>⛳ Zone Admin</h2>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 28 }}>Draw green and fairway polygons on satellite imagery</p>
        <label style={labelStyle}>Email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" />
        <label style={{ ...labelStyle, marginTop: 16 }}>Password</label>
        <input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
        {error && <p style={{ color: '#f87171', fontSize: 13, marginTop: 12 }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const formStyle: React.CSSProperties = {
  background: '#1a1a1a', padding: '40px 36px', borderRadius: 16,
  width: 380, border: '1px solid #2a2a2a',
};
const labelStyle: React.CSSProperties = {
  display: 'block', color: '#888', fontSize: 11, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 8, fontSize: 14,
  background: '#242424', border: '1px solid #333', color: '#fff',
  outline: 'none', boxSizing: 'border-box',
};
const btnStyle: React.CSSProperties = {
  width: '100%', marginTop: 24, padding: '13px', borderRadius: 8,
  background: '#4caf50', border: 'none', color: '#fff',
  fontSize: 15, fontWeight: 700, cursor: 'pointer',
};
