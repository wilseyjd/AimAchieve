import { supabase } from '../lib/supabase';
import { AppState, User, UserPreferences, Objective, KeyResult, Action, ActionLog } from '../types';
import { MOCK_INITIAL_DATA } from '../constants';

// --- Auth Services ---

export const registerUser = async (name: string, email: string, password: string, securityQuestion: string, securityAnswer: string): Promise<User> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        security_question: securityQuestion,
        // We'll store the answer hash in metadata for now if we want to keep that flow, 
        // OR rely on Supabase's email reset. 
        // For this migration, let's keep it simple and stick to Supabase's recovery, 
        // but we'll store the security ans locally for now if needed or drop it.
        // Actually, let's DROP the custom security question flow in favor of Supabase Reset Password for simplicity/security,
        // BUT the UI expects it. So we will store it in metadata.
        security_answer: securityAnswer
      }
    }
  });

  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Registration failed");

  // Profile creation is handled by the SQL Trigger we added.

  return {
    id: data.user.id,
    name: name,
    email: email,
    preferences: {
      dailyDigest: true,
      weeklyReport: true,
      actionReminders: true,
      reminderTime: "09:00",
      defaultCalendarView: 'week'
    }
  };
};

export const authenticateUser = async (email: string, password: string): Promise<User> => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Login failed");

  // Fetch profile for preferences/name
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  return {
    id: data.user.id,
    name: profile?.full_name || email.split('@')[0],
    email: email,
    preferences: profile?.preferences || {}
  };
};

export const logoutUser = async () => {
  await supabase.auth.signOut();
  localStorage.removeItem('orbit_current_user_id'); // Keep cleaning up legacy localstorage just in case
};

// Deprecated/No-op for Supabase Auth which handles this via email
export const getSecurityQuestion = (email: string): string | null => {
  // We can't query other users metadata in Supabase easily from client without admin key
  // So we might have to disable the "Forgot Password via Security Question" flow 
  // and use "Forgot Password via Email" instead.
  // For now, return null to signify not found.
  return null;
};

// Recreated to use Supabase Update User generic
export const resetPassword = async (email: string, securityAnswer: string, newPassword: string): Promise<void> => {
  // If we want to support the old flow, we'd need to verify the answer.
  // But strictly speaking, we should use supabase.auth.resetPasswordForEmail(email)
  throw new Error("Please use the email reset link.");
};

export const sendPasswordResetEmail = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export const changePassword = async (userId: string, currentPassword: string, newPassword: string): Promise<void> => {
  // Supabase doesn't require current password for update if logged in, but good practice.
  // direct update:
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
};

// --- DATA SERVICES (Replacing loadState/saveState) ---

export const loadState = async (): Promise<AppState> => {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ...MOCK_INITIAL_DATA, user: null };
  }

  // Fetch all data in parallel
  const [profileRes, objRes, krRes, actRes, logRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('objectives').select('*').eq('user_id', user.id),
    supabase.from('key_results').select('*').eq('user_id', user.id),
    supabase.from('actions').select('*').eq('user_id', user.id),
    supabase.from('action_logs').select('*').eq('user_id', user.id)
  ]);

  if (objRes.error) console.error(objRes.error);

  // Transform DB shape to AppState shape
  // Note: we need to handle CamelCase vs snake_case mapping

  const objectives: Objective[] = (objRes.data || []).map((o: any) => ({
    id: o.id,
    title: o.title,
    description: o.description,
    color: o.color,
    targetDate: o.target_date,
    progress: Number(o.progress)
  }));

  const keyResults: KeyResult[] = (krRes.data || []).map((k: any) => ({
    id: k.id,
    objectiveId: k.objective_id,
    title: k.title,
    currentValue: Number(k.current_value),
    targetValue: Number(k.target_value),
    unit: k.unit,
    dueDate: k.due_date,
    status: k.status
  }));

  const actions: Action[] = (actRes.data || []).map((a: any) => ({
    id: a.id,
    keyResultId: a.key_result_id,
    title: a.title,
    frequency: a.frequency,
    weeklyType: a.weekly_type,
    daysOfWeek: a.days_of_week,
    timesPerWeek: a.times_per_week,
    targetDate: a.target_date,
    startDate: a.start_date,
    createdDate: a.created_at
  }));

  const logs: ActionLog[] = (logRes.data || []).map((l: any) => ({
    id: l.id,
    actionId: l.action_id,
    date: l.date,
    completed: l.completed,
    notes: l.notes,
    timestamp: Number(l.timestamp)
  }));

  const currentUser: User = {
    id: user.id,
    name: profileRes.data?.full_name || user.email?.split('@')[0] || 'User',
    email: user.email!,
    preferences: profileRes.data?.preferences || {}
  };

  return {
    objectives,
    keyResults,
    actions,
    logs,
    user: currentUser
  };
};

