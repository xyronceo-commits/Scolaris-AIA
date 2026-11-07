import React, { useState, useEffect } from 'react';
import { AcademicTask, Course, TaskCategory, TaskPriority, TaskReminder } from '../types';
import { X, Calendar, Clock, AlertCircle, BookOpen, Flag, CheckSquare } from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskData: Omit<AcademicTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  taskToEdit?: AcademicTask | null;
  courses: Course[];
  initialCategory?: TaskCategory;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSave,
  taskToEdit,
  courses,
  initialCategory = 'assignment'
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>(initialCategory);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [reminder, setReminder] = useState<TaskReminder>('1_day');
  const [courseId, setCourseId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (taskToEdit) {
      setTitle(taskToEdit.title);
      setDescription(taskToEdit.description || '');
      setCategory(taskToEdit.category);
      setDueDate(taskToEdit.dueDate);
      setDueTime(taskToEdit.dueTime || '');
      setPriority(taskToEdit.priority);
      setReminder(taskToEdit.reminder);
      setCourseId(taskToEdit.courseId || '');
    } else {
      // Defaults for a new task
      setTitle('');
      setDescription('');
      setCategory(initialCategory);
      // Default due date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDueDate(tomorrow.toISOString().split('T')[0]);
      setDueTime('18:00');
      setPriority('medium');
      setReminder('1_day');
      setCourseId(courses[0]?.id || '');
    }
    setValidationError(null);
  }, [taskToEdit, isOpen, initialCategory, courses]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setValidationError('Please enter a task title.');
      return;
    }
    if (!dueDate) {
      setValidationError('Please select a due date.');
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        category,
        dueDate,
        dueTime: dueTime || undefined,
        priority,
        reminder,
        completed: taskToEdit?.completed ?? false,
        completedAt: taskToEdit?.completedAt,
        courseId: courseId || undefined
      });
      onClose();
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to save task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories: { id: TaskCategory; label: string; icon: string }[] = [
    { id: 'assignment', label: 'Assignment', icon: '📝' },
    { id: 'revision', label: 'Revision session', icon: '⏱️' },
    { id: 'exam', label: 'Examination', icon: '🎓' },
    { id: 'deadline', label: 'Academic deadline', icon: '📌' },
    { id: 'general', label: 'Study task', icon: '✅' }
  ];

  const priorities: { id: TaskPriority; label: string; color: string }[] = [
    { id: 'low', label: 'Low', color: 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300' },
    { id: 'medium', label: 'Medium', color: 'border-blue-400 dark:border-blue-500 text-[#2563EB] dark:text-blue-400' },
    { id: 'high', label: 'High', color: 'border-amber-400 dark:border-amber-500 text-amber-600 dark:text-amber-400' },
    { id: 'urgent', label: 'Urgent', color: 'border-rose-400 dark:border-rose-500 text-rose-600 dark:text-rose-400' }
  ];

  const reminderOptions: { id: TaskReminder; label: string }[] = [
    { id: 'none', label: 'No reminder' },
    { id: 'at_time', label: 'At time of event' },
    { id: '15_min', label: '15 minutes before' },
    { id: '1_hour', label: '1 hour before' },
    { id: '1_day', label: '1 day before' }
  ];

  return (
    <div className="fixed inset-0 bg-[#111827]/40 dark:bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-xl text-left my-6"
        role="dialog"
        aria-labelledby="task-modal-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <CheckSquare size={18} className="text-[#2563EB]" />
            <h2 id="task-modal-title" className="text-base font-bold text-[#111827] dark:text-white">
              {taskToEdit ? 'Edit academic task' : 'Add new academic task'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#5B6472] dark:text-slate-400 hover:text-[#111827] dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {validationError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg flex items-start gap-2 text-rose-700 dark:text-rose-300 text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{validationError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Task Title */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#111827] dark:text-slate-200 block">
              Task title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. GST 101 Term Paper Submission"
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs text-[#111827] dark:text-white placeholder-[#5B6472] dark:placeholder-slate-400 outline-none focus:border-[#2563EB] min-h-[44px]"
            />
          </div>

          {/* Category Selector */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#111827] dark:text-slate-200 block">
              Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`px-2.5 py-2 rounded-lg text-xs font-medium text-left transition-colors border flex items-center gap-1.5 min-h-[44px] cursor-pointer ${
                    category === cat.id
                      ? 'bg-[#EFF6FF] dark:bg-blue-950/60 border-[#2563EB] text-[#2563EB] dark:text-blue-400 font-semibold'
                      : 'bg-white dark:bg-slate-800/80 border-[#E5E7EB] dark:border-slate-700 text-[#5B6472] dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <span className="text-sm">{cat.icon}</span>
                  <span className="truncate">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Associated Course & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#111827] dark:text-slate-200 block">
                Related course (optional)
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs text-[#111827] dark:text-white outline-none focus:border-[#2563EB] min-h-[44px]"
              >
                <option value="">General / None</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#111827] dark:text-slate-200 block">
                Priority level
              </label>
              <div className="grid grid-cols-4 gap-1">
                {priorities.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPriority(p.id)}
                    className={`py-2 text-[11px] font-semibold rounded-lg border text-center transition-colors min-h-[44px] cursor-pointer ${
                      priority === p.id
                        ? `${p.color} bg-[#EFF6FF] dark:bg-slate-800 ring-1 ring-current`
                        : 'border-[#E5E7EB] dark:border-slate-700 text-[#5B6472] dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Due Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#111827] dark:text-slate-200 flex items-center gap-1">
                <Calendar size={13} className="text-[#2563EB]" />
                <span>Due date *</span>
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs text-[#111827] dark:text-white outline-none focus:border-[#2563EB] min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#111827] dark:text-slate-200 flex items-center gap-1">
                <Clock size={13} className="text-[#2563EB]" />
                <span>Due time (optional)</span>
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs text-[#111827] dark:text-white outline-none focus:border-[#2563EB] min-h-[44px]"
              />
            </div>
          </div>

          {/* Reminder Preference */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#111827] dark:text-slate-200 block">
              Reminder preference
            </label>
            <select
              value={reminder}
              onChange={(e) => setReminder(e.target.value as TaskReminder)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs text-[#111827] dark:text-white outline-none focus:border-[#2563EB] min-h-[44px]"
            >
              {reminderOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#111827] dark:text-slate-200 block">
              Notes / Instructions (optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Chapter 4 and 5 review questions, submit PDF to lecturer"
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs text-[#111827] dark:text-white placeholder-[#5B6472] dark:placeholder-slate-400 outline-none focus:border-[#2563EB] resize-none"
            />
          </div>

          {/* Modal Actions: One Primary Button per KorsIQ design system */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB] dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-[#5B6472] dark:text-slate-400 hover:text-[#111827] dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[44px] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm min-h-[44px] cursor-pointer flex items-center gap-1.5"
            >
              <span>{isSubmitting ? 'Saving...' : taskToEdit ? 'Save changes' : 'Add task'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;
