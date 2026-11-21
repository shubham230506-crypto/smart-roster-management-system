'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Users,
  Building2,
  Layers,
  UserCheck,
  RefreshCw,
  Plus,
  ShieldAlert,
  Sparkles,
  Download,
} from 'lucide-react';

type ViewMode = 'COMPANY' | 'POD' | 'BRAND' | 'PROCESS' | 'EMPLOYEE';

interface Process {
  id: string;
  name: string;
  code: string;
}

interface Pod {
  id: string;
  name: string;
  lead?: { id: string; name: string; employeeCode: string } | null;
}

interface Allocation {
  id: string;
  employeeId: string;
  brandId: string;
  processId: string;
  isPrimary: boolean;
  allocationPct: number;
  brand?: { id: string; name: string };
  process?: Process;
  employee?: { id: string; name: string; employeeCode: string };
}

interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  role: string;
  podId: string;
  preferredWeeklyOff: number;
  pod: Pod;
  allocations: Allocation[];
}

interface BrandProcess {
  id: string;
  brandId: string;
  processId: string;
  operatingRule: string;
  minDailyStaff: number;
  process: Process;
}

interface Brand {
  id: string;
  name: string;
  podId: string;
  pod: Pod;
  brandProcesses: BrandProcess[];
  allocations: Allocation[];
}

interface RosterEntry {
  id: string;
  date: string;
  employeeId: string;
  status: string;
  brandId: string | null;
  processId: string | null;
  isManualEdit: boolean;
  brand?: { name: string } | null;
  process?: Process | null;
}

interface RosterConflict {
  id: string;
  date: string;
  severity: string;
  type: string;
  brandId: string | null;
  processId: string | null;
  employeeId: string | null;
  message: string;
  suggestion: string | null;
}

interface DashboardData {
  pods: Pod[];
  employees: Employee[];
  brands: Brand[];
  processes: Process[];
  holidays: { id: string; date: string; name: string }[];
  leaves: { id: string; date: string; type: string; reason: string; employee: Employee }[];
  roster: {
    id: string;
    month: number;
    year: number;
    status: string;
    entries: RosterEntry[];
    conflicts: RosterConflict[];
  } | null;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  WORKING: { label: 'W', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  WEEKLY_OFF: { label: 'WO', cls: 'bg-slate-200 text-slate-700 border-slate-300' },
  PUBLIC_HOLIDAY: { label: 'PH', cls: 'bg-purple-100 text-purple-800 border-purple-300' },
  PLANNED_LEAVE: { label: 'LV', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  COMP_OFF: { label: 'CO', cls: 'bg-sky-100 text-sky-800 border-sky-300' },
};

const RULE_LABELS: Record<string, string> = {
  ALL_365_DAYS: '365 Days (All Sun & Holidays)',
  ALL_DAYS_EXCEPT_HOLIDAYS: 'Daily (Public Holidays Off)',
  NO_SUNDAYS_NO_HOLIDAYS: 'Mon–Sat (Sun & Holidays Off)',
};

export default function SmartRosterDashboard() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(12);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // 5 Required Views
  const [viewMode, setViewMode] = useState<ViewMode>('COMPANY');
  const [selectedPodId, setSelectedPodId] = useState<string>('');
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [selectedProcessId, setSelectedProcessId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  // Modals for Mid-Month Leave Change & Adding Brand
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveEmpId, setLeaveEmpId] = useState('');
  const [leaveDate, setLeaveDate] = useState('2026-12-18');
  const [leaveType, setLeaveType] = useState('PLANNED_LEAVE');
  const [leaveReason, setLeaveReason] = useState('Sudden personal leave');

  const [showBrandModal, setShowBrandModal] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandPodId, setNewBrandPodId] = useState('');
  const [newBrandRule, setNewBrandRule] = useState('ALL_DAYS_EXCEPT_HOLIDAYS');
  const [newBrandEmpId, setNewBrandEmpId] = useState('');
  const [newBrandProcs, setNewBrandProcs] = useState<string[]>([]);

