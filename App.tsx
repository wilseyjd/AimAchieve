import React, { useState, useEffect } from 'react';
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
  LayoutGrid
} from 'lucide-react';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, endOfWeek, isSameMonth, isSameDay, isToday, parseISO, addMonths, subMonths, getDay, isWithinInterval, isBefore, startOfToday } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

// Imports from local files
import { AppState, ViewMode, CalendarViewMode, Objective, KeyResult, Action, ActionLog, User, UserPreferences, Frequency } from './types';
import { MOCK_INITIAL_DATA, COLORS, WEEKDAYS } from './constants';
import { loadState, saveState, generateId } from './services/storageService';
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
    const obj = state.objectives.find(o => o.id === kr?.objectiveId);
    
    let rrule = '';
    let dtstart = today;

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

  // Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginStep, setLoginStep] = useState<'input' | 'sent'>('input');

  // Load data on mount
  useEffect(() => {
    const data = loadState();
    setState(data);
  }, []);

  // Save data on change
  useEffect(() => {
    if (state.user) {
      saveState(state);
    }
  }, [state]);

  const handleSendMagicLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginEmail.includes('@')) {
      // In a real app, use a proper validation library or UI feedback
      return; 
    }
    // Simulate API call to send email
    setLoginStep('sent');
  };

  const handleCompleteLogin = () => {
    // Simulate clicking the link in the email
    const nameFromEmail = loginEmail.split('@')[0];
    const formattedName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
    
    // Default preferences
    const defaultPrefs: UserPreferences = {
      dailyDigest: true,
      weeklyReport: true,
      actionReminders: true,
      reminderTime: "09:00",
      defaultCalendarView: 'week'
    };

    setState(prev => ({ 
      ...prev, 
      user: { 
        id: generateId(), 
        name: formattedName, 
        email: loginEmail,
        preferences: defaultPrefs
      } 
    }));
    setCurrentView('dashboard');
    
    // Reset login state after transition
    setTimeout(() => {
      setLoginStep('input');
      setLoginEmail('');
    }, 500);
  };

  const handleLogout = () => {
    setState(prev => ({ ...prev, user: null }));
    localStorage.removeItem('orbit_okr_data_v1');
  };

  const toggleAction = (actionId: string, date: string, currentStatus: boolean) => {
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
          id: generateId(),
          actionId,
          date,
          completed: true,
          timestamp: Date.now()
        });
      }
      return { ...prev, logs: newLogs };
    });
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
            {loginStep === 'input' ? 'Password-less secure login.' : 'Check your inbox.'}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl border border-stone-100 relative">
            
            {loginStep === 'input' ? (
              <form className="space-y-6" onSubmit={handleSendMagicLink}>
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
                      required 
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="appearance-none block w-full pl-10 pr-3 py-2 border border-stone-200 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:border-stone-500 sm:text-sm" 
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div>
                   <Button type="submit" className="w-full">Send Magic Link</Button>
                </div>
                <p className="text-xs text-center text-stone-400">
                  We'll send a secure link to sign in instantly.
                </p>
              </form>
            ) : (
              <div className="text-center space-y-6">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-stone-100">
                  <Mail className="h-6 w-6 text-stone-600" />
                </div>
                <div>
                  <p className="text-sm text-stone-600">
                    We sent a login link to <span className="font-bold text-stone-900">{loginEmail}</span>.
                  </p>
                  <p className="text-xs text-stone-400 mt-2">
                    Click the link in the email to sign in.
                  </p>
                </div>
                
                {/* Simulation Button */}
                <div className="pt-6 border-t border-stone-100">
                  <button 
                    onClick={handleCompleteLogin}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                  >
                    Simulate: Open Link from Email
                  </button>
                  <button 
                    onClick={() => setLoginStep('input')}
                    className="mt-4 text-xs text-stone-400 hover:text-stone-600 hover:underline"
                  >
                    Use a different email
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
          <NavButton active={currentView === 'dashboard'} onClick={() => { setCurrentView('dashboard'); if(window.innerWidth < 768) setIsSidebarOpen(false); }} icon={<LayoutDashboard />} label="Dashboard" isOpen={isSidebarOpen} />
          <NavButton active={currentView === 'goals'} onClick={() => { setCurrentView('goals'); if(window.innerWidth < 768) setIsSidebarOpen(false); }} icon={<Target />} label="Goals" isOpen={isSidebarOpen} />
          <NavButton active={currentView === 'calendar'} onClick={() => { setCurrentView('calendar'); if(window.innerWidth < 768) setIsSidebarOpen(false); }} icon={<CalendarIcon />} label="Calendar" isOpen={isSidebarOpen} />
          <NavButton active={currentView === 'analytics'} onClick={() => { setCurrentView('analytics'); if(window.innerWidth < 768) setIsSidebarOpen(false); }} icon={<BarChart2 />} label="Analytics" isOpen={isSidebarOpen} />
        </nav>

        <div className="p-4 border-t border-stone-800 space-y-2">
          <button onClick={() => { setCurrentView('profile'); if(window.innerWidth < 768) setIsSidebarOpen(false); }} className={`flex items-center space-x-3 transition-colors w-full p-3 rounded-xl hover:bg-white/5 ${currentView === 'profile' ? 'bg-stone-800 text-white' : 'text-stone-500'}`}>
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
    className={`w-full flex items-center space-x-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
      active ? 'bg-stone-800 text-white shadow-lg shadow-black/20' : 'text-stone-400 hover:bg-stone-800/50 hover:text-stone-200'
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
  
  const todaysActions = state.actions.filter(action => {
    if (action.frequency === 'daily') return true;
    if (action.frequency === 'weekly') {
      if (action.weeklyType === 'specific_days') {
        return action.daysOfWeek?.includes(getDay(todayDate));
      } else if (action.weeklyType === 'times_per_week') {
        // Show if not yet completed target times for this week
        // Note: We might want to show it even if completed to show progress?
        // Let's show it always, and visual indicator will show "Check" or "Progress".
        return true; 
      }
      // Default fallback for old data without weeklyType (assume specific days if daysOfWeek exists)
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
                      <div className={`h-full ${obj.color} opacity-80`} style={{ width: '30%' }}></div> {/* Mock progress */}
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
  const [modalType, setModalType] = useState<'create-goal' | 'ai-preview' | 'add-kr' | 'add-action' | 'edit-kr' | 'edit-action' | 'edit-goal' | null>(null);
  
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
    setFormData({ title: '', targetValue: '', unit: '', currentValue: 0 });
    setModalType('add-kr');
  };

  const openEditKeyResult = (kr: KeyResult) => {
    setEditingItem(kr);
    setFormData({ title: kr.title, targetValue: kr.targetValue, unit: kr.unit, currentValue: kr.currentValue });
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
      targetDate: '' 
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
      targetDate: action.targetDate || '' 
    });
    setModalType('edit-action');
  };

  // --- Handlers for saving data ---

  const handleSaveGoal = () => {
    if (!formData.title) return;
    
    if (modalType === 'edit-goal' && editingItem) {
      // Update
      setState(prev => ({
        ...prev,
        objectives: prev.objectives.map(o => o.id === editingItem.id ? { 
          ...o, 
          title: formData.title, 
          targetDate: formData.targetDate || o.targetDate,
          description: formData.description
        } : o)
      }));
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
      setState(prev => ({ ...prev, objectives: [...prev.objectives, newObj] }));
    }
    closeModals();
  };

  const handleSaveKeyResult = () => {
    if (!formData.title) return;
    const targetVal = parseFloat(formData.targetValue);
    const currentVal = parseFloat(formData.currentValue);

    if (modalType === 'edit-kr' && editingItem) {
      setState(prev => ({
        ...prev,
        keyResults: prev.keyResults.map(kr => kr.id === editingItem.id ? {
          ...kr,
          title: formData.title,
          targetValue: isNaN(targetVal) ? kr.targetValue : targetVal,
          currentValue: isNaN(currentVal) ? kr.currentValue : currentVal,
          unit: formData.unit
        } : kr)
      }));
    } else if (modalType === 'add-kr' && selectedObjectiveId) {
      const newKr: KeyResult = {
        id: generateId(),
        objectiveId: selectedObjectiveId,
        title: formData.title,
        targetValue: isNaN(targetVal) ? 100 : targetVal,
        currentValue: isNaN(currentVal) ? 0 : currentVal,
        unit: formData.unit || 'units',
        dueDate: ''
      };
      setState(prev => ({ ...prev, keyResults: [...prev.keyResults, newKr] }));
    }
    closeModals();
  };

  const handleSaveAction = () => {
    if (!formData.title) return;
    
    const buildActionData = () => ({
      title: formData.title,
      frequency: formData.frequency,
      weeklyType: formData.frequency === 'weekly' ? formData.weeklyType : undefined,
      daysOfWeek: (formData.frequency === 'weekly' && formData.weeklyType === 'specific_days') ? formData.daysOfWeek : undefined,
      timesPerWeek: (formData.frequency === 'weekly' && formData.weeklyType === 'times_per_week') ? Number(formData.timesPerWeek) : undefined,
      targetDate: formData.frequency === 'one-off' ? formData.targetDate : undefined
    });

    if (modalType === 'edit-action' && editingItem) {
      setState(prev => ({
        ...prev,
        actions: prev.actions.map(a => a.id === editingItem.id ? {
          ...a,
          ...buildActionData()
        } : a)
      }));
    } else if (modalType === 'add-action' && selectedKeyResultId) {
      const newAction: Action = {
        id: generateId(),
        keyResultId: selectedKeyResultId,
        ...buildActionData(),
        createdDate: format(new Date(), 'yyyy-MM-dd')
      } as Action;
      setState(prev => ({ ...prev, actions: [...prev.actions, newAction] }));
    }
    closeModals();
  };

  // --- Handlers for Deletion ---

  const handleDeleteObjective = (id: string) => {
    if (confirm('Delete this goal and all associated results?')) {
      setState(prev => ({
        ...prev,
        objectives: prev.objectives.filter(o => o.id !== id),
        keyResults: prev.keyResults.filter(k => k.objectiveId !== id),
        actions: prev.actions.filter(a => {
           // Find if action belongs to a KR that belongs to this objective
           const kr = prev.keyResults.find(k => k.id === a.keyResultId);
           return kr?.objectiveId !== id;
        })
      }));
    }
  };

  const handleDeleteKeyResult = (id: string) => {
    if (confirm('Delete this Key Result?')) {
      setState(prev => ({
        ...prev,
        keyResults: prev.keyResults.filter(k => k.id !== id),
        actions: prev.actions.filter(a => a.keyResultId !== id)
      }));
    }
  };

  const handleDeleteAction = (id: string) => {
    if (confirm('Delete this action?')) {
      setState(prev => ({
        ...prev,
        actions: prev.actions.filter(a => a.id !== id)
      }));
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

  const handleApplyAI = () => {
    if (!previewData) return;
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

    previewData.keyResults.forEach((krData: any) => {
      const krId = generateId();
      newKRs.push({
        id: krId,
        objectiveId: newObj.id,
        title: krData.title,
        targetValue: krData.targetValue,
        currentValue: 0,
        unit: krData.unit,
        dueDate: newObj.targetDate
      });

      krData.actions.forEach((actData: any) => {
        newActions.push({
          id: generateId(),
          keyResultId: krId,
          title: actData.title,
          frequency: actData.frequency,
          weeklyType: actData.daysOfWeek ? 'specific_days' : 'times_per_week',
          timesPerWeek: 3, // Default AI to 3 if generic weekly
          daysOfWeek: actData.daysOfWeek,
          createdDate: format(new Date(), 'yyyy-MM-dd')
        });
      });
    });

    setState(prev => ({
      ...prev,
      objectives: [...prev.objectives, newObj],
      keyResults: [...prev.keyResults, ...newKRs],
      actions: [...prev.actions, ...newActions]
    }));
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
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
                placeholder="e.g. Master Guitar"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Description (Optional)</label>
              <textarea 
                value={formData.description || ''}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
                placeholder="Briefly describe the goal..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Target Date</label>
              <input 
                type="date" 
                value={formData.targetDate || ''}
                onChange={(e) => setFormData({...formData, targetDate: e.target.value})}
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
              onChange={(e) => setFormData({...formData, title: e.target.value})}
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
                 onChange={(e) => setFormData({...formData, currentValue: e.target.value})}
                 className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
               />
            </div>
            <div>
               <label className="block text-sm font-medium text-stone-700 mb-1">Target Value</label>
               <input 
                 type="number" 
                 value={formData.targetValue}
                 onChange={(e) => setFormData({...formData, targetValue: e.target.value})}
                 className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
               />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Unit</label>
            <input 
              type="text" 
              value={formData.unit || ''}
              onChange={(e) => setFormData({...formData, unit: e.target.value})}
              className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
              placeholder="e.g. km, %, books"
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
              onChange={(e) => setFormData({...formData, title: e.target.value})}
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
          
          {formData.frequency === 'weekly' && (
            <div className="space-y-4 bg-stone-50 p-4 rounded-lg border border-stone-100">
               <div className="flex flex-col sm:flex-row gap-4">
                 <label className="flex items-center space-x-2 cursor-pointer">
                   <input 
                     type="radio" 
                     checked={formData.weeklyType === 'specific_days'} 
                     onChange={() => setFormData({...formData, weeklyType: 'specific_days'})}
                     className="text-stone-900 focus:ring-stone-900"
                   />
                   <span className="text-sm text-stone-700">Specific Days</span>
                 </label>
                 <label className="flex items-center space-x-2 cursor-pointer">
                   <input 
                     type="radio" 
                     checked={formData.weeklyType === 'times_per_week'} 
                     onChange={() => setFormData({...formData, weeklyType: 'times_per_week'})}
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
                              setFormData({...formData, daysOfWeek: updated});
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                              isSelected 
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
                      onChange={(e) => setFormData({...formData, timesPerWeek: e.target.value})}
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
                onChange={(e) => setFormData({...formData, targetDate: e.target.value})}
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
    </div>
  );
}

function CalendarPage({ state, onToggleAction }: { state: AppState, onToggleAction: any }) {
  // Use default from preferences or fallback to 'week'
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
      for (let i = 7; i < 7; i++) { // Corrected logic: let i=0; i<7; i++
      // The original code had a bug here in the provided snippet? No, I must have misread or it was correct before.
      // Re-writing the loop correctly.
      }
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const dayStr = format(day, 'yyyy-MM-dd');
        const isPast = isBefore(day, startOfToday());
        
        // Find actions to display on this calendar day
        const dayActions = state.actions.filter(a => {
           if (a.frequency === 'daily') return true;
           if (a.frequency === 'weekly') {
             if (a.weeklyType === 'specific_days') return a.daysOfWeek?.includes(getDay(cloneDay));
             if (a.weeklyType === 'times_per_week') {
                // Only show floating tasks if they were completed on this day to avoid clutter/confusion
                // for historical views, or show generic slot?
                // Let's stick to "Completed only" for calendar history of floating tasks.
                return state.logs.some(l => l.actionId === a.id && l.date === dayStr && l.completed);
             }
             return a.daysOfWeek?.includes(getDay(cloneDay));
           }
           if (a.frequency === 'one-off') return a.targetDate === dayStr;
           return false;
        });

        // Determine Planned (Y) vs Completed (X) for Past Days
        // Logic: Floating tasks don't count towards Planned Y unless we want to flag "missed" floating tasks 
        // which is hard on a specific day basis. We will count only Fixed Schedule tasks for Y.
        const fixedScheduleActions = state.actions.filter(a => {
            if (a.frequency === 'daily') return true;
            if (a.frequency === 'weekly' && (a.weeklyType === 'specific_days' || !a.weeklyType)) {
               return a.daysOfWeek?.includes(getDay(cloneDay));
            }
            if (a.frequency === 'one-off') return a.targetDate === dayStr;
            return false;
        });

        const completedCount = dayActions.filter(a => state.logs.find(l => l.actionId === a.id && l.date === dayStr && l.completed)).length;
        const totalFixedPlanned = fixedScheduleActions.length;
        
        // Note: completedCount might be higher than totalFixedPlanned if user completed floating tasks.
        // We will display X/Y where Y is fixed planned. If X < Y, user missed fixed tasks.
        
        const totalCount = dayActions.length; // Used for dots rendering

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
                    {Array.from({length: Math.min(5, totalCount)}).map((_, i) => (
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
                if (a.frequency === 'daily') return true;
                if (a.frequency === 'weekly') {
                  if (a.weeklyType === 'specific_days') return a.daysOfWeek?.includes(getDay(selectedDay));
                  // For 'times_per_week', usually we show if completed OR if it's "Today" so users can do it.
                  // For past days in modal, maybe only show if done? 
                  // Let's show it always in the modal for flexibility to backfill logs.
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
  const completedLogs = state.logs.filter(l => l.completed).length;
  
  const chartData = [
    { name: 'Done', value: completedLogs, color: '#1c1917' }, // Stone-900
    { name: 'Pending', value: 15, color: '#e7e5e4' }, // Stone-200
  ];

  const objData = state.objectives.map(obj => {
    const krs = state.keyResults.filter(k => k.objectiveId === obj.id);
    const avg = krs.length ? krs.reduce((a, b) => a + (b.currentValue / b.targetValue), 0) / krs.length : 0;
    return {
      name: obj.title.substring(0, 10) + '...',
      progress: Math.round(avg * 100)
    };
  });

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-7xl mx-auto w-full">
      <h1 className="text-3xl font-bold text-stone-900 mb-2 tracking-tight">Analytics</h1>
      <p className="text-stone-500 mb-10">Data visualization of your progress.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100">
          <h3 className="text-lg font-bold text-stone-900 mb-6">Completion Ratio</h3>
          <div className="h-64 flex justify-center items-center">
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie
                   data={chartData}
                   cx="50%"
                   cy="50%"
                   innerRadius={60}
                   outerRadius={80}
                   paddingAngle={0}
                   dataKey="value"
                   stroke="none"
                 >
                   {chartData.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={entry.color} />
                   ))}
                 </Pie>
                 <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                 <Legend iconType="circle" />
               </PieChart>
             </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100">
           <h3 className="text-lg font-bold text-stone-900 mb-6">Objective Trajectory</h3>
           <div className="h-64">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={objData}>
                 <XAxis dataKey="name" fontSize={12} stroke="#a8a29e" tickLine={false} axisLine={false} />
                 <YAxis domain={[0, 100]} fontSize={12} stroke="#a8a29e" tickLine={false} axisLine={false} />
                 <Tooltip cursor={{fill: '#f5f5f4'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                 <Bar dataKey="progress" fill="#44403c" radius={[4, 4, 0, 0]} barSize={40} />
               </BarChart>
             </ResponsiveContainer>
           </div>
        </div>
      </div>
      
      <div className="mt-8 bg-stone-900 rounded-2xl p-6 md:p-8 text-white flex flex-col md:flex-row justify-between items-start md:items-center shadow-xl gap-4">
         <div>
           <h3 className="text-xl font-bold">Consistency Report</h3>
           <p className="opacity-60 mt-1 text-sm">Your data suggests you perform best on Tuesdays.</p>
         </div>
         <Button variant="secondary" className="w-full md:w-auto">Export Data</Button>
      </div>
    </div>
  );
}

function ProfilePage({ state, setState }: { state: AppState, setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const user = state.user!;
  
  // Initialize form data with safe defaults from user state
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    dailyDigest: user.preferences?.dailyDigest ?? true,
    weeklyReport: user.preferences?.weeklyReport ?? true,
    actionReminders: user.preferences?.actionReminders ?? true,
    reminderTime: user.preferences?.reminderTime ?? '09:00',
    defaultCalendarView: user.preferences?.defaultCalendarView || 'week'
  });
  
  const [isSaved, setIsSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setState(prev => ({
       ...prev,
       user: {
         ...prev.user!,
         name: formData.name,
         email: formData.email,
         preferences: {
           dailyDigest: formData.dailyDigest,
           weeklyReport: formData.weeklyReport,
           actionReminders: formData.actionReminders,
           reminderTime: formData.reminderTime,
           defaultCalendarView: formData.defaultCalendarView as 'month' | 'week'
         }
       }
    }));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  }

  const handleSyncCalendar = () => {
    const icsData = generateICalData(state);
    const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'aimachieve_goals.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-4xl mx-auto w-full">
      <h1 className="text-3xl font-bold text-stone-900 mb-2 tracking-tight">Profile & Settings</h1>
      <p className="text-stone-500 mb-10">Manage your account and notification preferences.</p>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* Account Details */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100">
           <div className="flex items-center space-x-3 mb-6">
             <div className="bg-stone-100 p-2 rounded-lg">
                <UserIcon className="w-5 h-5 text-stone-600" />
             </div>
             <h3 className="text-lg font-bold text-stone-900">Account Details</h3>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Display Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
                />
             </div>
             <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Email Address</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="block w-full rounded-lg border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 p-2.5 border"
                />
             </div>
           </div>
        </div>

        {/* App Settings */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100">
           <div className="flex items-center space-x-3 mb-6">
             <div className="bg-stone-100 p-2 rounded-lg">
                <LayoutGrid className="w-5 h-5 text-stone-600" />
             </div>
             <h3 className="text-lg font-bold text-stone-900">App Settings</h3>
           </div>

           <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Default Calendar View</label>
              <div className="flex space-x-4">
                 <label className="flex items-center space-x-2 cursor-pointer">
                   <input 
                     type="radio" 
                     name="calendarView"
                     value="week"
                     checked={formData.defaultCalendarView === 'week'}
                     onChange={() => setFormData({...formData, defaultCalendarView: 'week'})}
                     className="text-stone-900 focus:ring-stone-900"
                   />
                   <span className="text-stone-700 text-sm">Weekly</span>
                 </label>
                 <label className="flex items-center space-x-2 cursor-pointer">
                   <input 
                     type="radio" 
                     name="calendarView"
                     value="month"
                     checked={formData.defaultCalendarView === 'month'}
                     onChange={() => setFormData({...formData, defaultCalendarView: 'month'})}
                     className="text-stone-900 focus:ring-stone-900"
                   />
                   <span className="text-stone-700 text-sm">Monthly</span>
                 </label>
              </div>
           </div>
        </div>

        {/* Calendar Integration */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100">
           <div className="flex items-center space-x-3 mb-6">
             <div className="bg-stone-100 p-2 rounded-lg">
                <Calendar className="w-5 h-5 text-stone-600" />
             </div>
             <h3 className="text-lg font-bold text-stone-900">Integrations</h3>
           </div>
           
           <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border border-stone-100 rounded-xl bg-stone-50/50">
             <div className="mb-4 sm:mb-0">
               <div className="font-medium text-stone-900 flex items-center">
                 Google Calendar Sync (via iCal)
               </div>
               <div className="text-sm text-stone-500 mt-1 max-w-sm">
                 Download your schedule as an .ics file and import it into Google Calendar to see your actions.
               </div>
             </div>
             <Button type="button" variant="secondary" onClick={handleSyncCalendar} className="shrink-0">
               <Download className="w-4 h-4 mr-2" /> Export Calendar
             </Button>
           </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100">
           <div className="flex items-center space-x-3 mb-6">
             <div className="bg-stone-100 p-2 rounded-lg">
                <Bell className="w-5 h-5 text-stone-600" />
             </div>
             <h3 className="text-lg font-bold text-stone-900">Notifications</h3>
           </div>

           <div className="space-y-6">
             {/* Toggle Item */}
             <div className="flex items-center justify-between">
                <div>
                   <div className="font-medium text-stone-900">Daily Digest</div>
                   <div className="text-sm text-stone-500">Get a summary of your pending actions every morning.</div>
                </div>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, dailyDigest: !formData.dailyDigest})}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 ${formData.dailyDigest ? 'bg-stone-900' : 'bg-stone-200'}`}
                >
                   <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.dailyDigest ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
             </div>

             <div className="flex items-center justify-between">
                <div>
                   <div className="font-medium text-stone-900">Weekly Report</div>
                   <div className="text-sm text-stone-500">Receive a progress report on Sundays.</div>
                </div>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, weeklyReport: !formData.weeklyReport})}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 ${formData.weeklyReport ? 'bg-stone-900' : 'bg-stone-200'}`}
                >
                   <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.weeklyReport ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
             </div>

             <div className="flex items-center justify-between">
                <div>
                   <div className="font-medium text-stone-900">Action Reminders</div>
                   <div className="text-sm text-stone-500">Nudge me when I have actions due today.</div>
                </div>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, actionReminders: !formData.actionReminders})}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 ${formData.actionReminders ? 'bg-stone-900' : 'bg-stone-200'}`}
                >
                   <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.actionReminders ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
             </div>

             {formData.actionReminders && (
               <div className="pt-4 border-t border-stone-100 flex items-center space-x-4">
                  <div className="flex items-center space-x-2 text-stone-500">
                     <Clock className="w-4 h-4" />
                     <span className="text-sm">Default Reminder Time</span>
                  </div>
                  <input 
                    type="time" 
                    value={formData.reminderTime}
                    onChange={(e) => setFormData({...formData, reminderTime: e.target.value})}
                    className="rounded-md border-stone-200 shadow-sm focus:border-stone-900 focus:ring-stone-900 text-sm p-1.5 border"
                  />
               </div>
             )}
           </div>
        </div>

        <div className="flex items-center justify-end space-x-4">
           {isSaved && (
             <span className="text-emerald-600 text-sm flex items-center animate-fade-in">
               <CheckCircle className="w-4 h-4 mr-1.5" /> Changes saved
             </span>
           )}
           <Button type="submit" className="flex items-center">
             <Save className="w-4 h-4 mr-2" /> Save Changes
           </Button>
        </div>
      </form>
    </div>
  );
}