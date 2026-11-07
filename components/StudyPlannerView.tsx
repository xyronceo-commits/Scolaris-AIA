import React, { useState } from 'react';
import { Course, UserProfile, StudySession, StudyHubData } from '../types';
import CourseManager from './CourseManager';
import CGPACalculator from './CGPACalculator';
import TimetableView from './TimetableView';
import ScheduleView from './ScheduleView';
import AnalyticsView from './AnalyticsView';
import { BookOpen, Calculator, Calendar, Clock, BarChart3, Plus } from 'lucide-react';

export type PlannerTab = 'courses' | 'cgpa' | 'timetable' | 'revision' | 'analytics';

interface StudyPlannerViewProps {
  initialTab?: PlannerTab;
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
  initialTab = 'cgpa',
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
  const [activeTab, setActiveTab] = useState<PlannerTab>(initialTab);

  const tabs: { id: PlannerTab; label: string; icon: React.ReactNode; mobile: boolean }[] = [
    { id: 'courses', label: 'Courses', icon: <BookOpen size={16} />, mobile: true },
    { id: 'cgpa', label: 'CGPA', icon: <Calculator size={16} />, mobile: true },
    { id: 'timetable', label: 'Timetable', icon: <Calendar size={16} />, mobile: true },
    { id: 'revision', label: 'Revision', icon: <Clock size={16} />, mobile: false },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={16} />, mobile: false }
  ];

  return (
    <div className="space-y-6">
      {/* Planner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E5E7EB] dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#111827] dark:text-white tracking-tight">
            Study Planner
          </h1>
          <p className="text-xs sm:text-sm text-[#5B6472] dark:text-slate-400 mt-0.5">
            Courses, CGPA, timetable and revision
          </p>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-2">
          {activeTab === 'cgpa' ? (
            <button
              onClick={() => {
                const addBtn = document.getElementById('add-course-result-btn');
                if (addBtn) addBtn.click();
              }}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm min-h-[44px] transition-colors cursor-pointer"
            >
              <Plus size={16} />
              <span>+ Add course result</span>
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('courses')}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm min-h-[44px] transition-colors cursor-pointer"
            >
              <Plus size={16} />
              <span>+ Manage Courses</span>
            </button>
          )}
        </div>
      </div>

      {/* Segmented Tab Navigation */}
      <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-slate-800">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors border-b-2 min-h-[44px] -mb-px whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-[#2563EB] text-[#2563EB] font-semibold dark:border-blue-500 dark:text-blue-400'
                    : 'border-transparent text-[#5B6472] dark:text-slate-400 hover:text-[#111827] dark:hover:text-white'
                } ${!tab.mobile ? 'hidden md:flex' : 'flex'}`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Mobile dropdown for remaining tabs */}
        <div className="md:hidden">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as PlannerTab)}
            className="text-xs bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg px-2.5 py-2 text-[#5B6472] dark:text-slate-300 min-h-[44px]"
            aria-label="Select study planner view"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active Tab Content */}
      <div className="pt-2">
        {activeTab === 'courses' && (
          <CourseManager
            courses={courses}
            setCourses={setCourses}
            onScheduleGenerated={(newSchedule) => {
              setSchedule(newSchedule);
              setActiveTab('revision');
            }}
            profile={profile}
          />
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

        {activeTab === 'timetable' && (
          <TimetableView schedule={schedule} courses={courses} />
        )}

        {activeTab === 'revision' && (
          <ScheduleView
            schedule={schedule}
            courses={courses}
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
      </div>
    </div>
  );
};

export default StudyPlannerView;
