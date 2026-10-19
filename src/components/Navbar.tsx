import React from 'react';
import { Sparkles } from 'lucide-react';

interface NavbarProps {
  onLogoClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onLogoClick }) => {
  return (
    <header className="sticky top-0 z-40 bg-[#FFFDF7]/90 backdrop-blur-md border-b border-purple-100/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name - Left Side Only */}
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={onLogoClick}
          >
            {/* Cute Rounded Mascot Icon */}
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-400 via-purple-300 to-pink-300 flex items-center justify-center text-white shadow-pillow-sm group-hover:rotate-6 transition-transform duration-300">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l2.4 5.3 5.8.8-4.2 4.1 1 5.8-5-2.6-5 2.6 1-5.8-4.2-4.1 5.8-.8z" />
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
                <span className="font-['Fredoka',sans-serif] font-bold text-2xl text-purple-950 tracking-tight leading-none">
                  ClassWork
                </span>
              </div>
              <p className="text-xs sm:text-sm text-purple-700/80 font-medium mt-0.5">
                ระบบส่งงานในชั้นเรียน
              </p>
            </div>
          </div>

          {/* Right side completely clean and empty as requested */}
          <div className="flex items-center" />
        </div>
      </div>
    </header>
  );
};