  const fetchRosterData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/roster?year=${year}&month=${month}`);
    const json: DashboardData = await res.json();
    setData(json);

    if (json.pods.length && !selectedPodId) setSelectedPodId(json.pods[0].id);
    if (json.brands.length && !selectedBrandId) setSelectedBrandId(json.brands[0].id);
    if (json.processes.length && !selectedProcessId) setSelectedProcessId(json.processes[0].id);
    if (json.employees.length && !selectedEmployeeId) setSelectedEmployeeId(json.employees[0].id);
    if (json.employees.length && !leaveEmpId) setLeaveEmpId(json.employees[1].id);
    if (json.pods.length && !newBrandPodId) setNewBrandPodId(json.pods[0].id);
    if (json.processes.length && newBrandProcs.length === 0) {
      setNewBrandProcs([json.processes[0].id]);
    }
    setLoading(false);
  }, [year, month, selectedPodId, selectedBrandId, selectedProcessId, selectedEmployeeId, leaveEmpId, newBrandPodId, newBrandProcs.length]);

  useEffect(() => {
    fetchRosterData();
  }, [fetchRosterData]);

  // Auto-generate roster on first visit if none exists yet
  useEffect(() => {
    if (!loading && data && !data.roster && !generating) {
      handleGenerateRoster();
    }
  }, [loading, data]);

  async function handleGenerateRoster() {
    setGenerating(true);
    await fetch('/api/roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    });
    await fetchRosterData();
    setGenerating(false);
  }

  // Cycle cell status on click & trigger live validation
  async function handleCycleCell(entry: RosterEntry) {
    const order = ['WORKING', 'WEEKLY_OFF', 'PLANNED_LEAVE', 'COMP_OFF'];
    const nextStatus = order[(order.indexOf(entry.status) + 1) % order.length];

    const emp = data?.employees.find((e) => e.id === entry.employeeId);
    const primaryAlloc = emp?.allocations.find((a) => a.isPrimary) || emp?.allocations[0];

    await fetch('/api/roster/entry', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryId: entry.id,
        status: nextStatus,
        brandId: primaryAlloc?.brandId ?? null,
        processId: primaryAlloc?.processId ?? null,
      }),
    });
    await fetchRosterData();
  }

  // Submit mid-month leave / availability change
  async function handleAddLeave(e: React.FormEvent) {
    e.preventDefault();
    await fetch('/api/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: leaveEmpId,
        date: leaveDate,
        type: leaveType,
        reason: leaveReason,
      }),
    });
    setShowLeaveModal(false);
    await fetchRosterData();
  }

  // Submit new Brand + Rules + Employee assignment
  async function handleCreateBrand(e: React.FormEvent) {
    e.preventDefault();
    if (!newBrandName.trim() || newBrandProcs.length === 0) return;

    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ADD_BRAND',
        name: newBrandName.trim(),
        podId: newBrandPodId,
        processIds: newBrandProcs,
        operatingRule: newBrandRule,
        minDailyStaff: 1,
        employeeId: newBrandEmpId || null,
      }),
    });
    setNewBrandName('');
    setShowBrandModal(false);
    await fetchRosterData();
  }

  // Export CSV bonus feature
  function handleExportCSV() {
    if (!data?.roster) return;
    const daysCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const dayCols = Array.from({ length: daysCount }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);

    const rows = [
      ['Code', 'Employee', 'Pod', 'Brands', ...dayCols].join(','),
      ...data.employees.map((emp) => {
        const brandList = Array.from(new Set(emp.allocations.map((a) => a.brand?.name))).join(' | ');
        const statuses = dayCols.map((iso) => {
          const entry = data.roster?.entries.find(
            (e) => e.employeeId === emp.id && e.date.startsWith(iso)
          );
          return entry?.status || '';
        });
        return [emp.employeeCode, `"${emp.name}"`, `"${emp.pod.name}"`, `"${brandList}"`, ...statuses].join(',');
      }),
    ];

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Smart_Roster_${year}_${String(month).padStart(2, '0')}.csv`;
    a.click();
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-700 font-medium">
        Loading Smart Roster Engine...
      </div>
    );
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dateHeaders = Array.from({ length: daysInMonth }, (_, idx) => {
    const d = new Date(Date.UTC(year, month - 1, idx + 1));
    return {
      dayNum: idx + 1,
      iso: d.toISOString().split('T')[0],
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()],
      isSunday: d.getUTCDay() === 0,
      isHoliday: data?.holidays.some((h) => h.date.startsWith(d.toISOString().split('T')[0])) ?? false,
    };
  });

  const criticalConflicts = data?.roster?.conflicts.filter((c) => c.severity === 'CRITICAL') || [];
  const warningConflicts = data?.roster?.conflicts.filter((c) => c.severity === 'WARNING') || [];

  // Filter employees based on active Stakeholder View
  const filteredEmployees = (data?.employees || []).filter((emp) => {
    if (viewMode === 'POD') return emp.podId === selectedPodId;
    if (viewMode === 'BRAND') return emp.allocations.some((a) => a.brandId === selectedBrandId);
    if (viewMode === 'PROCESS') return emp.allocations.some((a) => a.processId === selectedProcessId);
    if (viewMode === 'EMPLOYEE') return emp.id === selectedEmployeeId;
    return true;
  });

  const activeBrand = data?.brands.find((b) => b.id === selectedBrandId);
  const activePod = data?.pods.find((p) => p.id === selectedPodId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-4 shadow-md">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-bold tracking-tight">
                DataStraw Smart Roster Management System
              </h1>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Constraint-Aware Multi-Brand, Multi-Process & Pod Operations Scheduler
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {[
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December',
              ].map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>

            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>

            <button
              onClick={handleGenerateRoster}
              disabled={generating}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Generating...' : 'Generate Roster'}
            </button>

            <button
              onClick={() => setShowLeaveModal(true)}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white font-medium px-3.5 py-2 rounded-lg text-sm transition cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              Simulate Leave / Comp-Off
            </button>

            <button
              onClick={() => setShowBrandModal(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3.5 py-2 rounded-lg text-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Brand / Rule
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white font-medium px-3 py-2 rounded-lg text-sm transition cursor-pointer"
              title="Export Monthly Roster CSV"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase">Active Team</p>
              <p className="text-2xl font-bold mt-1">{data?.employees.length || 0} Staff</p>
              <p className="text-xs text-slate-500 mt-0.5">{data?.pods.length || 0} Operational Pods</p>
            </div>
            <Users className="w-9 h-9 text-indigo-500 bg-indigo-50 p-2 rounded-lg" />
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase">Client Brands</p>
              <p className="text-2xl font-bold mt-1">{data?.brands.length || 0} Brands</p>
              <p className="text-xs text-slate-500 mt-0.5">80% Single-Owner • 20% Multi-Staff</p>
            </div>
            <Building2 className="w-9 h-9 text-emerald-600 bg-emerald-50 p-2 rounded-lg" />
          </div>

          <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-rose-600 uppercase">Critical Coverage Gaps</p>
              <p className="text-2xl font-bold text-rose-700 mt-1">{criticalConflicts.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Hard constraint violations</p>
            </div>
            <ShieldAlert className="w-9 h-9 text-rose-600 bg-rose-50 p-2 rounded-lg" />
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-600 uppercase">Preference Overrides</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{warningConflicts.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Soft weekly-off overrides</p>
            </div>
            <AlertTriangle className="w-9 h-9 text-amber-600 bg-amber-50 p-2 rounded-lg" />
          </div>
        </div>

        {/* 5 Stakeholder View Switcher + Sub-Filters */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'COMPANY', label: 'Company-Wide', icon: Users },
                { id: 'POD', label: 'Pod-Wise', icon: Layers },
                { id: 'BRAND', label: 'Brand-Wise', icon: Building2 },
                { id: 'PROCESS', label: 'Process-Wise', icon: CheckCircle2 },
                { id: 'EMPLOYEE', label: 'Employee-Wise', icon: UserCheck },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = viewMode === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setViewMode(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Contextual Sub-Selector */}
          <div className="flex items-center gap-3">
            {viewMode === 'POD' && (
              <select
                value={selectedPodId}
                onChange={(e) => setSelectedPodId(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white font-medium"
              >
                {data?.pods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Lead: {p.lead?.name || 'Unassigned'})
                  </option>
                ))}
              </select>
            )}

            {viewMode === 'BRAND' && (
              <select
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white font-medium"
              >
                {data?.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({new Set(b.allocations.map((a) => a.employeeId)).size === 1 ? 'Single-Resource' : 'Multi-Resource'})
                  </option>
                ))}
              </select>
            )}

            {viewMode === 'PROCESS' && (
              <select
                value={selectedProcessId}
                onChange={(e) => setSelectedProcessId(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white font-medium"
              >
                {data?.processes.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name} ({pr.code})
                  </option>
                ))}
              </select>
            )}

            {viewMode === 'EMPLOYEE' && (
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white font-medium"
              >
                {data?.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employeeCode} — {emp.name} ({emp.pod.name})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Brand-Wise Operational Rules & Coverage Strip */}
        {viewMode === 'BRAND' && activeBrand && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-indigo-950 text-base">
                {activeBrand.name} — {activeBrand.pod.name}
              </h2>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {activeBrand.brandProcesses.map((bp) => (
                  <span
                    key={bp.id}
                    className="text-xs bg-white border border-indigo-200 text-indigo-900 px-2.5 py-1 rounded-md font-medium"
                  >
                    {bp.process.code}: {RULE_LABELS[bp.operatingRule]} • Min {bp.minDailyStaff} staff/day
                  </span>
                ))}
              </div>
            </div>
            <div className="text-xs text-indigo-900 font-medium">
              Staffing Type:{' '}
              <span className="font-bold">
                {new Set(activeBrand.allocations.map((a) => a.employeeId)).size === 1
                  ? 'Single Dedicated Resource (100%)'
                  : `Multi-Employee Team (${new Set(activeBrand.allocations.map((a) => a.employeeId)).size} Staff)`}
              </span>
            </div>
          </div>
        )}

        {/* Pod-Wise Lead Banner */}
        {viewMode === 'POD' && activePod && (
          <div className="bg-slate-100 border border-slate-300 rounded-xl p-3.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">
              {activePod.name} • Pod Lead: {activePod.lead?.name || 'N/A'} ({activePod.lead?.employeeCode})
            </span>
            <span className="text-xs text-slate-600">
              Showing {filteredEmployees.length} pod members
            </span>
          </div>
        )}

        {/* Legend + Interactive Hint */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 px-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-800">Legend:</span>
            <span className="px-2 py-0.5 rounded border bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold">W = Working</span>
            <span className="px-2 py-0.5 rounded border bg-slate-200 text-slate-700 border-slate-300 font-semibold">WO = Weekly Off</span>
            <span className="px-2 py-0.5 rounded border bg-purple-100 text-purple-800 border-purple-300 font-semibold">PH = Public Holiday</span>
            <span className="px-2 py-0.5 rounded border bg-amber-100 text-amber-800 border-amber-300 font-semibold">LV = Planned Leave</span>
            <span className="px-2 py-0.5 rounded border bg-sky-100 text-sky-800 border-sky-300 font-semibold">CO = Comp-Off</span>
          </div>
          <span className="text-indigo-700 font-medium">
            Tip: Click any schedule cell below to manually override status & live-validate coverage!
          </span>
        </div>

        {/* Main Monthly Roster Matrix */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-slate-100 text-left px-3 py-2.5 font-bold text-slate-800 min-w-[210px] border-r border-slate-200">
                  Employee / Brand & Process
                </th>
                {dateHeaders.map((d) => (
                  <th
                    key={d.iso}
                    className={`px-1.5 py-2 text-center min-w-[36px] border-r border-slate-200 ${
                      d.isHoliday
                        ? 'bg-purple-100 text-purple-900'
                        : d.isSunday
                        ? 'bg-slate-200/70 text-slate-700'
                        : 'text-slate-700'
                    }`}
                  >
                    <div className="font-bold">{d.dayNum}</div>
                    <div className="text-[10px] font-normal">{d.weekday}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => {
                const uniqueBrands = Array.from(
                  new Set(emp.allocations.map((a) => `${a.brand?.name} (${a.process?.code})`))
                ).join(', ');

                return (
                  <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-slate-200">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <span>{emp.name}</span>
                        {emp.role === 'POD_LEAD' && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded font-bold">
                            LEAD
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[200px]" title={uniqueBrands}>
                        {emp.pod.name} • {uniqueBrands || 'Floater'}
                      </div>
                    </td>

                    {dateHeaders.map((d) => {
                      const entry = data?.roster?.entries.find(
                        (e) => e.employeeId === emp.id && e.date.startsWith(d.iso)
                      );
                      const badge = entry ? STATUS_BADGE[entry.status] : null;
                      const hasCriticalOnDay = criticalConflicts.some(
                        (c) => c.date.startsWith(d.iso) && c.employeeId === emp.id
                      );

                      return (
                        <td
                          key={d.iso}
                          className={`p-1 text-center border-r border-slate-100 ${
                            d.isSunday ? 'bg-slate-50' : ''
                          }`}
                        >
                          {entry && badge ? (
                            <button
                              onClick={() => handleCycleCell(entry)}
                              title={`${emp.name} on ${d.iso}: ${entry.status} (Click to toggle)`}
                              className={`w-7 h-7 rounded border text-[11px] font-bold transition hover:scale-105 cursor-pointer ${
                                badge.cls
                              } ${hasCriticalOnDay ? 'ring-2 ring-rose-600' : ''}`}
                            >
                              {badge.label}
                            </button>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Conflict Detection & Backup Recommendation Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Critical Conflicts */}
          <div className="bg-white rounded-xl border border-rose-200 shadow-sm p-5">
            <h3 className="font-bold text-rose-800 flex items-center gap-2 text-base mb-3">
              <ShieldAlert className="w-5 h-5" />
              Critical Coverage Gaps ({criticalConflicts.length})
            </h3>
            {criticalConflicts.length === 0 ? (
              <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                All mandatory brand and process coverage constraints are satisfied!
              </p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {criticalConflicts.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm"
                  >
                    <div className="font-semibold text-rose-900">{c.message}</div>
                    {c.suggestion && (
                      <div className="text-xs text-rose-700 mt-1 font-medium">
                        {c.suggestion}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Soft Warnings */}
          <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-5">
            <h3 className="font-bold text-amber-800 flex items-center gap-2 text-base mb-3">
              <AlertTriangle className="w-5 h-5" />
              Soft Constraint Overrides ({warningConflicts.length})
            </h3>
            {warningConflicts.length === 0 ? (
              <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                No employee weekly-off preferences were overridden.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {warningConflicts.slice(0, 25).map((w) => (
                  <div
                    key={w.id}
                    className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs"
                  >
                    <div className="font-semibold text-amber-900">{w.message}</div>
                    {w.suggestion && (
                      <div className="text-amber-700 mt-0.5">{w.suggestion}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal 1: Simulate Mid-Month Leave / Comp-Off */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleAddLeave}
            className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-lg font-bold text-slate-900">
              Simulate Mid-Month Leave / Availability Change
            </h3>
            <p className="text-xs text-slate-500">
              Apply a planned leave or comp-off to an employee and watch the system immediately re-evaluate brand coverage.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Employee</label>
              <select
                value={leaveEmpId}
                onChange={(e) => setLeaveEmpId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                {data?.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employeeCode} — {emp.name} ({emp.allocations[0]?.brand?.name || 'Floater'})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Leave Type</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="PLANNED_LEAVE">Planned Leave</option>
                  <option value="COMP_OFF">Approved Comp-Off</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
              <input
                type="text"
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-500 cursor-pointer"
              >
                Apply & Re-Validate
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 2: Add Brand & Operating Rule Dynamically */}
      {showBrandModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateBrand}
            className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-lg font-bold text-slate-900">
              Add New Client Brand & Working Rules
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Brand Name</label>
              <input
                type="text"
                placeholder="e.g., NovaSkincare India"
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Pod</label>
                <select
                  value={newBrandPodId}
                  onChange={(e) => setNewBrandPodId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  {data?.pods.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Operating Calendar</label>
                <select
                  value={newBrandRule}
                  onChange={(e) => setNewBrandRule(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="ALL_365_DAYS">365 Days (All Sun & Hol)</option>
                  <option value="ALL_DAYS_EXCEPT_HOLIDAYS">Daily (Holidays Off)</option>
                  <option value="NO_SUNDAYS_NO_HOLIDAYS">Mon–Sat (Sun & Hol Off)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Required Processes</label>
              <div className="flex flex-wrap gap-2">
                {data?.processes.map((pr) => {
                  const checked = newBrandProcs.includes(pr.id);
                  return (
                    <button
                      type="button"
                      key={pr.id}
                      onClick={() =>
                        setNewBrandProcs((prev) =>
                          checked ? prev.filter((id) => id !== pr.id) : [...prev, pr.id]
                        )
                      }
                      className={`px-3 py-1 rounded-md text-xs font-medium border cursor-pointer ${
                        checked
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-700 border-slate-300'
                      }`}
                    >
                      {pr.code}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assign Primary Employee</label>
              <select
                value={newBrandEmpId}
                onChange={(e) => setNewBrandEmpId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">-- Leave Unassigned (Triggers Coverage Alert) --</option>
                {data?.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employeeCode} — {emp.name} ({emp.pod.name})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBrandModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 cursor-pointer"
              >
                Save Brand & Rules
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}