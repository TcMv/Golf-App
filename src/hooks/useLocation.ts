import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { Coordinate } from '../types';

interface UseLocationResult {
  location: Coordinate | null;
  error: string | null;
  loading: boolean;
}

/**
 * Wraps expo-location to deliver a continuously updated GPS coordinate.
 *
 * - Requests foreground permission on mount.
 * - Watches position every 3 seconds with high accuracy.
 * - Cleans up the subscription on unmount.
 */
export function useLocation(): UseLocationResult {
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep a stable ref to the subscription so we can remove it on unmount
  // even if the state update and cleanup race.
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setLoading(true);
      setError(null);

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
            timeInterval: 3000,
            distanceInterval: 0,
          },
          (pos) => {
            if (cancelled) return;
            setLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
            setLoading(false);
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

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, []);

  return { location, error, loading };
}
