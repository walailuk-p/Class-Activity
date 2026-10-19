import React, { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase/config';
import { Navbar } from './components/Navbar';
import { StudentPortal } from './components/StudentPortal';
import { TeacherPortal } from './components/TeacherPortal';

export default function App() {
  const [currentView, setCurrentView] = useState<'student' | 'teacher'>('student');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Check URL parameters for direct student submission links or teacher shortcut
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const isTeacherRoute =
      window.location.hash === '#teacher' || urlParams.get('mode') === 'teacher';

    if (isTeacherRoute) {
      setCurrentView('teacher');
    } else {
      setCurrentView('student');
    }

    // Subscribe to Firebase Auth state
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFDF7] text-slate-700 flex flex-col font-['Mitr',system-ui,sans-serif] selection:bg-purple-200 selection:text-purple-900">
      {/* Cute & Minimal Header */}
      <Navbar
        onLogoClick={() => {
          setCurrentView('student');
          window.location.hash = '';
        }}
      />

      <main className="flex-1">
        {currentView === 'student' ? (
          <StudentPortal
            onNavigateToTeacher={() => {
              setCurrentView('teacher');
              window.location.hash = '#teacher';
            }}
          />
        ) : (
          <TeacherPortal
            user={user}
            authLoading={authLoading}
            onExitPortal={() => {
              setCurrentView('student');
              window.location.hash = '';
            }}
          />
        )}
      </main>

      {/* Cute & Minimal Footer */}
      <footer className="py-6 border-t border-purple-100 bg-[#FFFDF7] text-xs text-purple-700/60 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span>✨</span>
            <p>
              ClassWork • ระบบส่งงานในชั้นเรียน (Cute & Minimal Edition)
            </p>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-purple-400">
            <span>SPARK PLAN FREE</span>
            <span>•</span>
            <span>GOOGLE DRIVE GAS</span>
            <span>•</span>
            <button
              onClick={() => {
                const nextView = currentView === 'teacher' ? 'student' : 'teacher';
                setCurrentView(nextView);
                window.location.hash = nextView === 'teacher' ? '#teacher' : '';
              }}
              className="text-purple-400 hover:text-purple-700 underline underline-offset-4 cursor-pointer transition-colors"
            >
              {currentView === 'teacher' ? '← หน้าส่งงานนักศึกษา' : 'สำหรับคุณครู/อาจารย์'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
