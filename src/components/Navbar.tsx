import React from 'react';
import { Sparkles, Heart } from 'lucide-react';

interface NavbarProps {
  onLogoClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onLogoClick }) => {
  return (
    <header className="sticky top-0 z-40 bg-[#FFFDF7]/90 backdrop-blur-md border-b border-purple-100/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name - Left Side Only (Cute & Minimal) */}
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={onLogoClick}
          >
            {/* Cute Rounded Mascot Icon */}
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-400 via-purple-300 to-pink-300 flex items-center justify-center text-white shadow-pillow-sm group-hover:rotate-6 transition-transform duration-300">
                {/* Cute Smiling Star Icon */}
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l2.4 5.3 5.8.8-4.2 4.1 1 5.8-5-2.6-5 2.6 1-5.8-4.2-4.1 5.8-.8z" />
                  {/* Two cute eyes and a smile in white/dark */}
                  <circle cx="10" cy="10" r="1" fill="#6B21A8" />
                  <circle cx="14" cy="10" r="1" fill="#6B21A8" />
                  <path d="M10.5 13.2a2 2 0 0 0 3 0" stroke="#6B21A8" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                </svg>
              </div>
              <div className="absolute -top-1 -right-1 text-pink-400 animate-bounce">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-['Fredoka',sans-serif] font-bold text-xl sm:text-2xl text-purple-900 tracking-tight">
                  ClassWork
                </span>
                {/* Cute Pastel Sky Blue Badge */}
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-sky-100 text-sky-700 px-3 py-0.5 rounded-full border border-sky-200/80 shadow-2xs">
                  <Heart className="w-3 h-3 text-sky-500 fill-sky-400" />
                  <span>ไม่ต้อง Log In นักศึกษา</span>
                </span>
              </div>
              <p className="text-xs text-purple-600/70 font-medium">
                ระบบส่งงานในชั้นเรียน
              </p>
            </div>
          </div>

          {/* Right side has NO center menu and NO teacher login button as requested */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-purple-500/80 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-100">
              ✨ ใช้งานง่ายใน 3 ขั้นตอน
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
