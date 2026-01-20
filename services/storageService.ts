import { AppState, User, UserPreferences } from '../types';
import { MOCK_INITIAL_DATA } from '../constants';

const USERS_KEY = 'orbit_users_v1';
const CURRENT_USER_ID_KEY = 'orbit_current_user_id';
const DATA_PREFIX = 'orbit_data_v1_';

// --- Cryptography Helpers ---

// Generate a random salt
const generateSalt = () => {
  return Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

// Hash password with salt using SHA-256
const hashPassword = async (password: string, salt: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

// --- Storage Helpers ---

const getUsers = (): User[] => {
  const users = localStorage.getItem(USERS_KEY);
  return users ? JSON.parse(users) : [];
};

const saveUsers = (users: User[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

// Helper to generate IDs
export const generateId = () => Math.random().toString(36).substr(2, 9);


// --- Auth Services ---

export const registerUser = async (name: string, email: string, password: string): Promise<User> => {
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();

  if (users.find(u => u.email.toLowerCase() === normalizedEmail)) {
    throw new Error("User already exists");
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  const defaultPrefs: UserPreferences = {
    dailyDigest: true,
    weeklyReport: true,
    actionReminders: true,
    reminderTime: "09:00",
    defaultCalendarView: 'week'
  };

  const newUser: User = {
    id: generateId(),
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    salt,
    preferences: defaultPrefs
  };

  users.push(newUser);
  saveUsers(users);
  
  // Initialize empty data for user
  localStorage.setItem(`${DATA_PREFIX}${newUser.id}`, JSON.stringify(MOCK_INITIAL_DATA));

  return newUser;
};

export const authenticateUser = async (email: string, password: string): Promise<User> => {
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const user = users.find(u => u.email.toLowerCase() === normalizedEmail);

  if (!user || !user.passwordHash || !user.salt) {
    // If user exists but has no password (legacy magic link user), we might want to handle differently,
    // but for now, we treat as invalid credentials.
    throw new Error("Invalid credentials");
  }

  const hashAttempt = await hashPassword(password, user.salt);
  
  if (hashAttempt !== user.passwordHash) {
    throw new Error("Invalid credentials");
  }

  return user;
};

export const changePassword = async (userId: string, currentPassword: string, newPassword: string): Promise<void> => {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) throw new Error("User not found");
  
  const user = users[userIndex];
  
  if (!user.passwordHash || !user.salt) throw new Error("User has no password set");

  const hashAttempt = await hashPassword(currentPassword, user.salt);
  if (hashAttempt !== user.passwordHash) {
    throw new Error("Incorrect current password");
  }

  const newSalt = generateSalt();
  const newHash = await hashPassword(newPassword, newSalt);

  users[userIndex] = {
    ...user,
    passwordHash: newHash,
    salt: newSalt
  };
  
  saveUsers(users);
};

// --- State Management ---

export const loadState = (): AppState => {
  const currentUserId = localStorage.getItem(CURRENT_USER_ID_KEY);
  
  if (currentUserId) {
    const users = getUsers();
    const user = users.find(u => u.id === currentUserId);
    
    if (user) {
      const dataString = localStorage.getItem(`${DATA_PREFIX}${currentUserId}`);
      const data = dataString ? JSON.parse(dataString) : MOCK_INITIAL_DATA;
      return {
        ...data,
        user: user
      };
    }
  }

  return {
    ...MOCK_INITIAL_DATA,
    user: null,
  };
};

export const saveState = (state: AppState) => {
  if (!state.user) return;

  // 1. Save Data (Actions, Objectives, etc)
  const dataToSave = {
    objectives: state.objectives,
    keyResults: state.keyResults,
    actions: state.actions,
    logs: state.logs
  };
  localStorage.setItem(`${DATA_PREFIX}${state.user.id}`, JSON.stringify(dataToSave));

  // 2. Update User (Preferences might have changed)
  // Note: We don't update passwordHash here to avoid accidental overwrites with stale state
  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === state.user!.id);
  
  if (userIndex >= 0) {
    // Merge existing user data with updated preferences/name, ensuring we don't lose the hash/salt from storage
    // if the state.user object somehow didn't have them (though types enforce it mostly)
    const storedUser = users[userIndex];
    users[userIndex] = { 
      ...storedUser,
      ...state.user,
      passwordHash: storedUser.passwordHash, // Ensure security fields persist from storage source of truth
      salt: storedUser.salt 
    };
  } else {
    // Should typically not happen for existing users
    users.push(state.user);
  }
  saveUsers(users);
  
  // 3. Ensure current user ID is set
  localStorage.setItem(CURRENT_USER_ID_KEY, state.user.id);
};

export const logoutUser = () => {
  localStorage.removeItem(CURRENT_USER_ID_KEY);
};

export const findUserByEmail = (email: string): User | undefined => {
  const users = getUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase());
};