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

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];