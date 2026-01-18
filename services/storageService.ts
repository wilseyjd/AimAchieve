import { AppState, ActionLog, Action, Objective, KeyResult, User } from '../types';
import { MOCK_INITIAL_DATA } from '../constants';

const STORAGE_KEY = 'orbit_okr_data_v1';

export const loadState = (): AppState => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    return JSON.parse(saved);
  }
  return {
    ...MOCK_INITIAL_DATA,
    user: null, // Start logged out logic
  };
};

export const saveState = (state: AppState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

// Helper to generate IDs
export const generateId = () => Math.random().toString(36).substr(2, 9);
