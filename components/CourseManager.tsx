import React, { useState } from 'react';
import { Course, Difficulty, UserProfile } from '../types';
import { DIFFICULTY_COLORS } from '../constants';
import { GeminiService } from '../services/gemini';
import { RecentFiles } from './RecentFiles';
import { auth } from '../lib/firebase';
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
}

const PRESET_SYLLABUSES = [
  {
    label: '💻 Computer Science',
    text: 'CS203: Advanced Algorithms (3 Units). Difficulty: Advanced. Study of dynamic programming, graph algorithms, and tree search structures.'
  },
  {
    label: '🧬 BioStatistics',
    text: 'BIO180: Core Biostatistics (4 Units). Difficulty: Standard. Covers regression models, statistical inference, and genetic variant screening.'
  },
  {
    label: '📊 Finance Intro',
    text: 'EC102: Introduction to Microeconomics (3 Units). Difficulty: Basic. Analysis of consumer theory, competitive markets, and regulatory structures.'
  }
];

const PRESET_MANUALS = [
  { code: 'CS101', title: 'Intro to Computer Science', difficulty: Difficulty.EASY, units: 3, description: 'Basic programming constructs, variables, loops, control flows, and lists.' },
  { code: 'MATH201', title: 'Linear Algebra', difficulty: Difficulty.MEDIUM, units: 4, description: 'Matrix theory, eigenvalues, linear transformations, and vector spaces.' },
  { code: 'PHYS301', title: 'Quantum Mechanics', difficulty: Difficulty.HARD, units: 4, description: 'Wave equations, Schrodinger formulation, and quantum state superpositions.' }
];

