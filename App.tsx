import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Calendar as CalendarIcon,
  Target,
  BarChart2,
  LogOut,
  Plus,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Mail,
  User as UserIcon,
  Bell,
  Clock,
  CheckCircle,
  Save,
  Shield,
  Download,
  Calendar,
  LayoutList,
  LayoutGrid,
  Filter,
  ExternalLink,
  Lock,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, endOfWeek, isSameMonth, isSameDay, isToday, parseISO, addMonths, subMonths, getDay, isWithinInterval, isBefore, startOfToday, subDays, eachDayOfInterval, eachWeekOfInterval, subWeeks } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid } from 'recharts';

// Imports from local files
import { AppState, ViewMode, CalendarViewMode, Objective, KeyResult, Action, ActionLog, User, UserPreferences, Frequency } from './types';
import { MOCK_INITIAL_DATA, COLORS, WEEKDAYS } from './constants';
import { loadState, generateId, logoutUser, authenticateUser, registerUser, changePassword, getSecurityQuestion, sendPasswordResetEmail, createObjective, updateObjective, deleteObjective, createKeyResult, updateKeyResult, deleteKeyResult, createAction, updateAction, deleteAction, upsertActionLog } from './services/storageService';
import { generateOKRFromGoal } from './services/geminiService';
import { Button } from './components/ui/Button';
import { Modal } from './components/ui/Modal';
import { ActionItem } from './components/ActionItem';
import { GoalCard } from './components/GoalCard';

