import React, { useState, useEffect, useMemo } from 'react';
import { format, subDays, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek, eachWeekOfInterval, subWeeks, getDay, isWithinInterval, parseISO } from 'date-fns';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  LineChart,
  Line,
  CartesianGrid
} from 'recharts';
import { LayoutDashboard, Target, Calendar as CalendarIcon, BarChart2, Menu, X, Filter } from 'lucide-react';

import { AppState, ViewMode } from './types';
import { loadState, saveState } from './services/storageService';
import { Button } from './components/ui/Button';
import { GoalCard } from './components/GoalCard';

// --- Analytics Page Component ---
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
  // We want strictly: Completed vs Pending (for today? or all time?)
  // The original code used "Completed Logs" vs "Pending (hardcoded 15)".
  // Let's make this "All Time Actions" vs "Completed Actions"? Or "Today's Status"?
  // A "Completion Ratio" usually implies reliability. Let's calculate reliability based on history.
  // Total Opportunities vs Total Completions.
  
  // Let's approximate "Reliability" using the last 30 days of data for the filtered set.
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
      // without overcounting. We will count them as planned 1 per completion, or amortized?
      // To keep it clean: We count Fixed Schedule items for the denominator.
      // We add floating items to numerator and denominator only when completed (or maybe ignore them for reliability?)
      // Let's stick to Fixed Schedule for "Planned"
      
      const scheduledFixed = filteredActions.filter(a => {
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
          if (a.frequency === 'daily') return true;
          if (a.frequency === 'weekly' && (a.weeklyType === 'specific_days' || !a.weeklyType)) {
             return a.daysOfWeek?.includes(dayOfWeek);
          }
          if (a.frequency === 'one-off') return a.targetDate === dayStr;
          return false;
        });

        const denominator = plannedActions.length;

        // Numerator: Fixed actions completed + Floating actions completed today
        // Note: Including floating actions in numerator but not denominator can create >100%. 
        // Let's cap at 100% or just strictly track Fixed Actions for Daily View consistency.
        // Strict Fixed Actions is cleaner for "Consistency".
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
                 <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#a8a29e', fontSize: 11}} minTickGap={30} dy={10} />
                 <YAxis axisLine={false} tickLine={false} tick={{fill: '#a8a29e', fontSize: 11}} domain={[0, 100]} unit="%" dx={-10} />
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
                  <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11, fill: '#57534e'}} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: '#fafaf9'}} 
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

// --- Main App Component ---
export default function App() {
  const [state, setState] = useState<AppState>(loadState());
  const [currentView, setCurrentView] = useState<ViewMode>('analytics');
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const NavItem = ({ view, icon: Icon, label }: { view: ViewMode; icon: any; label: string }) => (
    <button
      onClick={() => {
        setCurrentView(view);
        setSidebarOpen(false);
      }}
      className={`flex items-center space-x-3 w-full p-3 rounded-lg transition-colors ${
        currentView === view 
          ? 'bg-stone-900 text-white' 
          : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden font-sans text-stone-900">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-stone-200 z-40 flex items-center justify-between px-4">
        <span className="font-bold text-xl tracking-tight">Orbit</span>
        <button onClick={() => setSidebarOpen(true)} className="p-2">
          <Menu className="w-6 h-6 text-stone-600" />
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-stone-200 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-stone-100 flex justify-between items-center">
          <span className="text-2xl font-bold tracking-tight text-stone-900">Orbit</span>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-stone-400">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <nav className="p-4 space-y-2">
          <NavItem view="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavItem view="goals" icon={Target} label="Goals" />
          <NavItem view="calendar" icon={CalendarIcon} label="Calendar" />
          <NavItem view="analytics" icon={BarChart2} label="Analytics" />
        </nav>
      </aside>

      {/* Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-16 md:pt-0">
        {currentView === 'analytics' && <AnalyticsPage state={state} />}
        {currentView === 'dashboard' && (
          <div className="p-8 text-center text-stone-500 mt-20">
            <h2 className="text-2xl font-bold text-stone-900 mb-2">Dashboard</h2>
            <p>Work in progress. Check Analytics.</p>
          </div>
        )}
        {currentView === 'goals' && (
          <div className="p-8">
            <h1 className="text-3xl font-bold text-stone-900 mb-8">Goals</h1>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {state.objectives.map(obj => (
                <GoalCard 
                   key={obj.id} 
                   objective={obj}
                   keyResults={state.keyResults.filter(k => k.objectiveId === obj.id)}
                   actions={state.actions.filter(a => {
                     const kr = state.keyResults.find(k => k.id === a.keyResultId);
                     return kr?.objectiveId === obj.id;
                   })}
                   onAddKeyResult={() => {}}
                   onAddAction={() => {}}
                   onEditKeyResult={() => {}}
                   onEditObjective={() => {}}
                   onDeleteObjective={() => {}}
                   onDeleteKeyResult={() => {}}
                   onEditAction={() => {}}
                   onDeleteAction={() => {}}
                   onToggleKRStatus={() => {}}
                 />
              ))}
              {state.objectives.length === 0 && (
                <div className="col-span-full text-center py-20 text-stone-400">
                  No goals found.
                </div>
              )}
            </div>
          </div>
        )}
        {currentView === 'calendar' && (
           <div className="p-8 text-center text-stone-500 mt-20">
            <h2 className="text-2xl font-bold text-stone-900 mb-2">Calendar</h2>
            <p>Work in progress.</p>
          </div>
        )}
      </main>
    </div>
  );
}