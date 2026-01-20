export type Frequency = 'daily' | 'weekly' | 'one-off';

export interface ActionLog {
  id: string;
  actionId: string;
  date: string; // ISO Date string YYYY-MM-DD
  completed: boolean;
  notes?: string;
  timestamp: number;
}

export interface Action {
  id: string;
  keyResultId: string;
  title: string;
  frequency: Frequency;
  // Weekly Configuration
  weeklyType?: 'specific_days' | 'times_per_week';
  daysOfWeek?: number[]; // 0-6 for weekly (0 = Sunday) used if weeklyType is 'specific_days'
  timesPerWeek?: number; // used if weeklyType is 'times_per_week'
  // One-off
  targetDate?: string;
  startDate?: string; // When this action schedule becomes effective
  endDate?: string; // When this action schedule ends
  createdDate: string;
}

export interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  dueDate?: string;
  status?: 'active' | 'archived';
}

export interface Objective {
  id: string;
  title: string;
  description?: string;
  color: string; // Hex code or tailwind class suffix
  targetDate: string;
  progress: number; // 0-100 calculated
}

export interface UserPreferences {
  dailyDigest: boolean;
  weeklyReport: boolean;
  actionReminders: boolean;
  reminderTime: string; // e.g., "09:00"
  defaultCalendarView: 'month' | 'week';
}

export interface User {
  id: string;
  name: string;
  email: string;
  // Security fields (Optional to support legacy/mock data if needed, but enforced in new logic)
  passwordHash?: string;
  salt?: string;
  preferences?: UserPreferences;
  // Recovery
  securityQuestion?: string;
  securityAnswerHash?: string;
}

export interface AppState {
  objectives: Objective[];
  keyResults: KeyResult[];
  actions: Action[];
  logs: ActionLog[];
  user: User | null;
}

export type ViewMode = 'dashboard' | 'calendar' | 'goals' | 'analytics' | 'profile' | 'terms' | 'privacy';
export type CalendarViewMode = 'month' | 'week' | 'day';

// AI Types
export interface AIObjectiveSuggestion {
  title: string;
  description: string;
  keyResults: {
    title: string;
    targetValue: number;
    unit: string;
    actions: {
      title: string;
      frequency: Frequency;
      daysOfWeek?: number[];
    }[];
  }[];
}