// Custom Logo Component
const AimAchieveLogo = ({ className = "w-8 h-8", inverted = false }: { className?: string, inverted?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Rocket - Filled */}
    <path
      d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"
      fill={inverted ? "currentColor" : "#1c1917"}
    />
    <path
      d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
      fill={inverted ? "currentColor" : "#1c1917"}
    />
    <path
      d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"
      fill={inverted ? "currentColor" : "#1c1917"}
    />
    <path
      d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"
      fill={inverted ? "currentColor" : "#1c1917"}
    />

    {/* Checkmark Background to clear lines behind it */}
    <circle cx="17" cy="17" r="5" fill={inverted ? "#1c1917" : "white"} />

    {/* Checkmark */}
    <path
      d="M14 17L16 19L20 15"
      stroke="#10b981"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Helper to generate iCal data
function generateICalData(state: AppState) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AimAchieve//Goal Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

  state.actions.forEach(action => {
    const kr = state.keyResults.find(k => k.id === action.keyResultId);
    if ((kr?.status || 'active') === 'archived') return;

    const obj = state.objectives.find(o => o.id === kr?.objectiveId);

    let rrule = '';
    let dtstart = action.startDate ? action.startDate.replace(/-/g, '') : today;

    // Construct Summary
    const summary = `🎯 ${action.title}`;
    const description = `Goal: ${obj?.title || 'General'}\\nKey Result: ${kr?.title || 'N/A'}`;

    if (action.frequency === 'daily') {
      rrule = 'RRULE:FREQ=DAILY';
    } else if (action.frequency === 'weekly') {
      if (action.weeklyType === 'specific_days' && action.daysOfWeek && action.daysOfWeek.length > 0) {
        // Map 0-6 to SU,MO,TU...
        const daysMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
        const byDay = action.daysOfWeek.map(d => daysMap[d]).join(',');
        rrule = `RRULE:FREQ=WEEKLY;BYDAY=${byDay}`;
      } else if (action.weeklyType === 'times_per_week') {
        // Generic weekly recurrence
        rrule = 'RRULE:FREQ=WEEKLY';
      }
    } else if (action.frequency === 'one-off' && action.targetDate) {
      dtstart = action.targetDate.replace(/-/g, '');
    } else {
      return; // Skip invalid actions
    }

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${action.id}@aimachieve.app`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${dtstart}`);
    if (rrule) lines.push(rrule);
    lines.push(`SUMMARY:${summary}`);
    lines.push(`DESCRIPTION:${description}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// --- MAIN APP COMPONENT ---
export default function App() {
  const [state, setState] = useState<AppState>({ ...MOCK_INITIAL_DATA, user: null });
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');

  // Initialize sidebar state based on screen width (Client-side only)
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  // Auth State
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot-password' | 'reset-password'>('login');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
    securityQuestion: 'What was the name of your first pet?',
    securityAnswer: '',
    newPassword: ''
  });
  const [resetFlowState, setResetFlowState] = useState<{ step: 'email' | 'verify' }>({ step: 'email' });
  const [retrievedQuestion, setRetrievedQuestion] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Load data on mount
  useEffect(() => {
    const init = async () => {
      const data = await loadState();
      setState(data);
    };
    init();
  }, []);

  // Save state effect removed (using granular updates)

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (authMode === 'login') {
        const user = await authenticateUser(authForm.email, authForm.password);
        // User ID is handled by Supabase session usually, but we keep local logic for now
        const data = await loadState(); // Load fresh data after login
        setState(data);
      } else if (authMode === 'signup') {
        // Basic Validation
        if (!authForm.name) throw new Error("Name is required");
        if (authForm.password.length < 6) throw new Error("Password must be at least 6 characters");

        await registerUser(authForm.name, authForm.email, authForm.password, authForm.securityQuestion, authForm.securityAnswer);
        const data = await loadState();
        setState(data);
      } else if (authMode === 'forgot-password') {
        // Switch to Email Reset Logic
        await sendPasswordResetEmail(authForm.email);
        alert("Password reset email sent. Please check your inbox.");
        setAuthMode('login');
      } else if (authMode === 'reset-password') {
        // ...
      }

      // Reset Form only if not in middle of reset flow
      if (authMode === 'login' || authMode === 'signup') {
        setAuthForm({ name: '', email: '', password: '', securityQuestion: 'What was the name of your first pet?', securityAnswer: '', newPassword: '' });
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  /* handleResetSubmit removed as we rely on Supabase Email Link */

  const handleLogout = () => {
    logoutUser();
    setState({ ...MOCK_INITIAL_DATA, user: null });
    setState({ ...MOCK_INITIAL_DATA, user: null });
    setAuthForm({ name: '', email: '', password: '', securityQuestion: 'What was the name of your first pet?', securityAnswer: '', newPassword: '' });
    setAuthError(null);
    setAuthMode('login');
    setResetFlowState({ step: 'email' });
    setRetrievedQuestion(null);
  };

  const toggleAction = async (actionId: string, date: string, currentStatus: boolean) => {
    // Optimistic Update
    setState(prev => {
      let newLogs = [...prev.logs];
      const existingIndex = newLogs.findIndex(l => l.actionId === actionId && l.date === date);

      if (existingIndex >= 0) {
        newLogs[existingIndex] = {
          ...newLogs[existingIndex],
          completed: !currentStatus,
          timestamp: Date.now()
        };
      } else {
        newLogs.push({
          id: generateId(), // Temp ID for UI, upsert will handle DB
          actionId,
          date,
          completed: true,
          timestamp: Date.now()
        });
      }
      return { ...prev, logs: newLogs };
    });

    // DB Update
    if (state.user) {
      // Find if we have an existing log ID or need a new one
      const existingLog = state.logs.find(l => l.actionId === actionId && l.date === date);
      const logId = existingLog ? existingLog.id : generateId();

      try {
        await upsertActionLog(state.user.id, {
          id: logId,
          actionId,
          date,
          completed: !currentStatus,
          timestamp: Date.now()
        });
      } catch (e) {
        console.error("Failed to sync log", e);
        // Revert optimistic update? Or just warn.
      }
    }
  };

  if (!state.user) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center mb-6">
            <div className="bg-stone-900 p-3 rounded-2xl shadow-xl text-white">
              <AimAchieveLogo className="w-8 h-8" inverted />
            </div>
          </div>
          <h2 className="text-center text-3xl font-bold tracking-tight text-stone-900">AimAchieve</h2>
          <p className="mt-2 text-center text-sm text-stone-500">
            {authMode === 'login' && 'Sign in to continue tracking.'}
            {authMode === 'signup' && 'Create your secure account.'}
            {authMode === 'forgot-password' && 'Recover your account.'}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl border border-stone-100 relative">

            <form className="space-y-6" onSubmit={handleAuthSubmit}>
              {authError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-lg text-sm flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                  {authError}
                </div>
              )}

              {authMode === 'signup' && (
                <>
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-stone-700">Full Name</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <UserIcon className="h-5 w-5 text-stone-400" aria-hidden="true" />
                      </div>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        required={authMode === 'signup'}
                        value={authForm.name}
                        onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                        className="appearance-none block w-full pl-10 pr-3 py-2 border border-stone-200 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                        placeholder="Jane Doe"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="security-question" className="block text-sm font-medium text-stone-700">Security Question</label>
                    <select
                      id="security-question"
                      value={authForm.securityQuestion}
                      onChange={(e) => setAuthForm({ ...authForm, securityQuestion: e.target.value })}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-stone-500 focus:border-stone-500 sm:text-sm rounded-md border"
                    >
                      <option>What was the name of your first pet?</option>
                      <option>What is your mother's maiden name?</option>
                      <option>What city were you born in?</option>
                      <option>What is the name of your favorite teacher?</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="security-answer" className="block text-sm font-medium text-stone-700">Security Answer</label>
                    <input
                      id="security-answer"
                      type="text"
                      required={authMode === 'signup'}
                      value={authForm.securityAnswer}
                      onChange={(e) => setAuthForm({ ...authForm, securityAnswer: e.target.value })}
                      className="mt-1 appearance-none block w-full px-3 py-2 border border-stone-200 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                      placeholder="Answer"
                    />
                  </div>
                </>
              )}

              {/* Email Field - Always show unless in Verify Step of Reset */}
              {!(authMode === 'forgot-password' && resetFlowState.step === 'verify') && (
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-stone-700">Email address</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-stone-400" aria-hidden="true" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                      className="appearance-none block w-full pl-10 pr-3 py-2 border border-stone-200 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
              )}

              {/* Password Field - Login & Signup only */}
              {['login', 'signup'].includes(authMode) && (
                <div>
                  <div className="flex justify-between items-center">
                    <label htmlFor="password" className="block text-sm font-medium text-stone-700">Password</label>
                    {authMode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('forgot-password');
                          setResetFlowState({ step: 'email' });
                          setAuthError(null);
                        }}
                        className="text-sm font-medium text-stone-600 hover:text-stone-900"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-stone-400" aria-hidden="true" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={authMode === 'login' ? "current-password" : "new-password"}
                      required
                      minLength={6}
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                      className="appearance-none block w-full pl-10 pr-10 py-2 border border-stone-200 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer text-stone-400 hover:text-stone-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Reset Password - Verify Step */}
              {authMode === 'forgot-password' && resetFlowState.step === 'verify' && (
                <div className="space-y-4">
                  <div className="bg-stone-50 p-4 rounded-lg border border-stone-200">
                    <p className="text-sm text-stone-500 mb-1">Security Question:</p>
                    <p className="text-stone-900 font-medium">{retrievedQuestion}</p>
                  </div>

                  <div>
                    <label htmlFor="reset-answer" className="block text-sm font-medium text-stone-700">Your Answer</label>
                    <input
                      id="reset-answer"
                      type="text"
                      required
                      value={authForm.securityAnswer}
                      onChange={(e) => setAuthForm({ ...authForm, securityAnswer: e.target.value })}
                      className="mt-1 appearance-none block w-full px-3 py-2 border border-stone-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="new-password" className="block text-sm font-medium text-stone-700">New Password</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={6}
                        value={authForm.newPassword}
                        onChange={(e) => setAuthForm({ ...authForm, newPassword: e.target.value })}
                        className="appearance-none block w-full px-3 py-2 border border-stone-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                        placeholder="New Password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer text-stone-400 hover:text-stone-600"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Button type="submit" className="w-full" isLoading={authLoading}>
                  {authMode === 'login' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : resetFlowState.step === 'email' ? 'Continue' : 'Reset Password'}
                </Button>

                {authMode === 'forgot-password' && (
                  <Button
                    variant="ghost"
                    className="w-full mt-2"
                    onClick={() => {
                      setAuthMode('login');
                      setResetFlowState({ step: 'email' });
                      setAuthError(null);
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>

            {authMode !== 'forgot-password' && (
              <div className="mt-6 border-t border-stone-100 pt-6">
                <div className="text-center text-sm">
                  <span className="text-stone-500">
                    {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
                  </span>
                  <button
                    onClick={() => {
                      setAuthMode(authMode === 'login' ? 'signup' : 'login');
                      setAuthError(null);
                      setAuthForm({ name: '', email: '', password: '', securityQuestion: 'What was the name of your first pet?', securityAnswer: '', newPassword: '' });
                    }}
                    className="font-medium text-stone-900 hover:text-stone-700"
                  >
                    {authMode === 'login' ? 'Sign up' : 'Log in'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden text-stone-900 relative">

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Responsive */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 bg-[#1c1917] text-stone-400 transition-all duration-300 flex flex-col shadow-2xl md:relative 
          ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:w-20 md:translate-x-0'}
        `}
      >
        <div className="h-20 flex items-center px-6 border-b border-stone-800">
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <div className="bg-white/10 p-2 rounded-lg group-hover:bg-white/20 transition-colors text-white">
              <AimAchieveLogo className="w-5 h-5" inverted />
            </div>
            {isSidebarOpen && <span className="font-bold text-lg text-stone-100 tracking-tight">AimAchieve</span>}
          </div>
        </div>

        <nav className="flex-1 py-8 px-4 space-y-2 overflow-y-auto">
          <NavButton active={currentView === 'dashboard'} onClick={() => { setCurrentView('dashboard'); if (window.innerWidth < 768) setIsSidebarOpen(false); }} icon={<LayoutDashboard />} label="Dashboard" isOpen={isSidebarOpen} />
          <NavButton active={currentView === 'goals'} onClick={() => { setCurrentView('goals'); if (window.innerWidth < 768) setIsSidebarOpen(false); }} icon={<Target />} label="Goals" isOpen={isSidebarOpen} />
          <NavButton active={currentView === 'calendar'} onClick={() => { setCurrentView('calendar'); if (window.innerWidth < 768) setIsSidebarOpen(false); }} icon={<CalendarIcon />} label="Calendar" isOpen={isSidebarOpen} />
          <NavButton active={currentView === 'analytics'} onClick={() => { setCurrentView('analytics'); if (window.innerWidth < 768) setIsSidebarOpen(false); }} icon={<BarChart2 />} label="Analytics" isOpen={isSidebarOpen} />
        </nav>

        <div className="p-4 border-t border-stone-800 space-y-2">
          <button onClick={() => { setCurrentView('profile'); if (window.innerWidth < 768) setIsSidebarOpen(false); }} className={`flex items-center space-x-3 transition-colors w-full p-3 rounded-xl hover:bg-white/5 ${currentView === 'profile' ? 'bg-stone-800 text-white' : 'text-stone-500'}`}>
            <UserIcon className="w-5 h-5" />
            {isSidebarOpen && <span className="font-medium text-sm">Profile</span>}
          </button>

          <button onClick={handleLogout} className="flex items-center space-x-3 text-stone-500 hover:text-rose-400 transition-colors w-full p-3 rounded-xl hover:bg-white/5">
            <LogOut className="w-5 h-5" />
            {isSidebarOpen && <span className="font-medium text-sm">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative w-full flex flex-col">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center p-4 border-b border-stone-200 bg-white sticky top-0 z-20 shadow-sm">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="ml-3 font-bold text-stone-900 text-lg tracking-tight">AimAchieve</span>
        </div>

        {currentView === 'dashboard' && <Dashboard state={state} onToggleAction={toggleAction} onViewChange={setCurrentView} />}
        {currentView === 'goals' && <GoalsPage state={state} setState={setState} />}
        {currentView === 'calendar' && <CalendarPage state={state} onToggleAction={toggleAction} />}
        {currentView === 'analytics' && <AnalyticsPage state={state} />}
        {currentView === 'profile' && <ProfilePage state={state} setState={setState} />}
      </main>
    </div>
  );
}

const NavButton = ({ active, onClick, icon, label, isOpen }: any) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-3 py-3 rounded-xl transition-all duration-200 group ${active ? 'bg-stone-800 text-white shadow-lg shadow-black/20' : 'text-stone-400 hover:bg-stone-800/50 hover:text-stone-200'
      }`}
    title={!isOpen ? label : ''}
  >
    <div className={`${active ? 'text-white' : 'text-stone-500 group-hover:text-stone-200'}`}>{icon}</div>
    {isOpen && <span className="font-medium text-sm whitespace-nowrap">{label}</span>}
  </button>
);

// --- PAGES ---

function Dashboard({ state, onToggleAction, onViewChange }: { state: AppState, onToggleAction: any, onViewChange: (v: ViewMode) => void }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayDate = new Date();

  // Filter for actions that belong to ACTIVE key results
  const todaysActions = state.actions.filter(action => {
    // Check if parent KeyResult is archived
    const parentKR = state.keyResults.find(kr => kr.id === action.keyResultId);
    if ((parentKR?.status || 'active') === 'archived') return false;

    // Check start date (Actions shouldn't appear before they start)
    if (action.startDate && today < action.startDate) return false;

    if (action.frequency === 'daily') return true;
    if (action.frequency === 'weekly') {
      if (action.weeklyType === 'specific_days') {
        return action.daysOfWeek?.includes(getDay(todayDate));
      } else if (action.weeklyType === 'times_per_week') {
        // Show if not yet completed target times for this week
        return true;
      }
      // Default fallback
      return action.daysOfWeek ? action.daysOfWeek.includes(getDay(todayDate)) : false;
    }
    if (action.frequency === 'one-off') return action.targetDate === today;
    return false;
  });

  const completedCount = todaysActions.filter(a => {
    // Standard completion check for today
    return state.logs.find(l => l.actionId === a.id && l.date === today && l.completed);
  }).length;

  const progress = todaysActions.length > 0 ? (completedCount / todaysActions.length) * 100 : 0;

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-7xl mx-auto w-full">
      <header className="mb-8 md:mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-stone-900 tracking-tighter mb-2">Good Morning, {state.user?.name.split(' ')[0]}</h1>
          <p className="text-stone-500 text-base md:text-lg">Focus for {format(new Date(), 'EEEE, MMMM do')}</p>
        </div>
        <div className="text-left md:text-right bg-white md:bg-transparent p-3 md:p-0 rounded-lg md:rounded-none border md:border-none border-stone-100 shadow-sm md:shadow-none w-full md:w-auto">
          <div className="text-xs md:text-sm font-semibold text-stone-400 uppercase tracking-widest">Status</div>
          <div className="text-stone-900 font-medium text-sm md:text-base">{completedCount} / {todaysActions.length} Completed</div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 mb-8 md:mb-12">
        {/* Summary Card - Dark Minimalist */}
        <div className="bg-[#1c1917] rounded-2xl p-6 md:p-8 text-white shadow-2xl col-span-1 lg:col-span-2 relative overflow-hidden group min-h-[250px] flex flex-col justify-between">
          <div className="relative z-10">
            <h2 className="text-stone-400 font-medium mb-1 uppercase tracking-widest text-xs">Daily Velocity</h2>
            <div className="text-5xl md:text-6xl font-bold tracking-tighter">{Math.round(progress)}%</div>
          </div>

          <div className="mt-8 relative z-10">
            <div className="w-full bg-stone-800 rounded-full h-1.5 mb-4 overflow-hidden">
              <div className="bg-white h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="text-stone-400 text-sm">
              {progress === 100 ? "All targets hit. Outstanding." : "Consistency is key. Keep pushing."}
            </p>
          </div>
          <AimAchieveLogo className="absolute right-[-20px] bottom-[-40px] w-64 h-64 text-white opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-500 rotate-12" inverted />
        </div>

        {/* Quick Stats - Clean White */}
        <div className="bg-white rounded-2xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-stone-900 font-bold text-lg tracking-tight">Active Goals</h3>
            <Button variant="ghost" size="sm" onClick={() => onViewChange('goals')}>View All</Button>
          </div>
          <div className="space-y-5 flex-1">
            {state.objectives.slice(0, 3).map(obj => (
              <div key={obj.id} className="group cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-stone-700 group-hover:text-stone-900 transition-colors truncate max-w-[140px]">{obj.title}</span>
                  <span className="text-xs text-stone-400">{format(parseISO(obj.targetDate), 'MMM d')}</span>
                </div>
                <div className="h-1 w-full bg-stone-100 rounded-full overflow-hidden">
                  {/* Calculate objective progress based on active key results only */}
                  {(() => {
                    const activeKRs = state.keyResults.filter(k => k.objectiveId === obj.id && (k.status || 'active') === 'active');
                    const total = activeKRs.length;
                    const p = total > 0 ? activeKRs.reduce((acc, k) => acc + (k.currentValue / k.targetValue), 0) / total : 0;
                    return <div className={`h-full ${obj.color} opacity-80`} style={{ width: `${Math.min(100, p * 100)}%` }}></div>
                  })()}
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full mt-6 justify-between group">
            Create New <Plus className="w-4 h-4 text-stone-400 group-hover:text-stone-900" />
          </Button>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Today's Actions</h2>
      </div>

      {todaysActions.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-stone-300">
          <Sparkles className="w-8 h-8 mx-auto mb-4 text-stone-300" />
          <p className="text-stone-500 font-medium">No actions scheduled. Enjoy the silence.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {todaysActions.map(action => {
            const kr = state.keyResults.find(k => k.id === action.keyResultId);
            const obj = state.objectives.find(o => o.id === kr?.objectiveId);
            const log = state.logs.find(l => l.actionId === action.id && l.date === today);

            // Calculate weekly progress if needed
            let weeklyProgress = undefined;
            if (action.frequency === 'weekly' && action.weeklyType === 'times_per_week' && action.timesPerWeek) {
              const start = startOfWeek(new Date());
              const end = endOfWeek(new Date());
              const current = state.logs.filter(l =>
                l.actionId === action.id &&
                l.completed &&
                isWithinInterval(parseISO(l.date), { start, end })
              ).length;
              weeklyProgress = { current, target: action.timesPerWeek };
            }

            return (
              <ActionItem
                key={action.id}
                action={action}
                keyResult={kr}
                objective={obj}
                log={log}
                dateStr={today}
                onToggle={onToggleAction}
                weeklyProgress={weeklyProgress}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function GoalsPage({ state, setState }: { state: AppState, setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  // Modal State
  const [modalType, setModalType] = useState<'create-goal' | 'ai-preview' | 'add-kr' | 'add-action' | 'edit-kr' | 'edit-action' | 'edit-goal' | 'update-progress' | null>(null);

  // Selection State
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);
  const [selectedKeyResultId, setSelectedKeyResultId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Form States
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

  // Generic Form Data State
  const [formData, setFormData] = useState<any>({});

  const closeModals = () => {
    setModalType(null);
    setFormData({});
    setEditingItem(null);
    setSelectedObjectiveId(null);
    setSelectedKeyResultId(null);
    setAiPrompt('');
  };

  // --- Handlers for opening modals ---

  const openAddGoal = () => {
    setFormData({ title: '', targetDate: '', description: '' });
    setModalType('create-goal');
  };

  const openEditGoal = (obj: Objective) => {
    setEditingItem(obj);
    setFormData({ title: obj.title, targetDate: obj.targetDate, description: obj.description || '' });
    setModalType('edit-goal');
  };

  const openAddKeyResult = (objId: string) => {
    setSelectedObjectiveId(objId);
    setFormData({ title: '', targetValue: '', unit: '', currentValue: 0, dueDate: '' });
    setModalType('add-kr');
  };

  const openEditKeyResult = (kr: KeyResult) => {
    setEditingItem(kr);
    setFormData({ title: kr.title, targetValue: kr.targetValue, unit: kr.unit, currentValue: kr.currentValue, dueDate: kr.dueDate || '' });
    setModalType('edit-kr');
  };

  const openAddAction = (krId: string) => {
    setSelectedKeyResultId(krId);
    setFormData({
      title: '',
      frequency: 'daily',
      weeklyType: 'specific_days', // Default
      daysOfWeek: [],
      timesPerWeek: 3,
      targetDate: '',
      startDate: format(new Date(), 'yyyy-MM-dd') // Default to today
    });
    setModalType('add-action');
  };

  const openEditAction = (action: Action) => {
    setEditingItem(action);
    setFormData({
      title: action.title,
      frequency: action.frequency,
      weeklyType: action.weeklyType || (action.daysOfWeek ? 'specific_days' : 'times_per_week'),
      daysOfWeek: action.daysOfWeek || [],
      timesPerWeek: action.timesPerWeek || 3,
      targetDate: action.targetDate || '',
      startDate: action.startDate || action.createdDate
    });
    setModalType('edit-action');
  };

  const openUpdateProgress = (kr: KeyResult) => {
    setEditingItem(kr);
    setFormData({ currentValue: kr.currentValue });
    setModalType('update-progress');
  };

  // --- Handlers for saving data ---

  const handleSaveGoal = async () => {
    if (!formData.title || !state.user) return;

    if (modalType === 'edit-goal' && editingItem) {
      // Update
      const updatedObj = {
        ...editingItem,
        title: formData.title,
        targetDate: formData.targetDate || editingItem.targetDate,
        description: formData.description
      };
      // Optimistic
      setState(prev => ({
        ...prev,
        objectives: prev.objectives.map(o => o.id === editingItem.id ? updatedObj : o)
      }));
      // DB
      await updateObjective(updatedObj);
    } else {
      // Create
      const newObj: Objective = {
        id: generateId(),
        title: formData.title,
        description: formData.description,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        targetDate: formData.targetDate || format(addMonths(new Date(), 3), 'yyyy-MM-dd'),
        progress: 0
      };
      // Optimistic
      setState(prev => ({ ...prev, objectives: [...prev.objectives, newObj] }));
      // DB
      await createObjective(state.user.id, newObj);
    }
    closeModals();
  };

  const handleSaveKeyResult = async () => {
    if (!formData.title || !state.user) return;
    const targetVal = parseFloat(formData.targetValue);
    const currentVal = parseFloat(formData.currentValue);

    if (modalType === 'edit-kr' && editingItem) {
      const updatedKR = {
        ...editingItem,
        title: formData.title,
        targetValue: isNaN(targetVal) ? editingItem.targetValue : targetVal,
        currentValue: isNaN(currentVal) ? editingItem.currentValue : currentVal,
        unit: formData.unit,
        dueDate: formData.dueDate || undefined
      };
      setState(prev => ({
        ...prev,
        keyResults: prev.keyResults.map(kr => kr.id === editingItem.id ? updatedKR : kr)
      }));
      await updateKeyResult(updatedKR);
    } else if (modalType === 'add-kr' && selectedObjectiveId) {
      const newKr: KeyResult = {
        id: generateId(),
        objectiveId: selectedObjectiveId,
        title: formData.title,
        targetValue: isNaN(targetVal) ? 100 : targetVal,
        currentValue: isNaN(currentVal) ? 0 : currentVal,
        unit: formData.unit || 'units',
        dueDate: formData.dueDate || undefined,
        status: 'active'
      };
      setState(prev => ({ ...prev, keyResults: [...prev.keyResults, newKr] }));
      await createKeyResult(state.user.id, newKr);
    }
    closeModals();
  };

  const handleSaveProgress = async () => {
    const val = parseFloat(formData.currentValue);
    if (editingItem && !isNaN(val)) {
      const updatedKR = { ...editingItem, currentValue: val };
      setState(prev => ({
        ...prev,
        keyResults: prev.keyResults.map(kr => kr.id === editingItem.id ? updatedKR : kr)
      }));
      await updateKeyResult(updatedKR);
    }
    closeModals();
  };

  const handleSaveAction = async () => {
    if (!formData.title || !state.user) return;

    const buildActionData = () => ({
      title: formData.title,
      frequency: formData.frequency,
      weeklyType: formData.frequency === 'weekly' ? formData.weeklyType : undefined,
      daysOfWeek: (formData.frequency === 'weekly' && formData.weeklyType === 'specific_days') ? formData.daysOfWeek : undefined,
      timesPerWeek: (formData.frequency === 'weekly' && formData.weeklyType === 'times_per_week') ? Number(formData.timesPerWeek) : undefined,
      targetDate: formData.frequency === 'one-off' ? formData.targetDate : undefined,
      startDate: formData.startDate || format(new Date(), 'yyyy-MM-dd')
    });

    if (modalType === 'edit-action' && editingItem) {
      const updatedAction = {
        ...editingItem,
        ...buildActionData()
      };
      setState(prev => ({
        ...prev,
        actions: prev.actions.map(a => a.id === editingItem.id ? updatedAction : a)
      }));
      await updateAction(updatedAction);
    } else if (modalType === 'add-action' && selectedKeyResultId) {
      const newAction: Action = {
        id: generateId(),
        keyResultId: selectedKeyResultId,
        ...buildActionData(),
        createdDate: format(new Date(), 'yyyy-MM-dd')
      } as Action;
      setState(prev => ({ ...prev, actions: [...prev.actions, newAction] }));
      await createAction(state.user.id, newAction);
    }
    closeModals();
  };

  // --- Handlers for Deletion / Archival ---

  const handleDeleteObjective = async (id: string) => {
    if (confirm('Delete this goal and all associated results?')) {
      setState(prev => ({
        ...prev,
        objectives: prev.objectives.filter(o => o.id !== id),
        keyResults: prev.keyResults.filter(k => k.objectiveId !== id),
        actions: prev.actions.filter(a => {
          const kr = prev.keyResults.find(k => k.id === a.keyResultId);
          return kr?.objectiveId !== id;
        })
      }));
      await deleteObjective(id);
    }
  };

  const handleDeleteKeyResult = async (id: string) => {
    if (confirm('Delete this Key Result? All history will be lost. Use Archive to preserve history.')) {
      setState(prev => ({
        ...prev,
        keyResults: prev.keyResults.filter(k => k.id !== id),
        actions: prev.actions.filter(a => a.keyResultId !== id)
      }));
      await deleteKeyResult(id);
    }
  };

  const handleToggleKRStatus = async (id: string, newStatus: 'active' | 'archived') => {
    const kr = state.keyResults.find(k => k.id === id);
    if (!kr) return;
    const updated = { ...kr, status: newStatus };
    setState(prev => ({
      ...prev,
      keyResults: prev.keyResults.map(k => k.id === id ? updated : k)
    }));
    await updateKeyResult(updated);
  };

  const handleDeleteAction = async (id: string) => {
    if (confirm('Delete this action?')) {
      setState(prev => ({
        ...prev,
        actions: prev.actions.filter(a => a.id !== id)
      }));
      await deleteAction(id);
    }
  };

  // --- AI Logic ---
  const handleGenerateAI = async () => {
    if (!aiPrompt) return;
    setIsGenerating(true);
    try {
      const result = await generateOKRFromGoal(aiPrompt);
      setPreviewData(result);
      setModalType('ai-preview');
    } catch (e) {
      console.error(e);
      alert('Failed to generate OKRs. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyAI = async () => {
    if (!previewData || !state.user) return;
    const newObj: Objective = {
      id: generateId(),
      title: previewData.title,
      description: previewData.description,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      targetDate: format(addMonths(new Date(), 3), 'yyyy-MM-dd'),
      progress: 0
    };

    const newKRs: KeyResult[] = [];
    const newActions: Action[] = [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    previewData.keyResults.forEach((krData: any) => {
      const krId = generateId();
      newKRs.push({
        id: krId,
        objectiveId: newObj.id,
        title: krData.title,
        targetValue: krData.targetValue,
        currentValue: 0,
        unit: krData.unit,
        dueDate: undefined,
        status: 'active'
      });

      krData.actions.forEach((actData: any) => {
        newActions.push({
          id: generateId(),
          keyResultId: krId,
          title: actData.title,
          frequency: actData.frequency,
          weeklyType: actData.daysOfWeek ? 'specific_days' : 'times_per_week',
          timesPerWeek: 3,
          daysOfWeek: actData.daysOfWeek,
          createdDate: todayStr,
          startDate: todayStr
        });
      });
    });

    // Optimistic Update
    setState(prev => ({
      ...prev,
      objectives: [...prev.objectives, newObj],
      keyResults: [...prev.keyResults, ...newKRs],
      actions: [...prev.actions, ...newActions]
    }));

    // Async DB Creation
    try {
      await createObjective(state.user.id, newObj);
      // We can run these in parallel
      await Promise.all([
        ...newKRs.map(kr => createKeyResult(state.user!.id, kr)),
        ...newActions.map(act => createAction(state.user!.id, act))
      ]);
    } catch (e) {
      console.error("Failed to persist AI goal", e);
      // Could show error toast or revert
    }

    closeModals();
  };

  // --- Render ---

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Objectives</h1>
          <p className="text-stone-500 mt-1 text-sm md:text-base">Strategic goals and key results.</p>
        </div>
        <Button onClick={openAddGoal} className="shadow-lg shadow-stone-900/20">
          <Plus className="w-5 h-5 mr-2" /> <span className="hidden sm:inline">New Goal</span><span className="sm:hidden">New</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {state.objectives.map(obj => (
          <GoalCard
            key={obj.id}
            objective={obj}
            keyResults={state.keyResults.filter(k => k.objectiveId === obj.id)}
            actions={state.actions}
            onAddKeyResult={openAddKeyResult}
            onAddAction={openAddAction}
            onEditKeyResult={openEditKeyResult}
            onEditObjective={openEditGoal}
            onDeleteObjective={handleDeleteObjective}
            onDeleteKeyResult={handleDeleteKeyResult}
            onEditAction={openEditAction}
            onDeleteAction={handleDeleteAction}
            onToggleKRStatus={handleToggleKRStatus}
            onUpdateProgress={openUpdateProgress}
          />
        ))}
      </div>

      {/* --- MODALS --- */}

      {/* 1. Goal Modal (Create & Edit) */}
      <Modal
        isOpen={modalType === 'create-goal' || modalType === 'edit-goal'}
        onClose={closeModals}
        title={modalType === 'create-goal' ? "Define Objective" : "Edit Objective"}
      >
        <div className="space-y-6">
          {modalType === 'create-goal' && (
            <div className="bg-stone-50 p-6 rounded-xl border border-stone-100">
              <label className="block text-sm font-bold text-stone-900 mb-3 flex items-center">
                <Sparkles className="w-4 h-4 mr-2 text-stone-900" />
                AI Architect
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. Launch a newsletter..."
                  className="flex-1 rounded-lg border-stone-200 focus:border-stone-900 focus:ring-stone-900 text-sm p-3 bg-white"
                />
                <Button onClick={handleGenerateAI} isLoading={isGenerating}>Draft</Button>
              </div>
              <p className="text-xs text-stone-400 mt-2">Generating structures...</p>
            </div>
          )}

          {modalType === 'create-goal' && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white text-stone-400 font-medium">Manual Entry</span>
              </div>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Objective Title</label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
                placeholder="e.g. Master Guitar"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Description (Optional)</label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
                placeholder="Briefly describe the goal..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Target Date</label>
              <input
                type="date"
                value={formData.targetDate || ''}
                onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
              />
            </div>
            <Button onClick={handleSaveGoal} className="w-full" disabled={!formData.title}>
              {modalType === 'create-goal' ? 'Initialize Objective' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 2. Key Result Modal (Create & Edit/Update) */}
      <Modal
        isOpen={modalType === 'add-kr' || modalType === 'edit-kr'}
        onClose={closeModals}
        title={modalType === 'add-kr' ? "Add Key Result" : "Update Key Result"}
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Title</label>
            <input
              type="text"
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
              placeholder="e.g. Run 5km in 25 mins"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Current Value</label>
              <input
                type="number"
                value={formData.currentValue}
                onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })}
                className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Target Value</label>
              <input
                type="number"
                value={formData.targetValue}
                onChange={(e) => setFormData({ ...formData, targetValue: e.target.value })}
                className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Unit</label>
            <input
              type="text"
              value={formData.unit || ''}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
              placeholder="e.g. km, %, books"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Due Date (Optional)</label>
            <input
              type="date"
              value={formData.dueDate || ''}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
            />
          </div>
          <Button onClick={handleSaveKeyResult} className="w-full" disabled={!formData.title}>
            Save Key Result
          </Button>
        </div>
      </Modal>

      {/* 3. Action Modal (Create & Edit) */}
      <Modal
        isOpen={modalType === 'add-action' || modalType === 'edit-action'}
        onClose={closeModals}
        title={modalType === 'add-action' ? "New Action" : "Edit Action"}
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Action Title</label>
            <input
              type="text"
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
              placeholder="e.g. Read 10 pages"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Frequency</label>
            <select
              value={formData.frequency || 'daily'}
              onChange={(e) => {
                const newFreq = e.target.value as Frequency;
                setFormData({
                  ...formData,
                  frequency: newFreq,
                  // Reset weekly type defaults if switching to weekly
                  weeklyType: newFreq === 'weekly' ? 'specific_days' : undefined
                })
              }}
              className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border bg-white"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="one-off">One-off</option>
            </select>
          </div>

          {/* Start Date Configuration - Available for all frequencies except one-off (which has targetDate) */}
          {formData.frequency !== 'one-off' && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Start Date</label>
              <input
                type="date"
                value={formData.startDate || ''}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
              />
              <p className="text-xs text-stone-400 mt-1">Action will appear in schedule from this date.</p>
            </div>
          )}

          {formData.frequency === 'weekly' && (
            <div className="space-y-4 bg-stone-50 p-4 rounded-lg border border-stone-100">
              <div className="flex flex-col sm:flex-row gap-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={formData.weeklyType === 'specific_days'}
                    onChange={() => setFormData({ ...formData, weeklyType: 'specific_days' })}
                    className="text-stone-900 focus:ring-stone-900"
                  />
                  <span className="text-sm text-stone-700">Specific Days</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={formData.weeklyType === 'times_per_week'}
                    onChange={() => setFormData({ ...formData, weeklyType: 'times_per_week' })}
                    className="text-stone-900 focus:ring-stone-900"
                  />
                  <span className="text-sm text-stone-700">Times per Week</span>
                </label>
              </div>

              {formData.weeklyType === 'specific_days' ? (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Select Days</label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day, index) => {
                      const isSelected = (formData.daysOfWeek || []).includes(index);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            const current = formData.daysOfWeek || [];
                            const updated = isSelected
                              ? current.filter((d: number) => d !== index)
                              : [...current, index];
                            setFormData({ ...formData, daysOfWeek: updated });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${isSelected
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                            }`}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">How many times per week?</label>
                  <input
                    type="number"
                    min="1"
                    max="7"
                    value={formData.timesPerWeek || 3}
                    onChange={(e) => setFormData({ ...formData, timesPerWeek: e.target.value })}
                    className="block w-full sm:w-24 rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
                  />
                </div>
              )}
            </div>
          )}

          {formData.frequency === 'one-off' && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Date</label>
              <input
                type="date"
                value={formData.targetDate || ''}
                onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
              />
            </div>
          )}

          <Button onClick={handleSaveAction} className="w-full" disabled={!formData.title}>
            Save Action
          </Button>
        </div>
      </Modal>

      {/* 4. AI Preview Modal */}
      <Modal
        isOpen={modalType === 'ai-preview'}
        onClose={closeModals}
        title="AI Proposal"
      >
        <div className="space-y-6 max-h-[60vh] overflow-y-auto">
          <div className="bg-stone-50 p-5 rounded-xl border border-stone-200">
            <h4 className="font-bold text-lg text-stone-900">{previewData?.title}</h4>
            <p className="text-sm text-stone-600 mt-1">{previewData?.description}</p>
          </div>
          <div>
            <h5 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Suggested Key Results</h5>
            <ul className="space-y-4">
              {previewData?.keyResults.map((kr: any, idx: number) => (
                <li key={idx} className="p-4 rounded-xl border border-stone-100 hover:border-stone-300 transition-colors">
                  <div className="font-semibold text-stone-800">{kr.title}</div>
                  <div className="text-xs text-stone-500 mb-3">Target: {kr.targetValue} {kr.unit}</div>
                  <div className="pl-3 border-l-2 border-stone-200">
                    {kr.actions.map((act: any, i: number) => (
                      <div key={i} className="text-xs text-stone-600 mt-1.5 flex items-center">
                        <span className="w-1.5 h-1.5 bg-stone-400 rounded-full mr-2"></span>
                        {act.title} <span className="text-stone-300 ml-1">/ {act.frequency}</span>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex space-x-3 pt-2">
            <Button variant="ghost" onClick={() => setModalType('create-goal')} className="flex-1">Back</Button>
            <Button onClick={handleApplyAI} className="flex-1">Approve Plan</Button>
          </div>
        </div>
      </Modal>

      {/* 5. Update Progress Modal */}
      <Modal
        isOpen={modalType === 'update-progress'}
        onClose={closeModals}
        title="Update Progress"
      >
        <div className="space-y-6">
          <p className="text-sm text-stone-600">
            Update the current value for <span className="font-bold text-stone-900">{editingItem?.title}</span>.
          </p>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Current Value</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={formData.currentValue}
                onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })}
                className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border text-lg font-medium"
                autoFocus
              />
              <span className="text-stone-400 font-medium">{editingItem?.unit}</span>
            </div>
            <div className="mt-2 text-xs text-stone-400">
              Target: {editingItem?.targetValue} {editingItem?.unit}
            </div>
          </div>
          <Button onClick={handleSaveProgress} className="w-full">
            Save Progress
          </Button>
        </div>
      </Modal>

    </div>
  );
}

function CalendarPage({ state, onToggleAction }: { state: AppState, onToggleAction: any }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week'>(state.user?.preferences?.defaultCalendarView || 'week');

  const renderHeader = () => {
    return (
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-4 md:gap-6">
          <h2 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <div className="flex bg-white rounded-lg border border-stone-200 p-1 shadow-sm">
            <button onClick={() => setCurrentDate(viewMode === 'month' ? subMonths(currentDate, 1) : addDays(currentDate, -7))} className="p-1.5 hover:bg-stone-50 rounded text-stone-500">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 md:px-4 text-sm font-semibold text-stone-700 hover:text-stone-900">Today</button>
            <button onClick={() => setCurrentDate(viewMode === 'month' ? addMonths(currentDate, 1) : addDays(currentDate, 7))} className="p-1.5 hover:bg-stone-50 rounded text-stone-500">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex bg-stone-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('week')}
            className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'week' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-900'}`}
          >
            <LayoutList className="w-4 h-4 mr-2" /> Week
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'month' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-900'}`}
          >
            <LayoutGrid className="w-4 h-4 mr-2" /> Month
          </button>
        </div>
      </div>
    );
  };

  const renderGrid = () => {
    let startDate, endDate;

    if (viewMode === 'month') {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(monthStart);
      startDate = startOfWeek(monthStart);
      endDate = endOfWeek(monthEnd);
    } else {
      startDate = startOfWeek(currentDate);
      endDate = endOfWeek(currentDate);
    }

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const dayStr = format(day, 'yyyy-MM-dd');
        const isPast = isBefore(day, startOfToday());

        // Find actions to display on this calendar day
        const dayActions = state.actions.filter(a => {
          const kr = state.keyResults.find(k => k.id === a.keyResultId);
          if ((kr?.status || 'active') === 'archived') return false;

          // Filter by start date
          if (a.startDate && dayStr < a.startDate) return false;

          if (a.frequency === 'daily') return true;
          if (a.frequency === 'weekly') {
            if (a.weeklyType === 'specific_days') return a.daysOfWeek?.includes(getDay(cloneDay));
            if (a.weeklyType === 'times_per_week') {
              return state.logs.some(l => l.actionId === a.id && l.date === dayStr && l.completed);
            }
            return a.daysOfWeek?.includes(getDay(cloneDay));
          }
          if (a.frequency === 'one-off') return a.targetDate === dayStr;
          return false;
        });

        const fixedScheduleActions = state.actions.filter(a => {
          const kr = state.keyResults.find(k => k.id === a.keyResultId);
          if ((kr?.status || 'active') === 'archived') return false;

          if (a.startDate && dayStr < a.startDate) return false;

          if (a.frequency === 'daily') return true;
          if (a.frequency === 'weekly' && (a.weeklyType === 'specific_days' || !a.weeklyType)) {
            return a.daysOfWeek?.includes(getDay(cloneDay));
          }
          if (a.frequency === 'one-off') return a.targetDate === dayStr;
          return false;
        });

        const completedCount = dayActions.filter(a => state.logs.find(l => l.actionId === a.id && l.date === dayStr && l.completed)).length;
        const totalFixedPlanned = fixedScheduleActions.length;
        const totalCount = dayActions.length;

        days.push(
          <div
            className={`
              border-b border-r border-stone-100 p-2 md:p-3 relative transition-all cursor-pointer group hover:bg-white
              ${viewMode === 'month' ? 'min-h-[100px] md:min-h-[120px]' : 'min-h-[150px] md:min-h-[200px]'}
              ${!isSameMonth(day, currentDate) && viewMode === 'month' ? "bg-stone-50/50 text-stone-300" : "bg-stone-50/30 text-stone-800"}
              ${isSameDay(day, new Date()) ? "bg-white ring-2 ring-stone-900 ring-inset z-10" : ""}
            `}
            key={dayStr}
            onClick={() => setSelectedDay(cloneDay)}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center space-x-2">
                <span className={`text-xs md:text-sm font-semibold w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full ${isSameDay(day, new Date()) ? "bg-stone-900 text-white" : ""}`}>
                  {format(day, 'd')}
                </span>
                {isPast && totalFixedPlanned > 0 && (
                  <span className={`text-xs font-bold ${completedCount < totalFixedPlanned ? 'text-rose-500' : 'text-stone-400'}`}>
                    {completedCount}/{totalFixedPlanned}
                  </span>
                )}
              </div>

              {totalCount > 0 && (
                <div className="flex space-x-0.5">
                  {Array.from({ length: Math.min(5, totalCount) }).map((_, i) => (
                    <div key={i} className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full ${i < completedCount ? 'bg-stone-800' : 'bg-stone-300'}`}></div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1 hidden md:block">
              {dayActions.slice(0, viewMode === 'week' ? 6 : 3).map(act => {
                const done = state.logs.some(l => l.actionId === act.id && l.date === dayStr && l.completed);
                return (
                  <div key={act.id} className={`text-[10px] truncate px-1.5 py-0.5 rounded ${done ? 'text-stone-400 line-through' : 'bg-white shadow-sm text-stone-700'}`}>
                    {act.title}
                  </div>
                );
              })}
              {dayActions.length > (viewMode === 'week' ? 6 : 3) && <div className="text-[10px] text-stone-400 pl-1">+{dayActions.length - (viewMode === 'week' ? 6 : 3)} more</div>}
            </div>
            {/* Mobile simplified view */}
            <div className="md:hidden mt-2">
              {totalCount > 0 && <div className="text-[10px] text-stone-400">{completedCount}/{totalCount} done</div>}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="rounded-2xl overflow-hidden border border-stone-200 shadow-sm bg-stone-50">{rows}</div>;
  };

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-7xl mx-auto h-full flex flex-col w-full">
      {renderHeader()}

      <div className="flex-1 overflow-y-auto">
        <div className="overflow-x-auto pb-4">
          <div className="min-w-[700px] md:min-w-0">
            <div className="grid grid-cols-7 mb-4 px-2">
              {WEEKDAYS.map(d => <div key={d} className="text-stone-400 text-xs font-bold uppercase tracking-widest text-center">{d}</div>)}
            </div>
            {renderGrid()}
          </div>
        </div>
      </div>

      <Modal
        isOpen={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? format(selectedDay, 'EEEE, MMMM do') : ''}
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {selectedDay && (() => {
            const dayStr = format(selectedDay, 'yyyy-MM-dd');
            const acts = state.actions.filter(a => {
              const kr = state.keyResults.find(k => k.id === a.keyResultId);
              if ((kr?.status || 'active') === 'archived') return false;

              if (a.startDate && dayStr < a.startDate) return false;

              if (a.frequency === 'daily') return true;
              if (a.frequency === 'weekly') {
                if (a.weeklyType === 'specific_days') return a.daysOfWeek?.includes(getDay(selectedDay));
                if (a.weeklyType === 'times_per_week') return true;
                return a.daysOfWeek?.includes(getDay(selectedDay));
              }
              if (a.frequency === 'one-off') return a.targetDate === dayStr;
              return false;
            });

            if (acts.length === 0) return <p className="text-stone-400 text-center py-8">No actions scheduled.</p>;

            return acts.map(action => {
              const kr = state.keyResults.find(k => k.id === action.keyResultId);
              const obj = state.objectives.find(o => o.id === kr?.objectiveId);
              const log = state.logs.find(l => l.actionId === action.id && l.date === dayStr);

              // Calculate weekly progress for context in modal
              let weeklyProgress = undefined;
              if (action.frequency === 'weekly' && action.weeklyType === 'times_per_week' && action.timesPerWeek) {
                const start = startOfWeek(selectedDay);
                const end = endOfWeek(selectedDay);
                const current = state.logs.filter(l =>
                  l.actionId === action.id &&
                  l.completed &&
                  isWithinInterval(parseISO(l.date), { start, end })
                ).length;
                weeklyProgress = { current, target: action.timesPerWeek };
              }

              return (
                <ActionItem
                  key={action.id}
                  action={action}
                  keyResult={kr}
                  objective={obj}
                  log={log}
                  dateStr={dayStr}
                  onToggle={onToggleAction}
                  weeklyProgress={weeklyProgress}
                />
              );
            });
          })()}
        </div>
      </Modal>
    </div>
  );
}

function AnalyticsPage({ state }: { state: AppState }) {
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
  const [timeView, setTimeView] = useState<'daily' | 'weekly'>('daily');

  // --- Derived Data based on Filters ---

  const filteredObjectives = useMemo(() => {
    return selectedGoalIds.length === 0
      ? state.objectives
      : state.objectives.filter(o => selectedGoalIds.includes(o.id));
  }, [state.objectives, selectedGoalIds]);

  const filteredKRs = useMemo(() => {
    return state.keyResults.filter(kr => {
      // 1. Must be active (or we could allow archived if we want history, but usually analytics focuses on active)
      // Let's hide archived KRs by default as per previous instruction
      if ((kr.status || 'active') === 'archived') return false;

      // 2. Must match selected goal (if any)
      if (selectedGoalIds.length > 0 && !selectedGoalIds.includes(kr.objectiveId)) return false;

      return true;
    });
  }, [state.keyResults, selectedGoalIds]);

  const filteredActions = useMemo(() => {
    return state.actions.filter(a => filteredKRs.some(kr => kr.id === a.keyResultId));
  }, [state.actions, filteredKRs]);

  const filteredLogs = useMemo(() => {
    return state.logs.filter(l => filteredActions.some(a => a.id === l.actionId));
  }, [state.logs, filteredActions]);


  // --- Chart Data Preparation ---

  // 1. Completion Ratio (Pie Chart)
  // Reliability score based on last 30 days
  const reliabilityData = useMemo(() => {
    // Look back 30 days
    const endDate = new Date();
    const startDate = subDays(endDate, 30);
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    let totalPlanned = 0;
    let totalCompleted = 0;

    days.forEach(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayOfWeek = getDay(day);

      // Find actions scheduled for this specific day
      // Note: Floating tasks (times_per_week) are tricky to count as "Planned" on a specific day 
      // without overcounting. We count only Fixed Schedule items for the denominator.

      const scheduledFixed = filteredActions.filter(a => {
        if (a.startDate && dayStr < a.startDate) return false;

        if (a.frequency === 'daily') return true;
        if (a.frequency === 'weekly' && a.weeklyType === 'specific_days') return a.daysOfWeek?.includes(dayOfWeek);
        if (a.frequency === 'one-off') return a.targetDate === dayStr;
        return false;
      });

      totalPlanned += scheduledFixed.length;

      // Completions for these fixed items
      const completedFixed = filteredLogs.filter(l =>
        l.date === dayStr &&
        l.completed &&
        scheduledFixed.some(a => a.id === l.actionId)
      ).length;

      totalCompleted += completedFixed;
    });

    const pending = Math.max(0, totalPlanned - totalCompleted);

    return [
      { name: 'Completed', value: totalCompleted, color: '#1c1917' },
      { name: 'Missed', value: pending, color: '#e7e5e4' },
    ];
  }, [filteredActions, filteredLogs]);


  // 2. Objective Trajectory (Bar Chart)
  const objTrajectoryData = useMemo(() => {
    return filteredObjectives.map(obj => {
      const krs = filteredKRs.filter(k => k.objectiveId === obj.id);
      const avg = krs.length ? krs.reduce((a, b) => a + (b.currentValue / b.targetValue), 0) / krs.length : 0;
      return {
        name: obj.title.length > 15 ? obj.title.substring(0, 15) + '...' : obj.title,
        fullTitle: obj.title,
        progress: Math.round(Math.min(100, avg * 100))
      };
    });
  }, [filteredObjectives, filteredKRs]);


  // 3. Consistency Line Chart (New)
  const consistencyData = useMemo(() => {
    const today = new Date();
    const dataPoints = [];

    if (timeView === 'daily') {
      // Last 30 Days
      const startDate = subDays(today, 29); // 30 days inclusive
      const days = eachDayOfInterval({ start: startDate, end: today });

      dataPoints.push(...days.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = getDay(day);

        // Denominator: Fixed Schedule Actions
        const plannedActions = filteredActions.filter(a => {
          if (a.startDate && dayStr < a.startDate) return false;

          if (a.frequency === 'daily') return true;
          if (a.frequency === 'weekly' && (a.weeklyType === 'specific_days' || !a.weeklyType)) {
            return a.daysOfWeek?.includes(dayOfWeek);
          }
          if (a.frequency === 'one-off') return a.targetDate === dayStr;
          return false;
        });

        const denominator = plannedActions.length;

        // Numerator: Fixed actions completed
        const completedCount = filteredLogs.filter(l =>
          l.date === dayStr &&
          l.completed &&
          plannedActions.some(a => a.id === l.actionId)
        ).length;

        const percentage = denominator > 0 ? Math.round((completedCount / denominator) * 100) : 0;

        return {
          date: format(day, 'MMM d'),
          percentage,
          fullDate: dayStr
        };
      }));

    } else {
      // Weekly View - Last 12 Weeks
      const startDate = startOfWeek(subWeeks(today, 11)); // 12 weeks
      const weeks = eachWeekOfInterval({ start: startDate, end: today });

      dataPoints.push(...weeks.map(weekStart => {
        const weekEnd = endOfWeek(weekStart);

        // Denominator: Sum of all requirements for this week
        let denominator = 0;

        filteredActions.forEach(a => {
          // Skip if start date is after this week
          if (a.startDate && a.startDate > format(weekEnd, 'yyyy-MM-dd')) return;

          // NOTE: Ideally we check if the start date falls within this week and prorate, 
          // but for simplicity we count full week if it started before end of week.

          if (a.frequency === 'daily') denominator += 7;
          else if (a.frequency === 'weekly') {
            if (a.weeklyType === 'times_per_week') denominator += (a.timesPerWeek || 3);
            else if (a.weeklyType === 'specific_days') denominator += (a.daysOfWeek?.length || 0);
            else denominator += (a.daysOfWeek?.length || 1); // fallback
          }
          else if (a.frequency === 'one-off' && a.targetDate) {
            if (isWithinInterval(parseISO(a.targetDate), { start: weekStart, end: weekEnd })) {
              denominator += 1;
            }
          }
        });

        // Numerator: All logs in this week for filtered actions
        const numerator = filteredLogs.filter(l =>
          l.completed &&
          isWithinInterval(parseISO(l.date), { start: weekStart, end: weekEnd })
        ).length;

        const percentage = denominator > 0 ? Math.round(Math.min(100, (numerator / denominator) * 100)) : 0;

        return {
          date: format(weekStart, 'MMM d'),
          percentage,
          fullDate: `Week of ${format(weekStart, 'MMM d')}`
        };
      }));
    }

    return dataPoints;
  }, [timeView, filteredActions, filteredLogs]);


  // --- Export Handler ---
  const handleExportData = () => {
    // 1. Objectives & KRs Snapshot Section
    const goalsHeader = ['Type', 'ID', 'Title', 'Parent Goal', 'Status', 'Current', 'Target', 'Unit', 'Due Date'].join(',');

    const objectiveRows = state.objectives.map(o =>
      ['Objective', o.id, o.title, '-', 'Active', '-', '-', '-', o.targetDate]
        .map(s => `"${String(s).replace(/"/g, '""')}"`).join(',')
    );

    const keyResultRows = state.keyResults.map(k => {
      const parent = state.objectives.find(o => o.id === k.objectiveId)?.title || 'Unknown';
      return ['Key Result', k.id, k.title, parent, k.status || 'active', k.currentValue, k.targetValue, k.unit, k.dueDate || '-']
        .map(s => `"${String(s).replace(/"/g, '""')}"`).join(',')
    });

    // 2. Action Logs History Section
    const logsHeader = ['Log ID', 'Date', 'Objective', 'Key Result', 'Action', 'Frequency', 'Status', 'Timestamp'].join(',');

    const logRows = state.logs.sort((a, b) => b.timestamp - a.timestamp).map(log => {
      const action = state.actions.find(a => a.id === log.actionId);
      const kr = state.keyResults.find(k => k.id === action?.keyResultId);
      const obj = state.objectives.find(o => o.id === kr?.objectiveId);

      return [
        log.id,
        log.date,
        obj?.title || 'Deleted Objective',
        kr?.title || 'Deleted KR',
        action?.title || 'Deleted Action',
        action?.frequency || '-',
        log.completed ? 'Completed' : 'Incomplete',
        new Date(log.timestamp).toISOString()
      ].map(s => `"${String(s).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [
      '--- GOALS SNAPSHOT ---',
      goalsHeader,
      ...objectiveRows,
      ...keyResultRows,
      '',
      '',
      '--- DAILY ACTION HISTORY ---',
      logsHeader,
      ...logRows
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `aimachieve_data_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-7xl mx-auto w-full">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 mb-2 tracking-tight">Analytics</h1>
          <p className="text-stone-500">Visualize progress and consistency.</p>
        </div>
      </div>

      {/* Goal Filter */}
      <div className="mb-8 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex items-center space-x-2">
          <div className="flex items-center text-stone-400 text-xs font-bold uppercase tracking-widest mr-2">
            <Filter className="w-3 h-3 mr-1" /> Filter:
          </div>
          <button
            onClick={() => setSelectedGoalIds([])}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors border whitespace-nowrap ${selectedGoalIds.length === 0 ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'}`}
          >
            All Goals
          </button>
          {state.objectives.map(obj => (
            <button
              key={obj.id}
              onClick={() => {
                if (selectedGoalIds.includes(obj.id)) {
                  setSelectedGoalIds(prev => prev.filter(id => id !== obj.id));
                } else {
                  setSelectedGoalIds(prev => [...prev, obj.id]);
                }
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors border whitespace-nowrap flex items-center ${selectedGoalIds.includes(obj.id) ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'}`}
            >
              <span className={`w-2 h-2 rounded-full inline-block mr-1.5 ${obj.color}`}></span>
              {obj.title}
            </button>
          ))}
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8">

        {/* Consistency Chart (Full Width on Mobile, Span 2 on Desktop) */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100 col-span-1 md:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-stone-900">Consistency Trend</h3>
              <p className="text-xs text-stone-400 mt-1">Percentage of scheduled actions completed</p>
            </div>
            <div className="flex bg-stone-100 p-1 rounded-lg shrink-0">
              <button onClick={() => setTimeView('daily')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${timeView === 'daily' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}>Daily</button>
              <button onClick={() => setTimeView('weekly')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${timeView === 'weekly' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}>Weekly</button>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <LineChart data={consistencyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#a8a29e', fontSize: 11 }} minTickGap={30} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#a8a29e', fontSize: 11 }} domain={[0, 100]} unit="%" dx={-10} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', padding: '12px' }}
                  cursor={{ stroke: '#e7e5e4', strokeWidth: 1 }}
                  formatter={(value: number) => [`${value}%`, 'Completion']}
                  labelStyle={{ color: '#78716c', marginBottom: '4px', fontSize: '12px' }}
                />
                <Line
                  type="monotone"
                  dataKey="percentage"
                  stroke="#1c1917"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, fill: '#1c1917', stroke: '#fff', strokeWidth: 2 }}
                  animationDuration={1500}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Completion Ratio */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100">
          <h3 className="text-lg font-bold text-stone-900 mb-1">Reliability Score</h3>
          <p className="text-xs text-stone-400 mb-6">Based on fixed schedule actions (last 30 days)</p>
          <div className="h-64 flex justify-center items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={reliabilityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                  cornerRadius={4}
                >
                  {reliabilityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Objective Trajectory */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100">
          <h3 className="text-lg font-bold text-stone-900 mb-1">Progress Trajectory</h3>
          <p className="text-xs text-stone-400 mb-6">Average completion of active Key Results</p>
          <div className="h-64">
            {objTrajectoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={objTrajectoryData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: '#57534e' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: '#fafaf9' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(value: number) => [`${value}%`, 'Progress']}
                    labelFormatter={(label) => objTrajectoryData.find(d => d.name === label)?.fullTitle || label}
                  />
                  <Bar dataKey="progress" fill="#44403c" radius={[0, 4, 4, 0]} barSize={24} background={{ fill: '#f5f5f4', radius: [0, 4, 4, 0] }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-stone-300 text-sm">
                No active goals found.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 bg-stone-900 rounded-2xl p-6 md:p-8 text-white flex flex-col md:flex-row justify-between items-start md:items-center shadow-xl gap-4">
        <div>
          <h3 className="text-xl font-bold">Data Export</h3>
          <p className="opacity-60 mt-1 text-sm">Download your complete history including all logs and goal structures.</p>
        </div>
        <Button variant="secondary" onClick={handleExportData} className="w-full md:w-auto">Export CSV</Button>
      </div>
    </div>
  );
}

function ProfilePage({ state, setState }: { state: AppState, setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const user = state.user;

  // Name State
  const [name, setName] = useState(user?.name || '');
  const [isNameDirty, setIsNameDirty] = useState(false);

  // Password State
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Sync name if user changes (e.g. re-login)
  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  if (!user) return null;

  const handleUpdateName = () => {
    if (!name.trim()) return;
    setState(prev => ({
      ...prev,
      user: { ...prev.user!, name: name.trim() }
    }));
    setIsNameDirty(false);
  };

  const handleUpdatePreferences = (key: keyof UserPreferences, value: any) => {
    setState(prev => {
      if (!prev.user) return prev;
      const currentPrefs = prev.user.preferences || {
        dailyDigest: true,
        weeklyReport: true,
        actionReminders: true,
        reminderTime: "09:00",
        defaultCalendarView: 'week'
      };

      return {
        ...prev,
        user: {
          ...prev.user,
          preferences: {
            ...currentPrefs,
            [key]: value
          }
        }
      };
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordStatus({ type: 'error', msg: "New passwords do not match" });
      return;
    }
    if (passwordForm.new.length < 6) {
      setPasswordStatus({ type: 'error', msg: "Password must be at least 6 characters" });
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(user.id, passwordForm.current, passwordForm.new);
      setPasswordStatus({ type: 'success', msg: "Password updated successfully" });
      setPasswordForm({ current: '', new: '', confirm: '' });
    } catch (err: any) {
      setPasswordStatus({ type: 'error', msg: err.message || "Failed to update password" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDownloadICal = () => {
    const icalData = generateICalData(state);
    const blob = new Blob([icalData], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'aimachieve_calendar.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const Toggle = ({ label, description, checked, onChange }: any) => (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-stone-200">
      <div>
        <div className="font-medium text-stone-900">{label}</div>
        <div className="text-xs text-stone-500">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-stone-900' : 'bg-stone-200'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-4xl mx-auto w-full">
      <h1 className="text-3xl font-bold text-stone-900 mb-2 tracking-tight">Profile & Settings</h1>
      <p className="text-stone-500 mb-8">Manage your account and app preferences.</p>

      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100 overflow-hidden mb-8">
        <div className="p-6 md:p-8 border-b border-stone-100">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Personal Information</h3>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="h-20 w-20 rounded-full bg-stone-100 flex items-center justify-center text-3xl font-bold text-stone-600 shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 w-full space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Full Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setIsNameDirty(true); }}
                    className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
                  />
                  {isNameDirty && (
                    <Button onClick={handleUpdateName} size="sm">Save</Button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="block w-full rounded-lg border-stone-200 bg-stone-50 text-stone-500 shadow-sm p-2.5 border cursor-not-allowed"
                />
                <p className="text-xs text-stone-400 mt-1">Email cannot be changed.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Security Section (New) */}
        <div className="p-6 md:p-8 bg-stone-50/50 border-b border-stone-100">
          <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-4 flex items-center">
            <Shield className="w-4 h-4 mr-2" /> Security
          </h3>

          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            {passwordStatus && (
              <div className={`p-3 rounded-lg text-sm ${passwordStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {passwordStatus.msg}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Current Password</label>
              <input
                type="password"
                value={passwordForm.current}
                onChange={e => setPasswordForm({ ...passwordForm, current: e.target.value })}
                className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border bg-white"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={passwordForm.new}
                  onChange={e => setPasswordForm({ ...passwordForm, new: e.target.value })}
                  className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border bg-white"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Confirm New</label>
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                  className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border bg-white"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <Button type="submit" variant="secondary" size="sm" isLoading={isChangingPassword} disabled={!passwordForm.current || !passwordForm.new}>
              Update Password
            </Button>
          </form>
        </div>

        <div className="p-6 md:p-8 bg-stone-50/50">
          <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-4">Application Preferences</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-stone-200">
              <div>
                <div className="font-medium text-stone-900">Default Calendar View</div>
                <div className="text-xs text-stone-500">Choose how the calendar opens</div>
              </div>
              <div className="flex bg-stone-100 p-1 rounded-lg">
                <button
                  onClick={() => handleUpdatePreferences('defaultCalendarView', 'week')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${user.preferences?.defaultCalendarView === 'week' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}
                >
                  Week
                </button>
                <button
                  onClick={() => handleUpdatePreferences('defaultCalendarView', 'month')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${user.preferences?.defaultCalendarView === 'month' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}
                >
                  Month
                </button>
              </div>
            </div>

            <Toggle
              label="Daily Digest"
              description="Receive a morning summary of tasks."
              checked={user.preferences?.dailyDigest ?? true}
              onChange={(val: boolean) => handleUpdatePreferences('dailyDigest', val)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100 overflow-hidden">
        <div className="p-6 md:p-8">
          <h3 className="text-lg font-bold text-stone-900 mb-1">Data & Sync</h3>
          <p className="text-sm text-stone-500 mb-6">Export your schedule to external calendars.</p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button variant="outline" onClick={handleDownloadICal} className="flex-1 justify-center">
              <Download className="w-4 h-4 mr-2" /> Download iCal (.ics)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}