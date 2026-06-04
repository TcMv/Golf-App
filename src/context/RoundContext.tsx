import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';
import type {
  ActiveRound,
  Course,
  Hole,
  HoleScore,
  Round,
  Shot,
  TeeSet,
} from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoundContextValue {
  activeRound: ActiveRound | null;
  startRound: (
    round: Round,
    course: Course,
    teeSet: TeeSet,
    holes: Hole[],
  ) => void;
  updateScore: (holeNumber: number, score: Partial<HoleScore>) => void;
  addShot: (holeNumber: number, shot: Shot) => void;
  setCurrentHole: (holeNumber: number) => void;
  endRound: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RoundContext = createContext<RoundContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function RoundProvider({ children }: { children: React.ReactNode }) {
  const [activeRound, setActiveRound] = useState<ActiveRound | null>(null);

  const startRound = useCallback(
    (round: Round, course: Course, teeSet: TeeSet, holes: Hole[]) => {
      const startingHole = round.starting_hole ?? 1;
      const newRound: ActiveRound = {
        round,
        course,
        teeSet,
        holes,
        scores: {},
        shots: {},
        currentHoleNumber: startingHole,
      };
      setActiveRound(newRound);
    },
    [],
  );

  const updateScore = useCallback(
    (holeNumber: number, score: Partial<HoleScore>) => {
      setActiveRound((prev) => {
        if (!prev) return prev;
        const existing = prev.scores[holeNumber] ?? {};
        return {
          ...prev,
          scores: {
            ...prev.scores,
            [holeNumber]: { ...existing, ...score },
          },
        };
      });
    },
    [],
  );

  const addShot = useCallback((holeNumber: number, shot: Shot) => {
    setActiveRound((prev) => {
      if (!prev) return prev;
      const existing = prev.shots[holeNumber] ?? [];
      return {
        ...prev,
        shots: {
          ...prev.shots,
          [holeNumber]: [...existing, shot],
        },
      };
    });
  }, []);

  const setCurrentHole = useCallback((holeNumber: number) => {
    setActiveRound((prev) => {
      if (!prev) return prev;
      return { ...prev, currentHoleNumber: holeNumber };
    });
  }, []);

  const endRound = useCallback(() => {
    setActiveRound(null);
  }, []);

  return (
    <RoundContext.Provider
      value={{ activeRound, startRound, updateScore, addShot, setCurrentHole, endRound }}
    >
      {children}
    </RoundContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRound(): RoundContextValue {
  const ctx = useContext(RoundContext);
  if (!ctx) {
    throw new Error('useRound must be used inside a RoundProvider');
  }
  return ctx;
}
