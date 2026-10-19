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
    const hasCode = urlParams.has('code') || window.location.hash.includes('code=');
    const isTeacherRoute = window.location.hash === '#teacher' || urlParams.get('mode') === 'teacher';

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
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Prompt',system-ui,sans-serif]">
      <Navbar
        currentView={currentView}
        onViewChange={(view) => {
          setCurrentView(view);
          if (view === 'teacher') {
            window.location.hash = '#teacher';
          } else {
            window.location.hash = '';
          }
        }}
        user={user}
        authLoading={authLoading}
      />

      <main className="flex-1">
        {currentView === 'student' ? (
          <StudentPortal onNavigateToTeacher={() => setCurrentView('teacher')} />
        ) : (
          <TeacherPortal user={user} authLoading={authLoading} />
        )}
      </main>

      <footer className="py-6 border-t border-slate-200/80 bg-white text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} ClassWork • ระบบส่งงานในชั้นเรียน (ไม่ต้อง Log In e-mail และไม่ใช้ QR Code)</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Firebase Spark Plan (Free)</span>
            <span>•</span>
            <span>Google Drive via Apps Script</span>
            <span>•</span>
            <span>Netlify Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
