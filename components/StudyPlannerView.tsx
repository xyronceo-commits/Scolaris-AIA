import React, { useState, useEffect } from 'react';
import { Course, UserProfile, StudySession, StudyHubData, AcademicTask, TaskCategory } from '../types';
import CourseManager from './CourseManager';
import CGPACalculator from './CGPACalculator';
import TimetableView from './TimetableView';
import ScheduleView from './ScheduleView';
import AnalyticsView from './AnalyticsView';
import TaskModal from './TaskModal';
import { DBService } from '../services/db';
import { getCurrentUserId } from '../lib/supabase';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Circle, 
  Plus, 
  Trash2, 
  Edit2, 
  Award,
  BookOpen,
  Calculator,
  BarChart3,
  CalendarDays,
  Flag,
  ChevronRight
} from 'lucide-react';

export type PlannerViewMode = 'today' | 'week' | 'exams' | 'courses' | 'timetable' | 'cgpa' | 'analytics';

interface StudyPlannerViewProps {
  initialTab?: string;
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  schedule: StudySession[];
  setSchedule: React.Dispatch<React.SetStateAction<StudySession[]>>;
  profile: UserProfile;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  addNotification: (type: any, title?: any, message?: any, link?: any) => void;
  onOpenHub: (courseId: string) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  hubs: Record<string, StudyHubData>;
}

