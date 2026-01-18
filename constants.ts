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
  objectives: [
    {
      id: 'obj-1',
      title: 'Physical Vitality',
      description: 'Achieve peak physical condition through consistent training.',
      color: 'bg-emerald-600',
      targetDate: '2024-06-30',
      progress: 0,
    },
    {
      id: 'obj-2',
      title: 'Engineering Mastery',
      description: 'Deepen understanding of AI systems and frontend architecture.',
      color: 'bg-stone-600',
      targetDate: '2024-12-31',
      progress: 0,
    }
  ],
  keyResults: [
    {
      id: 'kr-1',
      objectiveId: 'obj-1',
      title: 'Decrease body fat by 5%',
      currentValue: 1,
      targetValue: 5,
      unit: '%',
      dueDate: '2024-06-30',
    },
    {
      id: 'kr-2',
      objectiveId: 'obj-2',
      title: 'Ship 5 production-grade projects',
      currentValue: 2,
      targetValue: 5,
      unit: 'projects',
      dueDate: '2024-12-31',
    }
  ],
  actions: [
    {
      id: 'act-1',
      keyResultId: 'kr-1',
      title: 'Morning Zone 2 Cardio',
      frequency: 'daily',
      createdDate: '2024-01-01',
    },
    {
      id: 'act-2',
      keyResultId: 'kr-1',
      title: 'Strength Training',
      frequency: 'weekly',
      weeklyType: 'specific_days',
      daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
      createdDate: '2024-01-01',
    },
    {
      id: 'act-3',
      keyResultId: 'kr-2',
      title: 'Deep Work Session',
      frequency: 'daily',
      createdDate: '2024-01-01',
    }
  ],
  logs: []
};

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];