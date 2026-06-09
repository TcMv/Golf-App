import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signin') {
        const err = await signIn(trimmedEmail, password);
        if (err) setError(err.message);
      } else {
        const result = await signUp(trimmedEmail, password, displayName);
        if (result.error) {
          setError(result.error.message);
        } else if (result.requiresEmailConfirmation) {
          setSuccess('Account created. Check your email, confirm the account, then return here and sign in.');
          setMode('signin');
          setPassword('');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <View style={styles.logoRow}>
            <Text style={styles.logoEmoji}>⛳</Text>
            <Text style={styles.logoText}>GolfCaddie</Text>
          </View>

          {/* Mode toggle */}
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'signin' && styles.toggleBtnActive]}
              onPress={() => { setMode('signin'); setError(null); setSuccess(null); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleBtnText, mode === 'signin' && styles.toggleBtnTextActive]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'signup' && styles.toggleBtnActive]}
              onPress={() => { setMode('signup'); setError(null); setSuccess(null); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleBtnText, mode === 'signup' && styles.toggleBtnTextActive]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {mode === 'signup' && (
              <>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor={Colors.textMuted}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </>
            )}

            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder={mode === 'signup' ? 'Min 6 characters' : 'Your password'}
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />

            {error && <Text style={styles.errorText}>{error}</Text>}
            {success && <Text style={styles.successText}>{success}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color={Colors.bg} />
                : <Text style={styles.submitBtnText}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>
              }
            </TouchableOpacity>
          </View>

          {mode === 'signin' && (
            <Text style={styles.hint}>
              New here? Tap <Text style={styles.hintLink} onPress={() => setMode('signup')}>Create Account</Text> above.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  kav: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxl,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  logoEmoji: { fontSize: 32 },
  logoText: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    fontFamily: Font.black,
    color: Colors.green,
    letterSpacing: -0.5,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface2,
    borderRadius: Radius.lg,
    padding: 4,
    gap: 4,
    marginBottom: Spacing.xl,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: Colors.surface3 },
  toggleBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    fontFamily: Font.medium,
    color: Colors.textMuted,
  },
  toggleBtnTextActive: { color: Colors.text },
  form: { gap: Spacing.xs },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginTop: Spacing.base,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surface1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontSize: FontSize.base,
    fontFamily: Font.regular,
    color: Colors.text,
  },
  errorText: {
    fontSize: FontSize.sm,
    fontFamily: Font.regular,
    color: Colors.red,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  successText: {
    fontSize: FontSize.sm,
    fontFamily: Font.medium,
    color: Colors.green,
    marginTop: Spacing.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  submitBtn: {
    marginTop: Spacing.lg,
    minHeight: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    color: Colors.bg,
  },
  hint: {
    marginTop: Spacing.xl,
    fontSize: FontSize.sm,
    fontFamily: Font.regular,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  hintLink: {
    color: Colors.green,
    fontFamily: Font.medium,
  },
});
