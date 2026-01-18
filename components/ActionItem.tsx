import React from 'react';
import { Check, Calendar as CalendarIcon, RotateCcw, Pencil, Trash2, Repeat } from 'lucide-react';
import { Action, ActionLog, Objective, KeyResult } from '../types';

interface ActionItemProps {
  action: Action;
  keyResult?: KeyResult;
  objective?: Objective;
  log?: ActionLog;
  dateStr: string;
  onToggle: (actionId: string, date: string, currentStatus: boolean) => void;
  onEdit?: (action: Action) => void;
  onDelete?: (actionId: string) => void;
  readonly?: boolean;
  weeklyProgress?: { current: number; target: number };
}

export const ActionItem: React.FC<ActionItemProps> = ({ 
  action, 
  keyResult, 
  objective, 
  log, 
  dateStr, 
  onToggle,
  onEdit,
  onDelete,
  readonly,
  weeklyProgress
}) => {
  const isCompleted = !!log?.completed;

  return (
    <div className={`group flex items-center justify-between p-4 rounded-xl transition-all duration-300 ${
      isCompleted 
        ? 'bg-stone-100 opacity-75' 
        : 'bg-white hover:shadow-lg shadow-sm shadow-stone-200/50'
    }`}>
      <div className="flex items-center space-x-4 flex-1 min-w-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            !readonly && onToggle(action.id, dateStr, isCompleted);
          }}
          disabled={readonly}
          className={`flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 ${
            isCompleted
              ? 'bg-stone-900 border-stone-900'
              : 'border-stone-300 hover:border-stone-500'
          } ${readonly ? 'cursor-default' : 'cursor-pointer'}`}
        >
          {isCompleted && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
        </button>
        
        <div className="flex flex-col min-w-0">
          <div className="flex items-center space-x-2">
            <span className={`text-sm font-semibold tracking-tight transition-colors truncate ${
              isCompleted ? 'text-stone-500 line-through' : 'text-stone-800'
            }`}>
              {action.title}
            </span>
            {weeklyProgress && (
              <span className="text-[10px] font-medium bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded-md border border-stone-200">
                {weeklyProgress.current} / {weeklyProgress.target} this week
              </span>
            )}
          </div>
          <div className="flex items-center flex-wrap gap-2 text-xs text-stone-500 mt-1">
            {objective && (
              <span className="flex items-center px-2 py-0.5 rounded-full bg-stone-50 shrink-0">
                 <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${objective.color}`}></span>
                 {objective.title}
              </span>
            )}
            {keyResult && (
               <span className="hidden sm:inline-block text-stone-300">•</span>
            )}
            {keyResult && (
               <span className="truncate max-w-[150px]">{keyResult.title}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-3 ml-4">
        <div className="text-stone-300 flex items-center">
          {action.frequency === 'daily' && <RotateCcw className="w-4 h-4" />}
          {action.frequency === 'weekly' && (
             action.weeklyType === 'times_per_week' 
               ? <Repeat className="w-4 h-4" /> 
               : <CalendarIcon className="w-4 h-4" />
          )}
        </div>
        
        {/* Edit/Delete Actions - Visible on Hover or if on mobile/touch */}
        {!readonly && onEdit && onDelete && (
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={(e) => { e.stopPropagation(); onEdit(action); }}
              className="p-1.5 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              title="Edit Action"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(action.id); }}
              className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="Delete Action"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};