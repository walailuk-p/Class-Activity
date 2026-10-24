import React from 'react';
import { Sparkles } from 'lucide-react';

interface NavbarProps {
  currentView?: 'student' | 'teacher';
  onToggleView?: (view: 'student' | 'teacher') => void;
  onLogoClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView = 'student', onToggleView, onLogoClick }) => {
  return (
    <header className="sticky top-2 z-40 px-3 sm:px-6 max-w-7xl mx-auto w-full pt-2">
      <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/60 shadow-xs px-4 sm:px-6 py-2.5 flex items-center justify-between transition-all">
        {/* Brand Logo & Name */}
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={onLogoClick}
        >
          {/* Friendly Cute Rounded Icon Badge with Pastel Gradient */}
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-400 via-purple-400 to-pink-400 flex items-center justify-center text-white shadow-pastel-sm group-hover:rotate-6 transition-transform duration-300">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-['Fredoka',sans-serif] font-bold text-xl sm:text-2xl text-slate-900 tracking-tight leading-none">
                Class Activity
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              กิจกรรมในชั้นเรียน
            </p>
          </div>
        </div>

        {/* Soft Pill Toggle Switcher for Student / Teacher View */}
        <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50 text-xs">
          <button
            type="button"
            onClick={() => onToggleView?.('student')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              currentView === 'student'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            สำหรับนักศึกษา
          </button>
          <button
            type="button"
            onClick={() => onToggleView?.('teacher')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              currentView === 'teacher'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            สำหรับอาจารย์
          </button>
        </div>
      </div>
    </header>
  );
};
