import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Coordinate } from '../types';

const LAST_LOCATION_KEY = '@golf_last_location_v1';
const STALE_AFTER_MS = 15_000;

interface UseLocationResult {
  location: Coordinate | null;
  error: string | null;
  loading: boolean;
  stale: boolean;
  updatedAt: number | null;
}

/**
 * Wraps expo-location to deliver a continuously updated GPS coordinate.
 *
 * - Requests foreground permission on mount.
 * - Watches position every 5 seconds with high accuracy.
 * - Cleans up the subscription on unmount.
 */
export function useLocation(): UseLocationResult {
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);

  // Keep a stable ref to the subscription so we can remove it on unmount
  // even if the state update and cleanup race.
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setLoading(true);
      setError(null);

      const cached = await AsyncStorage.getItem(LAST_LOCATION_KEY);
      if (cached && !cancelled) {
        try {
          const parsed = JSON.parse(cached) as { coordinate: Coordinate; updatedAt: number };
          setLocation(parsed.coordinate);
          setUpdatedAt(parsed.updatedAt);
          setStale(Date.now() - parsed.updatedAt > STALE_AFTER_MS);
          setLoading(false);
        } catch {
          // Ignore malformed cache and wait for a live GPS fix.
        }
      }

      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (status !== 'granted') {
        setError('Location permission not granted');
        setLoading(false);
        return;
      }

      // Subscribe to position updates
      try {
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 0,
          },
          (pos) => {
            if (cancelled) return;
            const coordinate = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            const timestamp = pos.timestamp || Date.now();
            setLocation(coordinate);
            setUpdatedAt(timestamp);
            setStale(false);
            setLoading(false);
            AsyncStorage.setItem(
              LAST_LOCATION_KEY,
              JSON.stringify({ coordinate, updatedAt: timestamp }),
            ).catch(() => undefined);
          },
        );

        if (cancelled) {
          sub.remove();
        } else {
          subscriptionRef.current = sub;
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to start location tracking',
          );
          setLoading(false);
        }
      }
    }

    start();
    const staleTimer = setInterval(() => {
      setUpdatedAt(lastUpdate => {
        if (lastUpdate !== null) {
          setStale(Date.now() - lastUpdate > STALE_AFTER_MS);
        }
        return lastUpdate;
      });
    }, 5_000);

    return () => {
      cancelled = true;
      clearInterval(staleTimer);
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, []);

  return { location, error, loading, stale, updatedAt };
}
