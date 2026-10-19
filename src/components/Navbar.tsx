import React from 'react';
import { User } from 'firebase/auth';
import { BookOpen, GraduationCap, LogIn, LogOut, ShieldCheck, Sparkles, UserCheck } from 'lucide-react';
import { loginWithGoogle, logout } from '../firebase/config';

interface NavbarProps {
  currentView: 'student' | 'teacher';
  onViewChange: (view: 'student' | 'teacher') => void;
  user: User | null;
  authLoading: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onViewChange,
  user,
  authLoading,
}) => {
  const [signingIn, setSigningIn] = React.useState(false);

  const handleSignIn = async () => {
    try {
      setSigningIn(true);
      await loginWithGoogle();
      onViewChange('teacher');
    } catch (err: any) {
      console.error(err);
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      onViewChange('student');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onViewChange('student')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-slate-900 tracking-tight">ClassWork</span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                  <ShieldCheck className="w-3 h-3" />
                  ไม่ต้อง Log In นักศึกษา
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">ระบบส่งงานในชั้นเรียน • Spark Plan Free</p>
            </div>
          </div>

          {/* Navigation Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              onClick={() => onViewChange('student')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                currentView === 'student'
                  ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>ส่งงานนักศึกษา</span>
            </button>
            <button
              onClick={() => onViewChange('teacher')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                currentView === 'teacher'
                  ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>ระบบอาจารย์</span>
            </button>
          </div>

          {/* Teacher Auth / Profile */}
          <div className="flex items-center gap-2">
            {authLoading ? (
              <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="hidden md:flex flex-col text-right">
                  <span className="text-xs font-semibold text-slate-800 truncate max-w-[140px]">
                    {user.displayName || 'อาจารย์ผู้สอน'}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate max-w-[140px]">
                    {user.email}
                  </span>
                </div>
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-8 h-8 rounded-full border border-indigo-200 object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                    {(user.displayName || user.email || 'A').charAt(0).toUpperCase()}
                  </div>
                )}
                <button
                  onClick={handleSignOut}
                  title="ออกจากระบบ"
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={signingIn}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-xs active:scale-98 disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>{signingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบอาจารย์'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