const CourseManager: React.FC<CourseManagerProps> = ({ courses, setCourses, onScheduleGenerated, profile }) => {
  const [magicText, setMagicText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  
  const [activeForm, setActiveForm] = useState<'manual' | 'import' | null>(null);
  const [importTab, setImportTab] = useState<'syllabus' | 'url'>('syllabus');
  const [error, setError] = useState<string | null>(null);

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

  const handleLoadDemo = () => {
    setError(null);
    const demoCourses: Course[] = [
      {
        id: crypto.randomUUID(),
        code: 'CS203',
        title: 'Advanced Algorithms',
        units: 3,
        difficulty: Difficulty.HARD,
        description: 'Study of dynamic programming, graph algorithms, complex complexity classes, and tree search structures.'
      },
      {
        id: crypto.randomUUID(),
        code: 'BIO180',
        title: 'Core Biostatistics',
        units: 4,
        difficulty: Difficulty.MEDIUM,
        description: 'Covers regression models, statistical inference, data sampling, and genetic variant screening.'
      },
      {
        id: crypto.randomUUID(),
        code: 'EC102',
        title: 'Introduction to Microeconomics',
        units: 3,
        difficulty: Difficulty.EASY,
        description: 'Analysis of consumer choices, competitive pricing, supply/demand curves, and regulatory systems.'
      }
    ];
    setCourses(demoCourses);
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
    <div className="space-y-10 animate-in fade-in duration-700">
      
      {/* Dynamic Header Section */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-6 border-b border-slate-100 pb-8">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-slate-900">
            Courses
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium font-sans">
            {courses.length}/{maxCourses} courses
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Button 1: Magic Import */}
          <button
            onClick={() => {
              setError(null);
              setActiveForm(prev => prev === 'import' ? null : 'import');
            }}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider border transition-all duration-200 cursor-pointer select-none active:scale-95 ${
              activeForm === 'import'
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-[0_0_12px_rgba(99,102,241,0.12)] ring-2 ring-indigo-500/10'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-indigo-600'
            }`}
          >
            <Sparkles size={13.5} className={`text-indigo-555 transition-transform ${activeForm === 'import' ? 'animate-pulse scale-105' : ''}`} />
            <span>Magic Import</span>
          </button>

          {/* Button 2: Generate Schedule */}
          <button
            onClick={generatePlan}
            disabled={courses.length === 0 || isImporting}
            title={courses.length === 0 ? "Add at least 1 course below to generate a study schedule" : "Automatically construct your weekly learning objectives schedule"}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider border transition-all duration-200 cursor-pointer select-none active:scale-95 ${
              courses.length === 0
                ? 'bg-slate-50 border-slate-150 text-slate-400 cursor-not-allowed opacity-85'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-emerald-600'
            }`}
          >
            {isImporting ? (
              <Loader2 size={13.5} className="animate-spin text-indigo-600" />
            ) : (
              <Calendar size={13.5} className={courses.length === 0 ? 'text-slate-300' : 'text-emerald-500'} />
            )}
            <span>Generate Schedule</span>
          </button>

          {/* Button 3: Add Course */}
          <button
            onClick={() => {
              setError(null);
              setActiveForm(prev => prev === 'manual' ? null : 'manual');
            }}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer select-none active:scale-95 ${
              activeForm === 'manual'
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
                : 'bg-slate-900 hover:bg-black text-white shadow-xs'
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
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider border transition-all duration-200 cursor-pointer select-none active:scale-95 ${
              courses.length === 0
                ? 'bg-slate-50 border-slate-150 text-slate-400 cursor-not-allowed opacity-80'
                : 'bg-white border-slate-200 text-slate-700 hover:border-rose-350 hover:bg-rose-50/50 hover:text-rose-600'
            }`}
          >
            <Trash2 size={13.5} className={courses.length === 0 ? 'text-slate-300' : 'text-rose-555'} />
            <span>Wipe All</span>
          </button>
        </div>
      </div>

      {/* Elegant Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-xs text-rose-600 font-medium animate-in slide-in-from-top-2">
          <AlertCircle size={16} className="text-rose-500 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100/50 rounded-lg transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Interactive Expandable Form Containers */}
      {activeForm === 'manual' && (
        <div className="bg-slate-50/50 border border-slate-100 rounded-[2rem] p-6 sm:p-8 animate-in slide-in-from-top-4 duration-300 relative">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-serif font-bold text-slate-900 tracking-tight">Add Manual Course</h3>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black font-mono">Fill syllabus particulars</p>
            </div>
            <button 
              onClick={() => setActiveForm(null)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-all"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleManualAdd} className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Identifier Code</label>
              <input 
                type="text"
                required
                placeholder="e.g. CS101"
                value={manualCourse.code || ''}
                onChange={e => setManualCourse({...manualCourse, code: e.target.value})}
                className="w-full h-11 bg-white border border-slate-200 rounded-xl px-4 text-xs font-bold uppercase tracking-widest outline-none text-slate-700 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 transition-all"
              />
            </div>

            <div className="md:col-span-4 space-y-1.5">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Course Title</label>
              <input 
                type="text"
                required
                placeholder="e.g. Structure & Interpretation of Programs"
                value={manualCourse.title || ''}
                onChange={e => setManualCourse({...manualCourse, title: e.target.value})}
                className="w-full h-11 bg-white border border-slate-200 rounded-xl px-4 text-xs font-semibold outline-none text-slate-700 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 transition-all"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Difficulty</label>
              <div className="relative">
                <select 
                  value={manualCourse.difficulty || Difficulty.MEDIUM}
                  onChange={e => setManualCourse({...manualCourse, difficulty: e.target.value as Difficulty})}
                  className="w-full h-11 bg-white border border-slate-200 rounded-xl px-4 text-xs font-bold uppercase tracking-wider outline-none text-slate-700 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 transition-all appearance-none cursor-pointer pr-10"
                >
                  <option value={Difficulty.EASY}>Basic</option>
                  <option value={Difficulty.MEDIUM}>Standard</option>
                  <option value={Difficulty.HARD}>Advanced</option>
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Plus size={12} className="rotate-45" />
                </div>
              </div>
            </div>

            <div className="md:col-span-1 space-y-1.5">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Credits</label>
              <input 
                type="number"
                min={1}
                max={10}
                value={manualCourse.units || 3}
                onChange={e => setManualCourse({...manualCourse, units: parseInt(e.target.value) || 3})}
                className="w-full h-11 bg-white border border-slate-200 rounded-xl px-2 text-xs font-bold text-center outline-none text-slate-700 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 transition-all"
              />
            </div>

            <div className="md:col-span-2 flex items-end">
              <button 
                type="submit"
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Plus size={12} />
                <span>Add Case</span>
              </button>
            </div>
          </form>

          {/* Quick Loading Presets */}
          <div className="mt-6 pt-4 border-t border-slate-200/50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Or click to load a sample course preset:</p>
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
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 rounded-xl text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-all active:scale-95 flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <span className="text-[9px] font-bold uppercase text-indigo-600 bg-indigo-50/70 border border-indigo-100/50 px-1.5 py-0.5 rounded-md">{preset.code}</span>
                  <span>{preset.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeForm === 'import' && (
        <div className="bg-slate-50/50 border border-slate-100 rounded-[2rem] p-6 sm:p-8 animate-in slide-in-from-top-4 duration-300 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <div className="space-y-1">
              <h3 className="text-lg font-serif font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-500 animate-pulse" />
                Neural Syllabus Entry
              </h3>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black font-mono">Extract academic loadouts with ease</p>
            </div>
            
            <div className="flex gap-4 items-center">
              {/* Mini-tab selector */}
              <div className="flex bg-slate-100/80 p-1 rounded-xl">
                <button 
                  onClick={() => setImportTab('syllabus')}
                  className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                    importTab === 'syllabus' 
                      ? 'bg-white text-indigo-600 shadow-xs' 
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Raw Text
                </button>
                <button 
                  onClick={() => setImportTab('url')}
                  className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                    importTab === 'url' 
                      ? 'bg-white text-indigo-600 shadow-xs' 
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Syllabus url
                </button>
              </div>

              <button 
                onClick={() => setActiveForm(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-all"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {importTab === 'syllabus' ? (
            <div className="space-y-4">
              <div className="text-[10px] text-slate-500 leading-relaxed max-w-2xl font-medium">
                 Paste raw syllabus content, university registration text, or course requirements. Scolaris AI analyzes the text, identifies credits/descriptions, and populates your course deck.
              </div>
              <textarea
                value={magicText}
                onChange={e => setMagicText(e.target.value)}
                placeholder="CS402: Distributed Systems (3 Units). Difficulty is Advanced. Explores microservices, consensus protocols, and Cloud database design."
                className="w-full h-36 bg-white border border-slate-200 rounded-2xl p-4 text-xs font-semibold outline-none text-slate-700 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 transition-all resize-none shadow-xs"
              />
              
              {/* Syllabus Presets */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Or Click to Load a Raw Syllabus Sample Text:</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_SYLLABUSES.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setMagicText(preset.text)}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 rounded-xl text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-all active:scale-95 flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleMagicImport}
                  disabled={isImporting || !magicText.trim()}
                  className="px-6 h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Extracting Metadata...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} />
                      <span>Parse & Synchronize</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-[10px] text-slate-500 leading-relaxed max-w-2xl font-medium">
                  Provide a web page syllabus endpoint URL. The crawler will scrape course units, code headers, and syllabus descriptions securely.
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="url"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="https://university.edu/departments/cs/courses.html"
                  className="flex-1 h-11 bg-white border border-slate-200 rounded-xl px-4 text-xs font-semibold outline-none text-slate-700 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 transition-all"
                />
                <button
                  onClick={handleUrlImport}
                  disabled={isImporting || !urlInput.trim()}
                  className="px-6 h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50 whitespace-nowrap"
                >
                  {isImporting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Scraping URL...</span>
                    </>
                  ) : (
                    <>
                      <Globe size={13} />
                      <span>Ingest link</span>
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
        <div className="min-h-[460px] flex flex-col items-center justify-center p-8 text-center bg-slate-50/40 rounded-[2.5rem] border-2 border-dashed border-slate-200/80 animate-in fade-in duration-500">
          <div 
            onClick={() => setActiveForm('manual')}
            className="w-16 h-16 bg-white border border-slate-100 hover:border-indigo-100 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all cursor-pointer shadow-sm hover:shadow active:scale-95 mb-6"
          >
            <Plus size={24} />
          </div>
          <h3 className="text-xl font-serif font-bold text-slate-800 tracking-tight mb-2">
            No courses yet
          </h3>
          <p className="text-[11px] sm:text-xs text-slate-500 max-w-xs mx-auto leading-relaxed font-sans mb-6">
            Add your first course manually or use the AI Syllabus text extractor to populate your course inventory.
          </p>
          <div className="flex gap-3 justify-center">
            <button 
              onClick={() => setActiveForm('import')}
              className="px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all select-none active:scale-95"
            >
              AI Import
            </button>
            <button 
              onClick={() => setActiveForm('manual')}
              className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all select-none active:scale-95"
            >
              Add Manually
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-500">
          
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Enrolled Course Inventory ({courses.length})
            </h3>
            
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-bold font-mono text-slate-400 uppercase tracking-widest bg-slate-100/85 px-2.5 py-1 rounded-md">
                {courses.length} / {maxCourses} slots
              </span>
              <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/20">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-1000" 
                  style={{ width: `${(courses.length / maxCourses) * 100}%` }} 
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
            {courses.map(course => {
              const difficultyClass = DIFFICULTY_COLORS[course.difficulty as keyof typeof DIFFICULTY_COLORS] || DIFFICULTY_COLORS.Medium;
              
              return (
                <div 
                  key={course.id} 
                  className="bg-white border border-slate-100 hover:border-indigo-150 rounded-[2rem] p-6 hover:shadow-lg transition-all duration-300 relative overflow-hidden flex flex-col h-56 group/card hover:-translate-y-0.5 shadow-xs"
                >
                  {/* Subtle dynamic background circular visual rhythm */}
                  <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-500/[0.02] rounded-full pointer-events-none group-hover/card:bg-indigo-500/[0.04] transition-colors" />

                  {/* Top layout */}
                  <div className="flex justify-between items-start relative z-10">
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-xl">
                        {course.code}
                      </span>
                      <span className={`text-[10px] px-2.5 py-1 rounded-xl font-bold border tracking-wide uppercase ${difficultyClass}`}>
                        {course.difficulty}
                      </span>
                    </div>

                    <button 
                      onClick={() => removeCourse(course.id)}
                      className="p-1.5 bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                      title="Delete from inventory"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <h4 className="text-lg font-serif font-bold text-slate-800 leading-snug tracking-tight mt-4 line-clamp-2 hover:text-indigo-600 transition-colors relative z-10">
                    {course.title}
                  </h4>

                  {/* Description text */}
                  <p className="text-[11px] text-slate-400 font-sans mt-2 line-clamp-2 italic font-medium leading-relaxed relative z-10">
                    {course.description || "Synthesizing course architecture and behavioral syllabus patterns."}
                  </p>

                  {/* Footer metadata */}
                  <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono relative z-10">
                    <span className="flex items-center gap-1.5 text-indigo-600 font-sans">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      {course.units} Credits
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-600 font-sans">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Study Hub Connected
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
          userId={auth.currentUser?.uid || ''} 
          courses={courses} 
        />
      </section>

    </div>
  );
};

export default CourseManager;
