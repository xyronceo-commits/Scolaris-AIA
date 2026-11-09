import React, { useState } from 'react';
import { Course, Difficulty, UserProfile } from '../types';
import { DIFFICULTY_COLORS } from '../constants';
import { GeminiService } from '../services/gemini';
import { RecentFiles } from './RecentFiles';
import { getCurrentUserId } from '../lib/supabase';
import { 
  Plus, 
  Sparkles, 
  Calendar, 
  Trash2, 
  Link as LinkIcon, 
  Globe, 
  X, 
  Loader2, 
  AlertCircle,
  BookOpen
} from 'lucide-react';

interface CourseManagerProps {
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  onScheduleGenerated: (schedule: any[]) => void;
  profile: UserProfile;
  initialOpenForm?: 'manual' | 'import' | null;
  openFormSignal?: number;
}

const PRESET_SYLLABUSES = [
  {
    label: 'Computer Science',
    text: 'CS203: Advanced Algorithms (3 Units). Difficulty: Advanced. Study of dynamic programming, graph algorithms, and tree search structures.'
  },
  {
    label: 'BioStatistics',
    text: 'BIO180: Core Biostatistics (4 Units). Difficulty: Standard. Covers regression models, statistical inference, and genetic variant screening.'
  },
  {
    label: 'Microeconomics & Finance',
    text: 'EC102: Introduction to Microeconomics (3 Units). Difficulty: Basic. Analysis of consumer theory, competitive markets, and regulatory structures.'
  }
];

const PRESET_MANUALS = [
  { code: 'CS101', title: 'Intro to Computer Science', difficulty: Difficulty.EASY, units: 3, description: 'Basic programming constructs, variables, loops, control flows, and lists.' },
  { code: 'MATH201', title: 'Linear Algebra', difficulty: Difficulty.MEDIUM, units: 4, description: 'Matrix theory, eigenvalues, linear transformations, and vector spaces.' },
  { code: 'PHYS301', title: 'Quantum Mechanics', difficulty: Difficulty.HARD, units: 4, description: 'Wave equations, Schrodinger formulation, and quantum state superpositions.' }
];