export const saveState = (state: AppState) => {
  // No-op. We don't save the whole state anymore.
  // We expect the app to call specific update functions.
  console.warn("saveState called but persistence is now granular via Supabase.");
};

// --- GRANULAR UPDATES ---
export const generateId = () => crypto.randomUUID(); // Use standard UUID

// Objectives
export const createObjective = async (userId: string, obj: Objective) => {
  const { error } = await supabase.from('objectives').insert({
    id: obj.id,
    user_id: userId,
    title: obj.title,
    description: obj.description,
    color: obj.color,
    target_date: obj.targetDate,
    progress: obj.progress
  });
  if (error) throw error;
};

export const updateObjective = async (obj: Objective) => {
  const { error } = await supabase.from('objectives').update({
    title: obj.title,
    description: obj.description,
    color: obj.color,
    target_date: obj.targetDate,
    progress: obj.progress
  }).eq('id', obj.id);
  if (error) throw error;
};

// Key Results
export const createKeyResult = async (userId: string, kr: KeyResult) => {
  const { error } = await supabase.from('key_results').insert({
    id: kr.id,
    user_id: userId,
    objective_id: kr.objectiveId,
    title: kr.title,
    current_value: kr.currentValue,
    target_value: kr.targetValue,
    unit: kr.unit,
    due_date: kr.dueDate,
    status: kr.status
  });
  if (error) throw error;
};

export const updateKeyResult = async (kr: KeyResult) => {
  const { error } = await supabase.from('key_results').update({
    title: kr.title,
    current_value: kr.currentValue,
    target_value: kr.targetValue,
    unit: kr.unit,
    due_date: kr.dueDate,
    status: kr.status
  }).eq('id', kr.id);
  if (error) throw error;
};

// Actions
export const createAction = async (userId: string, action: Action) => {
  const { error } = await supabase.from('actions').insert({
    id: action.id,
    user_id: userId,
    key_result_id: action.keyResultId,
    title: action.title,
    frequency: action.frequency,
    weekly_type: action.weeklyType,
    days_of_week: action.daysOfWeek,
    times_per_week: action.timesPerWeek,
    target_date: action.targetDate,
    start_date: action.startDate,
    created_at: action.createdDate
  });
  if (error) throw error;
};

export const updateAction = async (action: Action) => {
  const { error } = await supabase.from('actions').update({
    title: action.title,
    frequency: action.frequency,
    weekly_type: action.weeklyType,
    days_of_week: action.daysOfWeek,
    times_per_week: action.timesPerWeek,
    target_date: action.targetDate,
    start_date: action.startDate
  }).eq('id', action.id);
  if (error) throw error;
};

// Logs
export const upsertActionLog = async (userId: string, log: ActionLog) => {
  // Check if exists first for this action+date to avoid duplicates if ID generation is weird, 
  // but UUIDs should be unique.
  // Actually, upsert is best.
  const { error } = await supabase.from('action_logs').upsert({
    id: log.id,
    user_id: userId,
    action_id: log.actionId,
    date: log.date,
    completed: log.completed,
    notes: log.notes,
    timestamp: log.timestamp
  });
  if (error) throw error;
};

// --- DELETE OPERATIONS ---

export const deleteObjective = async (id: string) => {
  const { error } = await supabase.from('objectives').delete().eq('id', id);
  if (error) throw error;
};

export const deleteKeyResult = async (id: string) => {
  const { error } = await supabase.from('key_results').delete().eq('id', id);
  if (error) throw error;
};

export const deleteAction = async (id: string) => {
  const { error } = await supabase.from('actions').delete().eq('id', id);
  if (error) throw error;
};
