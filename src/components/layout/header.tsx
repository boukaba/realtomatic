'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Bell, Plus } from 'lucide-react';

interface HeaderProps {
  title: string;
}

const notifications = [
  { id: 1, title: 'Agent "Lease Analyzer" completed', time: '2 min ago' },
  { id: 2, title: 'New approval request from Agent', time: '15 min ago' },
  { id: 3, title: 'Market report ready for review', time: '1 hr ago' },
];

export default function Header({ title }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900 px-6">
      <h1 className="text-xl font-semibold text-white">{title}</h1>

      <div className="flex items-center gap-4">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-64 rounded-lg border border-slate-700 bg-slate-900 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-500" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
              <div className="border-b border-slate-700 px-4 py-3">
                <p className="text-sm font-semibold text-white">Notifications</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="border-b border-slate-800 px-4 py-3 last:border-0 hover:bg-slate-800"
                  >
                    <p className="text-sm text-white">{n.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{n.time}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          Deploy Agent
        </button>

        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
          MB
        </div>
      </div>
    </header>
  );
}