export const StudyPlannerView: React.FC<StudyPlannerViewProps> = ({
  initialTab = 'today',
  courses,
  setCourses,
  schedule,
  setSchedule,
  profile,
  onUpdateProfile,
  addNotification,
  onOpenHub,
  isDarkMode,
  onToggleTheme,
  hubs
}) => {
  // Primary tabs: Today (default), Week, Exams
  const [activeTab, setActiveTab] = useState<PlannerViewMode>(() => {
    if (['courses', 'timetable', 'cgpa', 'analytics', 'week', 'exams'].includes(initialTab)) {
      return initialTab as PlannerViewMode;
    }
    return 'today';
  });

  const [tasks, setTasks] = useState<AcademicTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<AcademicTask | null>(null);
  const [modalCategory, setModalCategory] = useState<TaskCategory>('general');

  const userId = getCurrentUserId() || (profile as any)?.id || '';

  // Load real tasks from Supabase
  const loadTasks = async () => {
    if (!userId) return;
    setIsLoadingTasks(true);
    try {
      const fetched = await DBService.getTasks(userId);
      setTasks(fetched);
    } catch (err) {
      console.warn('Failed to load tasks:', err);
    } finally {
      setIsLoadingTasks(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [userId]);

  // Date filters
  const today = new Date();
  const todayIso = today.toISOString().split('T')[0];

  const dayOfWeek = today.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const mondayIso = monday.toISOString().split('T')[0];
  const sundayIso = sunday.toISOString().split('T')[0];

  const todayTasks = tasks.filter(t => t.dueDate === todayIso || (!t.completed && t.dueDate < todayIso));
  const weekTasks = tasks.filter(t => t.dueDate >= mondayIso && t.dueDate <= sundayIso);
  const examTasks = tasks.filter(t => t.category === 'exam');

  const currentList = activeTab === 'today' ? todayTasks : activeTab === 'week' ? weekTasks : examTasks;

  const handleToggleTask = async (taskId: string) => {
    if (!userId) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const nextCompleted = !task.completed;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: nextCompleted, completedAt: nextCompleted ? new Date().toISOString() : undefined } : t));
    await DBService.toggleTaskCompleted(userId, taskId);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!userId) return;
    setTasks(prev => prev.filter(t => t.id !== taskId));
    await DBService.deleteTask(userId, taskId);
    addNotification('task', 'Task Deleted', 'Task removed from your schedule.');
  };

  const handleSaveTask = async (taskData: Omit<AcademicTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    if (!userId) return;
    if (taskToEdit) {
      const updated = await DBService.updateTask(userId, taskToEdit.id, taskData);
      if (updated) {
        setTasks(prev => prev.map(t => t.id === taskToEdit.id ? updated : t));
        addNotification('task', 'Task Updated', `"${taskData.title}" was updated.`);
      }
    } else {
      const created = await DBService.createTask(userId, taskData);
      setTasks(prev => [created, ...prev]);
      addNotification('task', 'Task Created', `"${taskData.title}" added to your schedule.`);
    }
    setIsTaskModalOpen(false);
    setTaskToEdit(null);
  };

  const openNewTaskModal = (cat: TaskCategory = 'general') => {
    setTaskToEdit(null);
    setModalCategory(cat);
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (task: AcademicTask) => {
    setTaskToEdit(task);
    setModalCategory(task.category);
    setIsTaskModalOpen(true);
  };

  const isPrimaryTab = ['today', 'week', 'exams'].includes(activeTab);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header with ONE primary action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Study Planner
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Keep track of today&apos;s study tasks, weekly schedule, and exam milestones.
          </p>
        </div>

        {/* ONE Primary Action */}
        <button
          onClick={() => openNewTaskModal(activeTab === 'exams' ? 'exam' : 'general')}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs min-h-[44px] transition-colors cursor-pointer"
        >
          <Plus size={16} />
          <span>{activeTab === 'exams' ? '+ Add Exam' : '+ Add task'}</span>
        </button>
      </div>

      {/* Primary Tabs (Today / Week / Exams) & Secondary switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-2">
        {/* Core 3 Tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('today')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors min-h-[44px] flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'today'
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-900'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock size={15} />
            <span>Today</span>
            {todayTasks.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-blue-200/60 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                {todayTasks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('week')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors min-h-[44px] flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'week'
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-900'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CalendarDays size={15} />
            <span>Week</span>
            {weekTasks.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {weekTasks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('exams')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors min-h-[44px] flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'exams'
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-900'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Award size={15} />
            <span>Exams</span>
            {examTasks.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                {examTasks.length}
              </span>
            )}
          </button>
        </div>

        {/* Secondary Views Control */}
        <div className="flex items-center gap-1">
          <select
            value={isPrimaryTab ? '' : activeTab}
            onChange={(e) => {
              if (e.target.value) setActiveTab(e.target.value as PlannerViewMode);
            }}
            className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 min-h-[44px] cursor-pointer"
            aria-label="Planner Tools"
          >
            <option value="" disabled>Other Tools...</option>
            <option value="courses">Course Manager</option>
            <option value="timetable">Weekly Timetable</option>
            <option value="cgpa">CGPA Calculator</option>
            <option value="analytics">Analytics</option>
          </select>
          {!isPrimaryTab && (
            <button
              onClick={() => setActiveTab('today')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 min-h-[44px] flex items-center"
            >
              Back to Tasks
            </button>
          )}
        </div>
      </div>

      {/* Primary List View: Today / Week / Exams */}
      {isPrimaryTab && (
        <div className="space-y-3">
          {currentList.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 sm:p-12 text-center max-w-md mx-auto space-y-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                {activeTab === 'exams' ? <Award size={24} /> : <Calendar size={24} />}
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {activeTab === 'today' && "No tasks due today"}
                  {activeTab === 'week' && "No tasks scheduled for this week"}
                  {activeTab === 'exams' && "No exam milestones scheduled"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {activeTab === 'today' && "You're all caught up! Add a new task to organize your study session."}
                  {activeTab === 'week' && "Plan ahead to keep assignments and study blocks organized."}
                  {activeTab === 'exams' && "Track upcoming exams and tests with target preparation milestones."}
                </p>
              </div>
              <button
                onClick={() => openNewTaskModal(activeTab === 'exams' ? 'exam' : 'general')}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold min-h-[44px] transition-colors cursor-pointer shadow-xs"
              >
                <Plus size={16} />
                <span>{activeTab === 'exams' ? '+ Add Exam Date' : '+ Add task'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {currentList.map(task => {
                const course = courses.find(c => c.id === task.courseId);
                const isOverdue = !task.completed && task.dueDate < todayIso;

                return (
                  <div
                    key={task.id}
                    className={`bg-white dark:bg-slate-900 border rounded-xl p-4 transition-colors flex items-center justify-between gap-3 ${
                      task.completed
                        ? 'border-slate-200 dark:border-slate-800 opacity-60'
                        : isOverdue
                        ? 'border-red-200 dark:border-red-950/80 bg-red-50/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {/* Checkbox & Details */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <button
                        onClick={() => handleToggleTask(task.id)}
                        className="text-slate-400 hover:text-blue-600 transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                        title={task.completed ? 'Mark incomplete' : 'Mark completed'}
                        aria-label={task.completed ? 'Mark incomplete' : 'Mark completed'}
                      >
                        {task.completed ? (
                          <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Circle size={20} />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {course && (
                            <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900">
                              {course.code}
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                            task.priority === 'urgent' ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' :
                            task.priority === 'high' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                            'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                            {task.priority}
                          </span>
                          {task.category === 'exam' && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                              Exam
                            </span>
                          )}
                        </div>

                        <p className={`text-sm font-semibold truncate ${
                          task.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}>
                          {task.title}
                        </p>

                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            <span>{task.dueDate}</span>
                          </span>
                          {task.dueTime && (
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              <span>{task.dueTime}</span>
                            </span>
                          )}
                          {isOverdue && (
                            <span className="text-red-600 dark:text-red-400 font-medium">Overdue</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditTaskModal(task)}
                        className="p-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                        title="Edit task"
                        aria-label="Edit task"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-2.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                        title="Delete task"
                        aria-label="Delete task"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Secondary Views */}
      {activeTab === 'courses' && (
        <CourseManager
          courses={courses}
          setCourses={setCourses}
          onScheduleGenerated={(newSchedule) => {
            setSchedule(newSchedule);
            setActiveTab('today');
          }}
          profile={profile}
        />
      )}

      {activeTab === 'timetable' && (
        <TimetableView schedule={schedule} courses={courses} />
      )}

      {activeTab === 'cgpa' && (
        <CGPACalculator
          profile={profile}
          onUpdateProfile={onUpdateProfile}
          courses={courses}
          schedule={schedule}
          setSchedule={setSchedule}
          addNotification={addNotification}
          onOpenHub={onOpenHub}
        />
      )}

      {activeTab === 'analytics' && (
        <AnalyticsView
          courses={courses}
          schedule={schedule}
          profile={profile}
          hubs={hubs}
          isDarkMode={isDarkMode}
          onToggleTheme={onToggleTheme}
          setCourses={setCourses}
        />
      )}

      {/* Task Modal for creating / editing tasks */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setTaskToEdit(null);
        }}
        onSave={handleSaveTask}
        taskToEdit={taskToEdit}
        courses={courses}
        initialCategory={modalCategory}
      />
    </div>
  );
};

export default StudyPlannerView;
