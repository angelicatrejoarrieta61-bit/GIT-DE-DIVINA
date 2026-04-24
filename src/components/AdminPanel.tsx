import React from 'react';
import { Settings, Users, MonitorSmartphone, Database, Activity, FileText } from 'lucide-react';

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a] text-white overflow-hidden flex flex-col font-sans">
      <div className="flex h-full">
        {/* Sidebar */}
        <aside className="w-64 border-r border-[rgba(255,255,255,0.08)] p-6 flex flex-col gap-8 bg-[#111]">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[#f5f5f5]">Admin Base</h2>
            <p className="text-xs text-[#a3a3a3] mt-1 uppercase tracking-widest">System Control</p>
          </div>
          <nav className="flex-1 flex flex-col gap-2">
            <NavItem icon={<Activity />} label="Dashboard" active />
            <NavItem icon={<Users />} label="Users" />
            <NavItem icon={<FileText />} label="Content" />
            <NavItem icon={<Database />} label="Database" />
            <NavItem icon={<MonitorSmartphone />} label="Settings" />
          </nav>
          <div className="mt-auto">
            <button 
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] rounded-md text-sm transition-colors"
            >
              Close Panel (F7)
            </button>
          </div>
        </aside>

        {/* Main Admin Area */}
        <main className="flex-1 overflow-y-auto p-12 bg-[#0a0a0a]">
          <header className="flex items-center justify-between mb-12">
            <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-[#a3a3a3]">Status: <span className="text-green-500">Online</span></span>
              <div className="h-8 w-8 rounded-full bg-white text-black flex items-center justify-center font-bold text-sm">
                A
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <MetricCard title="Total Visitors" value="12,405" trend="+14%" />
            <MetricCard title="Active Sessions" value="842" trend="+5%" />
            <MetricCard title="System Load" value="24%" trend="-2%" />
          </div>

          <div className="border border-[rgba(255,255,255,0.08)] rounded-xl p-8 bg-[#111]">
            <h3 className="text-lg font-medium mb-6">Recent Activity</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-[rgba(255,255,255,0.05)]">
                <span className="text-[#a3a3a3]">System Update</span>
                <span className="text-sm">2 mins ago</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-[rgba(255,255,255,0.05)]">
                <span className="text-[#a3a3a3]">New Admin User Added</span>
                <span className="text-sm">1 hour ago</span>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-[#a3a3a3]">Database Backup Completed</span>
                <span className="text-sm">4 hours ago</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <a href="#" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${active ? 'bg-white text-black font-medium' : 'text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.05)]'}`}>
      <span className="w-5 h-5">{icon}</span>
      {label}
    </a>
  );
}

function MetricCard({ title, value, trend }: { title: string, value: string, trend: string }) {
  const isPositive = trend.startsWith('+');
  return (
    <div className="border border-[rgba(255,255,255,0.08)] rounded-xl p-6 bg-[#111]">
      <h4 className="text-sm text-[#a3a3a3] mb-2">{title}</h4>
      <div className="flex items-end justify-between">
        <span className="text-3xl font-semibold">{value}</span>
        <span className={`text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>{trend}</span>
      </div>
    </div>
  );
}
