import React, { useState } from 'react';
import { Objective, KeyResult, Action } from '../types';
import { Target, Plus, ArrowRight, Pencil, Trash2, Archive, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/Button';
import { ActionItem } from './ActionItem'; // Reuse ActionItem for consistency
import { format, parseISO } from 'date-fns';

interface GoalCardProps {
  objective: Objective;
  keyResults: KeyResult[];
  actions: Action[];
  onAddKeyResult: (objId: string) => void;
  onAddAction: (krId: string) => void;
  onEditKeyResult: (kr: KeyResult) => void;
  onEditObjective: (obj: Objective) => void;
  onDeleteObjective: (id: string) => void;
  onDeleteKeyResult: (id: string) => void;
  onEditAction: (action: Action) => void;
  onDeleteAction: (id: string) => void;
  onToggleKRStatus: (id: string, newStatus: 'active' | 'archived') => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({
  objective,
  keyResults,
  actions,
  onAddKeyResult,
  onAddAction,
  onEditKeyResult,
  onEditObjective,
  onDeleteObjective,
  onDeleteKeyResult,
  onEditAction,
  onDeleteAction,
  onToggleKRStatus
}) => {
  const [showArchived, setShowArchived] = useState(false);

  // Filter KRs
  const activeKRs = keyResults.filter(kr => (kr.status || 'active') === 'active');
  const archivedKRs = keyResults.filter(kr => kr.status === 'archived');

  // Calculate Progress (Only based on Active KRs)
  const totalActiveKRs = activeKRs.length;
  const progressSum = activeKRs.reduce((acc, kr) => {
    const p = Math.min(100, Math.max(0, (kr.currentValue / kr.targetValue) * 100));
    return acc + p;
  }, 0);
  const objectiveProgress = totalActiveKRs > 0 ? Math.round(progressSum / totalActiveKRs) : 0;

  const renderKeyResult = (kr: KeyResult, isArchived: boolean = false) => {
    const krActions = actions.filter(a => a.keyResultId === kr.id);
    const krProgress = Math.min(100, (kr.currentValue / kr.targetValue) * 100);

    return (
      <div key={kr.id} className={`group/kr relative ${isArchived ? 'opacity-60 grayscale' : ''}`}>
        <div className="flex justify-between items-end mb-2">
          <div className="flex-1 mr-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-stone-800 break-words">{kr.title}</span>
                {kr.dueDate && (
                  <span className="text-[10px] text-stone-400 font-medium">
                    Due {format(parseISO(kr.dueDate), 'MMM d, yyyy')}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 opacity-0 group-hover/kr:opacity-100 transition-opacity">
                 {!isArchived ? (
                   <>
                    <button onClick={() => onEditKeyResult(kr)} className="text-xs font-medium text-stone-400 hover:text-stone-900 flex items-center" title="Edit">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => onToggleKRStatus(kr.id, 'archived')} className="text-xs font-medium text-stone-400 hover:text-amber-600 flex items-center" title="Archive (Hide from views)">
                      <Archive className="w-3 h-3" />
                    </button>
                    <button onClick={() => onDeleteKeyResult(kr.id)} className="text-xs font-medium text-stone-400 hover:text-rose-600" title="Delete Permanently">
                      <Trash2 className="w-3 h-3" />
                    </button>
                   </>
                 ) : (
                   <>
                    <button onClick={() => onToggleKRStatus(kr.id, 'active')} className="text-xs font-medium text-stone-400 hover:text-emerald-600 flex items-center" title="Restore">
                      <RotateCcw className="w-3 h-3 mr-1" /> Restore
                    </button>
                    <button onClick={() => onDeleteKeyResult(kr.id)} className="text-xs font-medium text-stone-400 hover:text-rose-600" title="Delete Permanently">
                      <Trash2 className="w-3 h-3" />
                    </button>
                   </>
                 )}
              </div>
            </div>
            <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-700 ${objective.color}`} 
                style={{ width: `${krProgress}%` }}
              ></div>
            </div>
          </div>
          <div className="text-xs font-mono text-stone-500 whitespace-nowrap">
            {kr.currentValue} / {kr.targetValue} <span className="text-stone-400">{kr.unit}</span>
          </div>
        </div>

        <div className={`pl-4 border-l border-stone-100 mt-3 space-y-2 ${isArchived ? 'hidden' : ''}`}>
            {krActions.map(act => (
              <div key={act.id} className="flex items-center justify-between group/act pr-2">
                <div className="flex items-center text-xs text-stone-500 truncate">
                  <div className="w-1 h-1 bg-stone-300 rounded-full mr-2 shrink-0"></div>
                  <span className="truncate">{act.title}</span>
                </div>
                <div className="flex space-x-2 opacity-0 group-hover/act:opacity-100 transition-opacity">
                  <button onClick={() => onEditAction(act)} className="text-stone-400 hover:text-stone-900"><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => onDeleteAction(act.id)} className="text-stone-400 hover:text-rose-600"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
            <button 
              onClick={() => onAddAction(kr.id)}
              className="flex items-center text-xs text-stone-400 hover:text-stone-900 transition-colors mt-2"
            >
              <Plus className="w-3 h-3 mr-1" /> Add Action
            </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 p-6 md:p-8 h-full flex flex-col group/card">
      {/* Objective Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex-1 pr-4">
           <div className="flex items-center space-x-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${objective.color}`}></span>
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">Objective</span>
           </div>
          <h3 className="text-xl font-bold text-stone-900 tracking-tight leading-snug break-words">{objective.title}</h3>
          {objective.description && <p className="text-sm text-stone-500 mt-2 leading-relaxed break-words">{objective.description}</p>}
        </div>
        
        <div className="flex flex-col items-end space-y-2">
          <span className="text-2xl font-bold text-stone-900">{objectiveProgress}%</span>
          
          <div className="flex space-x-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
            <button 
              onClick={() => onEditObjective(objective)}
              className="p-1.5 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              title="Edit Goal"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button 
              onClick={() => onDeleteObjective(objective.id)}
              className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="Delete Goal"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Active Key Results */}
      <div className="space-y-6 flex-1">
        {activeKRs.map(kr => renderKeyResult(kr, false))}
      </div>
      
      {/* Archived Section */}
      {archivedKRs.length > 0 && (
        <div className="mt-6 pt-4 border-t border-stone-100">
          <button 
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center text-xs font-semibold text-stone-400 hover:text-stone-600 transition-colors w-full"
          >
             {showArchived ? <ChevronUp className="w-3 h-3 mr-1.5" /> : <ChevronDown className="w-3 h-3 mr-1.5" />}
             {showArchived ? 'Hide' : 'Show'} {archivedKRs.length} Inactive {archivedKRs.length === 1 ? 'Result' : 'Results'}
          </button>
          
          {showArchived && (
            <div className="mt-4 space-y-6">
              {archivedKRs.map(kr => renderKeyResult(kr, true))}
            </div>
          )}
        </div>
      )}

      {/* Add Button */}
      <div className={`mt-6 ${archivedKRs.length === 0 ? 'pt-6 border-t border-stone-100' : ''}`}>
        <Button variant="ghost" size="sm" onClick={() => onAddKeyResult(objective.id)} className="w-full text-stone-400 hover:text-stone-900">
          <Plus className="w-4 h-4 mr-1" /> Add Key Result
        </Button>
      </div>
    </div>
  );
};