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

  // Always reset to Student Portal (Step 1: Assignment Code) on default load
  useEffect(() => {
    // Clear any persistent storage to ensure fresh student entry every time
    try {
      sessionStorage.removeItem('classwork_view');
      sessionStorage.removeItem('classwork_state');
      sessionStorage.removeItem('classwork_step');
    } catch {
      // ignore
    }

    const urlParams = new URLSearchParams(window.location.search);
    const isExplicitTeacherRoute =
      window.location.hash === '#teacher' || urlParams.get('mode') === 'teacher';

    if (isExplicitTeacherRoute) {
      setCurrentView('teacher');
    } else {
      setCurrentView('student');
      // If there's an unnecessary hash, reset to clean path
      if (window.location.hash === '#teacher') {
        window.location.hash = '';
      }
    }

    // Subscribe to Firebase Auth state
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFDF7] text-slate-800 flex flex-col font-['Itim','Mitr',system-ui,sans-serif] selection:bg-purple-200 selection:text-purple-900 text-[16px] leading-relaxed">
      {/* Clean Header */}
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

      {/* Clean Minimal Footer */}
      <footer className="py-6 border-t border-purple-100 bg-[#FFFDF7] text-sm text-purple-800/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <p className="font-medium text-slate-700">
            ClassWork • ระบบส่งงานในชั้นเรียน
          </p>

          <div>
            <button
              onClick={() => {
                const nextView = currentView === 'teacher' ? 'student' : 'teacher';
                setCurrentView(nextView);
                window.location.hash = nextView === 'teacher' ? '#teacher' : '';
              }}
              className="text-purple-600 hover:text-purple-900 font-medium underline underline-offset-4 cursor-pointer transition-colors text-sm"
            >
              {currentView === 'teacher' ? '← หน้าส่งงานนักศึกษา' : 'สำหรับคุณครู/อาจารย์'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
