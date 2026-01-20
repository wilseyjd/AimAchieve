import { Objective, KeyResult, Action, ActionLog } from './types';

// Muted, natural tones for tags/accents
export const COLORS = [
  'bg-stone-600',
  'bg-orange-400',
  'bg-emerald-600',
  'bg-sky-600',
  'bg-rose-400',
  'bg-amber-500',
  'bg-indigo-400',
];

export const MOCK_INITIAL_DATA: {
  objectives: Objective[];
  keyResults: KeyResult[];
  actions: Action[];
  logs: ActionLog[];
} = {
  objectives: [],
  keyResults: [],
  actions: [],
  logs: []
};


export const CREATION_LIMITS = {
  MAX_GOALS: 5,
  MAX_KEY_RESULTS_PER_GOAL: 8,
  MAX_ACTIONS_PER_KEY_RESULT: 8
};

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];