import { useEffect } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../../lib/supabase';
import { syncQueuedHoleScores } from '../../lib/offlineScores';

export default function OfflineScoreSync() {
  useEffect(() => {
    const flush = () => {
      void syncQueuedHoleScores();
    };

    flush();
    const interval = setInterval(flush, 15_000);
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') flush();
    });
    const channel = supabase
      .channel('offline-score-sync')
      .subscribe(status => {
        if (status === 'SUBSCRIBED') flush();
      });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
      void supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
