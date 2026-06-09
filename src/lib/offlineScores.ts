import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const SCORE_QUEUE_KEY = '@golf_score_sync_queue_v1';
let storageLock: Promise<void> = Promise.resolve();
let syncInFlight: Promise<number> | null = null;

export type QueuedHoleScore = {
  round_id: string;
  hole_id: string;
  hole_number: number;
  gross_score: number | null;
  putts: number;
  fairway_hit: string;
  gir_miss_direction: string;
  chips: number;
  sand_shots: number;
  penalties: number;
  queued_at: string;
};

function scoreKey(score: Pick<QueuedHoleScore, 'round_id' | 'hole_number'>): string {
  return `${score.round_id}:${score.hole_number}`;
}

async function readQueue(): Promise<QueuedHoleScore[]> {
  const value = await AsyncStorage.getItem(SCORE_QUEUE_KEY);
  if (!value) return [];
  try {
    return JSON.parse(value) as QueuedHoleScore[];
  } catch {
    return [];
  }
}

async function writeQueue(scores: QueuedHoleScore[]): Promise<void> {
  await AsyncStorage.setItem(SCORE_QUEUE_KEY, JSON.stringify(scores));
}

async function withStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = storageLock;
  let release: () => void = () => undefined;
  storageLock = new Promise<void>(resolve => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

export async function queueHoleScore(score: Omit<QueuedHoleScore, 'queued_at'>): Promise<void> {
  await withStorageLock(async () => {
    const queue = await readQueue();
    const key = scoreKey(score);
    const next = queue.filter(item => scoreKey(item) !== key);
    next.push({ ...score, queued_at: new Date().toISOString() });
    await writeQueue(next);
  });
}

export async function removeQueuedHoleScore(
  roundId: string,
  holeNumber: number,
): Promise<void> {
  await withStorageLock(async () => {
    const queue = await readQueue();
    await writeQueue(
      queue.filter(item => item.round_id !== roundId || item.hole_number !== holeNumber),
    );
  });
}

export async function syncQueuedHoleScores(): Promise<number> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const queue = await withStorageLock(readQueue);
    if (queue.length === 0) return 0;

    let synced = 0;
    for (const score of queue) {
      const { queued_at: _queuedAt, ...row } = score;
      const { error } = await supabase
        .from('hole_scores')
        .upsert(row, { onConflict: 'round_id,hole_number' });

      if (!error) {
        await removeQueuedHoleScore(score.round_id, score.hole_number);
        synced += 1;
      }
    }
    return synced;
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}