const CourseManager: React.FC<CourseManagerProps> = ({
  courses,
  setCourses,
  onScheduleGenerated,
  profile,
  initialOpenForm = null,
  openFormSignal = 0,
}) => {
  const [magicText, setMagicText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  
  const [activeForm, setActiveForm] = useState<'manual' | 'import' | null>(initialOpenForm);
  const [importTab, setImportTab] = useState<'syllabus' | 'url'>('syllabus');
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialOpenForm) {
      setActiveForm(initialOpenForm);
    }
  }, [initialOpenForm]);

  React.useEffect(() => {
    if (openFormSignal > 0) {
      setActiveForm('manual');
    }
  }, [openFormSignal]);

  const [manualCourse, setManualCourse] = useState<Partial<Course>>({
    difficulty: Difficulty.MEDIUM,
    units: 3
  });

  const handleMagicImport = async () => {
    if (!magicText.trim()) return;
    setIsImporting(true);
    setError(null);
    try {
      const imported = await GeminiService.magicImport(magicText);
      const newCourses = imported.map((c: any) => ({
        ...c,
        id: crypto.randomUUID()
      }));
      setCourses(prev => [...prev, ...newCourses]);
      setMagicText('');
      setActiveForm(null);
    } catch (err: any) {
      console.error(err);
      setError("Extraction failed. Verify input syllabus syntax or structure.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleUrlImport = async () => {
    if (!urlInput.trim()) return;
    setIsImporting(true);
    setError(null);
    try {
      const imported = await GeminiService.urlImport(urlInput);
      const newCourses = imported.map((c: any) => ({
        ...c,
        id: crypto.randomUUID()
      }));
      setCourses(prev => [...prev, ...newCourses]);
      setUrlInput('');
      setActiveForm(null);
    } catch (err: any) {
      console.error(err);
      setError("URL ingestion failed. Ensure the link points to a reachable public web page.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!manualCourse.code || !manualCourse.title) return;
    
    // Check limit
    const limit = 12;
    if (courses.length >= limit) {
      setError(`Course limit reached. You can add up to ${limit} courses.`);
      return;
    }

    const newCourse: Course = {
      id: crypto.randomUUID(),
      code: manualCourse.code.toUpperCase(),
      title: manualCourse.title,
      units: manualCourse.units || 3,
      difficulty: (manualCourse.difficulty as Difficulty) || Difficulty.MEDIUM,
      description: manualCourse.description
    };
    setCourses(prev => [...prev, newCourse]);
    setActiveForm(null);
    setManualCourse({ difficulty: Difficulty.MEDIUM, units: 3 });
  };

  const removeCourse = (id: string) => {
    setCourses(prev => prev.filter(c => c.id !== id));
  };

  const generatePlan = async () => {
    if (courses.length === 0) return;
    setIsImporting(true);
    setError(null);
    try {
      const schedule = await GeminiService.generateSchedule(courses, profile.university);
      const scheduleWithIds = schedule.map((s: any) => ({
        ...s,
        id: crypto.randomUUID()
      }));
      onScheduleGenerated(scheduleWithIds);
    } catch (err: any) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Connectivity unstable.";
      setError(`Relational mapping failed: ${msg}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClearAll = () => {
    setError(null);
    if (courses.length === 0) return;
    if (window.confirm("Are you sure you want to delete all current courses? This action is irreversible.")) {
      setCourses([]);
    }
  };

  const maxCourses = 12;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-7xl mx-auto">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-slate-900">
            Courses
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-normal font-sans">
            {courses.length}/{maxCourses} registered courses
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Button 1: Magic Import */}
          <button
            onClick={() => {
              setError(null);
              setActiveForm(prev => prev === 'import' ? null : 'import');
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              activeForm === 'import'
                ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-300'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <Sparkles size={13.5} className={activeForm === 'import' ? 'animate-pulse text-blue-600' : 'text-slate-500'} />
            <span>Magic Import</span>
          </button>

          {/* Button 2: Generate Schedule */}
          <button
            onClick={generatePlan}
            disabled={courses.length === 0 || isImporting}
            title={courses.length === 0 ? "Add at least 1 course below to generate a study schedule" : "Automatically construct your weekly learning objectives schedule"}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              courses.length === 0
                ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            {isImporting ? (
              <Loader2 size={13.5} className="animate-spin text-blue-600" />
            ) : (
              <Calendar size={13.5} className={courses.length === 0 ? 'text-slate-300' : 'text-blue-600'} />
            )}
            <span>Generate Schedule</span>
          </button>

          {/* Button 3: Add Course */}
          <button
            onClick={() => {
              setError(null);
              setActiveForm(prev => prev === 'manual' ? null : 'manual');
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeForm === 'manual'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
            }`}
          >
            <Plus size={13.5} className={`transition-transform duration-200 ${activeForm === 'manual' ? 'rotate-45' : ''}`} />
            <span>Add Course</span>
          </button>

          {/* Button 4: Wipe All */}
          <button
            onClick={handleClearAll}
            disabled={courses.length === 0}
            title="Wipe your local loaded loadouts"
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              courses.length === 0
                ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'
            }`}
          >
            <Trash2 size={13.5} />
            <span>Wipe All</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-xs text-rose-700 font-medium animate-in slide-in-from-top-2">
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded-lg transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Manual Add Form */}
      {activeForm === 'manual' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs animate-in slide-in-from-top-3 duration-200">
          <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Add Course Manually</h3>
              <p className="text-xs text-slate-500">Enter your course code, title, and academic loadout.</p>
            </div>
            <button 
              onClick={() => setActiveForm(null)}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleManualAdd} className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-3 space-y-1">
              <label className="text-xs font-medium text-slate-700">Course Code</label>
              <input 
                type="text"
                required
                placeholder="e.g. CS101"
                value={manualCourse.code || ''}
                onChange={e => setManualCourse({...manualCourse, code: e.target.value})}
                className="w-full h-9 bg-white border border-slate-300 rounded-lg px-3 text-xs font-semibold uppercase tracking-wider outline-none text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all placeholder:text-slate-400 placeholder:normal-case"
              />
            </div>

            <div className="md:col-span-4 space-y-1">
              <label className="text-xs font-medium text-slate-700">Course Title</label>
              <input 
                type="text"
                required
                placeholder="e.g. Data Structures and Algorithms"
                value={manualCourse.title || ''}
                onChange={e => setManualCourse({...manualCourse, title: e.target.value})}
                className="w-full h-9 bg-white border border-slate-300 rounded-lg px-3 text-xs font-normal outline-none text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-medium text-slate-700">Difficulty</label>
              <select 
                value={manualCourse.difficulty || Difficulty.MEDIUM}
                onChange={e => setManualCourse({...manualCourse, difficulty: e.target.value as Difficulty})}
                className="w-full h-9 bg-white border border-slate-300 rounded-lg px-3 text-xs outline-none text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all cursor-pointer"
              >
                <option value={Difficulty.EASY}>Basic</option>
                <option value={Difficulty.MEDIUM}>Standard</option>
                <option value={Difficulty.HARD}>Advanced</option>
              </select>
            </div>

            <div className="md:col-span-1 space-y-1">
              <label className="text-xs font-medium text-slate-700">Credits</label>
              <input 
                type="number"
                min={1}
                max={10}
                value={manualCourse.units || 3}
                onChange={e => setManualCourse({...manualCourse, units: parseInt(e.target.value) || 3})}
                className="w-full h-9 bg-white border border-slate-300 rounded-lg px-2 text-xs font-medium text-center outline-none text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all"
              />
            </div>

            <div className="md:col-span-2 flex items-end">
              <button 
                type="submit"
                className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg transition-colors shadow-xs active:scale-[0.98] flex items-center justify-center gap-1.5"
              >
                <Plus size={14} />
                <span>Add Course</span>
              </button>
            </div>
          </form>

          {/* Quick Presets */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-[11px] font-medium text-slate-500 mb-2">Or load a sample course preset:</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_MANUALS.map((preset) => (
                <button
                  key={preset.code}
                  type="button"
                  onClick={() => {
                    setManualCourse({
                      code: preset.code,
                      title: preset.title,
                      difficulty: preset.difficulty,
                      units: preset.units,
                      description: preset.description
                    });
                  }}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 rounded-lg text-xs font-medium text-slate-700 hover:text-blue-700 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="text-[10px] font-semibold uppercase text-blue-600 bg-blue-50 px-1 rounded">{preset.code}</span>
                  <span>{preset.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI Import Form */}
      {activeForm === 'import' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs animate-in slide-in-from-top-3 duration-200 space-y-5">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Sparkles size={15} className="text-blue-600" />
                AI Syllabus Importer
              </h3>
              <p className="text-xs text-slate-500">Extract courses, units, and descriptions from syllabus text or link.</p>
            </div>
            
            <div className="flex gap-3 items-center">
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
                <button 
                  onClick={() => setImportTab('syllabus')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    importTab === 'syllabus' 
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Raw Text
                </button>
                <button 
                  onClick={() => setImportTab('url')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    importTab === 'url' 
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Web Link
                </button>
              </div>

              <button 
                onClick={() => setActiveForm(null)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {importTab === 'syllabus' ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Paste syllabus paragraphs or course outlines below. KorsIQ will parse code, title, units, and difficulty automatically.
              </p>
              <textarea
                value={magicText}
                onChange={e => setMagicText(e.target.value)}
                placeholder="CS402: Distributed Systems (3 Units). Difficulty is Advanced. Explores microservices, consensus protocols, and Cloud database design."
                className="w-full h-32 bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none resize-none placeholder:text-slate-400 transition-all"
              />
              
              {/* Presets */}
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-slate-500">Sample syllabus prompts:</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_SYLLABUSES.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setMagicText(preset.text)}
                      className="px-2.5 py-1 bg-slate-50 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 rounded-lg text-xs font-medium text-slate-700 hover:text-blue-700 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleMagicImport}
                  disabled={isImporting || !magicText.trim()}
                  className="px-4 h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg flex items-center gap-2 transition-colors shadow-xs active:scale-[0.98] disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Parsing with AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Extract & Save</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Provide a university course webpage URL. KorsIQ will inspect the outline and extract course listings.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="https://university.edu/departments/cs/courses.html"
                  className="flex-1 h-9 bg-white border border-slate-300 rounded-lg px-3 text-xs text-slate-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all placeholder:text-slate-400"
                />
                <button
                  onClick={handleUrlImport}
                  disabled={isImporting || !urlInput.trim()}
                  className="px-4 h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-xs active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"
                >
                  {isImporting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <>
                      <Globe size={14} />
                      <span>Import from Web</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Primary Enrolled Courses Dashboard Deck */}
      {courses.length === 0 ? (
        <div className="min-h-[340px] flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-dashed border-slate-300">
          <div 
            onClick={() => setActiveForm('manual')}
            className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 hover:border-blue-200 transition-all cursor-pointer shadow-2xs mb-4"
          >
            <Plus size={20} />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            No courses enrolled yet
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5">
            Add your active academic courses manually or extract them automatically from your syllabus text.
          </p>
          <div className="flex gap-2 justify-center">
            <button 
              onClick={() => setActiveForm('import')}
              className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition-colors border border-blue-200"
            >
              AI Syllabus Import
            </button>
            <button 
              onClick={() => setActiveForm('manual')}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Add Manually
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Enrolled Courses ({courses.length})
            </h3>
            
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                {courses.length} of {maxCourses} courses used
              </span>
              <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div 
                  className="h-full bg-blue-600 transition-all duration-300" 
                  style={{ width: `${(courses.length / maxCourses) * 100}%` }} 
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
            {courses.map(course => {
              const difficultyBadge = 
                course.difficulty === Difficulty.HARD 
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : course.difficulty === Difficulty.MEDIUM
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200';

              return (
                <div 
                  key={course.id} 
                  className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:shadow-xs transition-all duration-150 flex flex-col justify-between group"
                >
                  <div>
                    {/* Header: Code & Difficulty */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                          {course.code}
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium border ${difficultyBadge}`}>
                          {course.difficulty}
                        </span>
                      </div>

                      <button 
                        onClick={() => removeCourse(course.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                        title="Delete course"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <h4 className="text-sm font-semibold text-slate-900 mt-3 group-hover:text-blue-600 transition-colors">
                      {course.title}
                    </h4>

                    {course.description && (
                      <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                        {course.description}
                      </p>
                    )}
                  </div>

                  {/* Footer metadata */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {course.units} Credit Units
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-slate-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Uploaded Files */}
      <section className="pt-4">
        <RecentFiles 
          userId={getCurrentUserId() || ''} 
          courses={courses} 
        />
      </section>

    </div>
  );
};

export default CourseManager;
