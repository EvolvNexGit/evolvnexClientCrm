"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  ClipboardList,
  Dumbbell,
  FileText,
  Filter,
  History,
  MoreHorizontal,
  Paperclip,
  Plus,
  Save,
  Search,
  Stethoscope,
  UserCircle2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type ConsultMode = "queue" | "editor";
type ConsultStatus = "Waiting" | "In Progress" | "Completed";
type ConsultType = "New" | "Follow-up" | "Walk-in";
type QueueView = "All" | ConsultStatus;

const planTabs = ["Advice", "Medication", "Exercises", "Treatment Plan", "Others"] as const;
const historyFilters = ["All", "Consults", "Bills", "Reports", "Notes", "Docs"] as const;

const queueStats = [
  { label: "Today's Consults", value: "12", subtext: "Total scheduled", icon: CalendarClock, ring: "bg-violet-500/20 text-violet-300" },
  { label: "Waiting", value: "4", subtext: "Patients waiting", icon: Clock3, ring: "bg-amber-500/20 text-amber-300" },
  { label: "In Progress", value: "1", subtext: "Currently in consult", icon: Stethoscope, ring: "bg-emerald-500/20 text-emerald-300" },
  { label: "Completed Today", value: "7", subtext: "Consults completed", icon: Check, ring: "bg-sky-500/20 text-sky-300" },
  { label: "Walk-ins", value: "2", subtext: "Today", icon: UserCircle2, ring: "bg-slate-500/20 text-slate-300" },
] as const;

const queueRows = [
  { id: "1", initials: "JD", name: "John Doe", code: "PAT-0001", ageGender: "28 Y, Male", type: "New", reason: "Knee pain", time: "10:00 AM", status: "Waiting" },
  { id: "2", initials: "RS", name: "Rahul Sharma", code: "PAT-0002", ageGender: "35 Y, Male", type: "Follow-up", reason: "Lower back pain", time: "10:30 AM", status: "In Progress" },
  { id: "3", initials: "PP", name: "Priya Patel", code: "PAT-0003", ageGender: "30 Y, Female", type: "New", reason: "Shoulder stiffness", time: "11:00 AM", status: "Waiting" },
  { id: "4", initials: "AK", name: "Amit Kumar", code: "PAT-0004", ageGender: "45 Y, Male", type: "Follow-up", reason: "Post-op check", time: "11:30 AM", status: "Completed" },
  { id: "5", initials: "VS", name: "Vivek Singh", code: "PAT-0005", ageGender: "32 Y, Male", type: "Walk-in", reason: "Ankle sprain", time: "12:00 PM", status: "Waiting" },
  { id: "6", initials: "NM", name: "Neha Mehta", code: "PAT-0006", ageGender: "40 Y, Female", type: "Follow-up", reason: "Neck pain", time: "12:30 PM", status: "Completed" },
  { id: "7", initials: "RV", name: "Rohan Verma", code: "PAT-0007", ageGender: "27 Y, Male", type: "Walk-in", reason: "Wrist pain", time: "—", status: "Waiting" },
] as const;

const historyItems = [
  {
    filter: "Consults",
    date: "Today, 21 May 2025",
    time: "07:30 AM",
    title: "New Consult",
    status: "In Progress",
    statusTone: "text-violet-300",
    ringTone: "bg-violet-500",
    icon: Stethoscope,
  },
  {
    filter: "Consults",
    date: "15 May 2025",
    time: "10:15 AM",
    title: "Follow-up Consult",
    status: "Completed",
    statusTone: "text-emerald-300",
    ringTone: "bg-emerald-500",
    icon: CalendarClock,
  },
  {
    filter: "Bills",
    date: "15 May 2025",
    time: "10:45 AM",
    title: "Bill #INV-1023",
    status: "₹ 1,250.00",
    statusTone: "text-amber-300",
    ringTone: "bg-amber-500",
    icon: FileText,
  },
  {
    filter: "Docs",
    date: "10 May 2025",
    time: "09:50 AM",
    title: "X-Ray Report",
    status: "Document",
    statusTone: "text-sky-300",
    ringTone: "bg-blue-500",
    icon: FileText,
  },
  {
    filter: "Consults",
    date: "3 May 2025",
    time: "11:00 AM",
    title: "Therapy Session",
    status: "Completed",
    statusTone: "text-emerald-300",
    ringTone: "bg-green-500",
    icon: Dumbbell,
  },
] as const;

function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  ring,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: typeof CalendarClock;
  ring: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-text">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${ring}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: ConsultStatus }) {
  const styles: Record<ConsultStatus, string> = {
    Waiting: "bg-amber-500/15 text-amber-300 border-amber-500/20",
    "In Progress": "bg-violet-500/15 text-violet-300 border-violet-500/20",
    Completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  };

  return <span className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[status]}`}>{status}</span>;
}

function TypePill({ type }: { type: ConsultType }) {
  const styles: Record<ConsultType, string> = {
    New: "bg-violet-500/15 text-violet-300",
    "Follow-up": "bg-sky-500/15 text-sky-300",
    "Walk-in": "bg-emerald-500/15 text-emerald-300",
  };

  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles[type]}`}>{type}</span>;
}

function SectionLabel({
  number,
  title,
  icon: Icon,
}: {
  number: string;
  title: string;
  icon: typeof Stethoscope;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ff4b5c]/10 text-[#ff7582] ring-1 ring-[#ff4b5c]/20">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-medium text-text">
        {number}. {title}
      </p>
    </div>
  );
}

function Toolbar() {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-3 text-muted-foreground">
      <Button variant="ghost" className="h-8 px-3 text-xs">
        Normal
      </Button>
      <Button variant="ghost" className="h-8 w-8 p-0">
        B
      </Button>
      <Button variant="ghost" className="h-8 w-8 p-0 italic">
        I
      </Button>
      <Button variant="ghost" className="h-8 w-8 p-0 underline">
        U
      </Button>
      <Button variant="ghost" className="h-8 w-8 p-0">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EditorCard({
  number,
  title,
  placeholder,
}: {
  number: string;
  title: string;
  placeholder: string;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="p-4 pb-0">
        <SectionLabel number={number} title={title} icon={FileText} />
      </div>
      <Toolbar />
      <div className="p-4">
        <textarea
          rows={7}
          placeholder={placeholder}
          className="min-h-[180px] w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-text outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Enter structured clinical notes.</span>
          <span>0 / 4000</span>
        </div>
      </div>
    </section>
  );
}

export default function ConsultationTab({ clientId }: { clientId: string }) {
  const [mode, setMode] = useState<ConsultMode>("queue");
  const [queueView, setQueueView] = useState<QueueView>("All");
  const [activePlanTab, setActivePlanTab] = useState<(typeof planTabs)[number]>("Advice");
  const [activeFilter, setActiveFilter] = useState<(typeof historyFilters)[number]>("All");
  const [selectedPatient, setSelectedPatient] = useState<(typeof queueRows)[number]>(queueRows[0]);

  const visibleHistory = useMemo(() => {
    if (activeFilter === "All") {
      return historyItems;
    }

    return historyItems.filter((item) => item.filter === activeFilter);
  }, [activeFilter]);

  const queueRowsByView = useMemo(() => {
    if (queueView === "All") {
      return queueRows;
    }

    return queueRows.filter((row) => row.status === queueView);
  }, [queueView]);

  const queueTabCounts = useMemo(
    () => ({
      all: queueRows.length,
      inProgress: queueRows.filter((row) => row.status === "In Progress").length,
      completed: queueRows.filter((row) => row.status === "Completed").length,
    }),
    []
  );

  if (mode === "queue") {
    return (
      <div className="space-y-6">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-primary">Consultation Queue</p>
              <h2 className="mt-2 text-2xl font-semibold text-text">Manage today's consultations and patient queue.</h2>
              <p className="mt-1 text-sm text-muted-foreground">Select a patient and start the consult when you're ready.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" className="gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </Button>
              <Button className="gap-2 bg-[#6d28d9] text-white hover:bg-[#5b21b6]">
                <Plus className="h-4 w-4" />
                New Consult
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-5 lg:grid-cols-3 sm:grid-cols-2">
          {queueStats.map((item) => (
            <StatCard key={item.label} {...item} />
          ))}
        </div>

        <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-6 border-b border-border px-5 pt-4 text-sm font-medium">
            {[
              { key: "All", label: "Today's Queue", count: queueTabCounts.all },
              { key: "In Progress", label: "In Progress", count: queueTabCounts.inProgress },
              { key: "Completed", label: "Completed Today", count: queueTabCounts.completed },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setQueueView(tab.key as QueueView)}
                className={
                  queueView === tab.key
                    ? "border-b-2 border-primary pb-3 text-primary"
                    : "pb-3 text-muted-foreground hover:text-text"
                }
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <div className="overflow-x-auto p-4">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Age / Gender</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Appt. Time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {queueRowsByView.map((row, index) => (
                  <tr key={row.id} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-4 text-sm text-muted-foreground">{index + 1}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#6d28d9] text-sm font-semibold text-white">
                          {row.initials}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text">{row.name}</p>
                          <p className="text-xs text-muted-foreground">{row.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-text">{row.ageGender}</td>
                    <td className="px-4 py-4">
                      <TypePill type={row.type} />
                    </td>
                    <td className="px-4 py-4 text-sm text-text">{row.reason}</td>
                    <td className="px-4 py-4 text-sm text-text">{row.time}</td>
                    <td className="px-4 py-4">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-4">
                      <Button
                        className="bg-[#6d28d9] text-white hover:bg-[#5b21b6]"
                        onClick={() => {
                          setSelectedPatient(row);
                          setMode("editor");
                        }}
                      >
                        Start Consult
                      </Button>
                    </td>
                    <td className="px-4 py-4 text-right text-muted-foreground">
                      <MoreHorizontal className="inline h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-border px-5 py-4 text-sm text-muted-foreground">
            <p>
              Showing {queueRowsByView.length === 0 ? 0 : 1} to {queueRowsByView.length} of {queueRowsByView.length} patients
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="h-9 w-9 p-0">
                ‹
              </Button>
              <Button className="h-9 w-9 bg-[#6d28d9] p-0 text-white">1</Button>
              <Button variant="secondary" className="h-9 w-9 p-0">
                ›
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode("queue")}
              className="rounded-full border border-border p-2 text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">Consultation</p>
            <h2 className="mt-2 text-2xl font-semibold text-text">New Consult</h2>
            <p className="mt-1 text-sm text-muted-foreground">Client scope: {clientId}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" className="gap-2">
              <History className="h-4 w-4" />
              View History
            </Button>
            <Button variant="secondary" className="gap-2">
              <Save className="h-4 w-4" />
              Save as Draft
            </Button>
            <Button className="gap-2 bg-[#ff4b5c] text-white hover:bg-[#e83d4d]">
              <Check className="h-4 w-4" />
              Save & Complete
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                  {selectedPatient.initials}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-text">{selectedPatient.name}</h3>
                    <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                      {selectedPatient.ageGender}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedPatient.code}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-background px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Appointment</p>
                  <p className="mt-1 text-sm text-text">21 May 2025 · 07:30 AM</p>
                </div>
                <div className="rounded-2xl border border-border bg-background px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</p>
                  <p className="mt-1 text-sm text-emerald-500">In Progress</p>
                </div>
                <div className="rounded-2xl border border-border bg-background px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Visit Type</p>
                  <p className="mt-1 text-sm text-text">New Consult</p>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-6 2xl:grid-cols-2">
            <EditorCard
              number="1"
              title="Findings / Symptoms"
              placeholder="Enter patient complaints, symptoms and findings..."
            />
            <EditorCard
              number="2"
              title="Assessment"
              placeholder="Enter diagnosis, assessment or clinical notes..."
            />
          </div>

          <section className="rounded-3xl border border-border bg-card shadow-sm">
            <div className="p-4 pb-0">
              <SectionLabel number="3" title="Plan" icon={ClipboardList} />
            </div>

            <div className="flex flex-wrap gap-2 border-b border-border px-4 pb-4">
              {planTabs.map((tab) => {
                const active = activePlanTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActivePlanTab(tab)}
                    className={
                      active
                        ? "rounded-full bg-text px-4 py-2 text-sm font-medium text-background"
                        : "rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:text-text"
                    }
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            <Toolbar />

            <div className="p-4">
              <textarea
                rows={6}
                placeholder={`Enter ${activePlanTab.toLowerCase()} for patient...`}
                className="min-h-[160px] w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-text outline-none placeholder:text-muted-foreground"
              />
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>Use a concise, action-oriented treatment plan.</span>
                <span>0 / 4000</span>
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="p-0 pb-3">
                <SectionLabel number="4" title="Attachments" icon={Paperclip} />
              </div>
              <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="rounded-2xl border border-dashed border-border bg-background p-5 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <Paperclip className="h-5 w-5" />
                  </div>
                  <p className="text-sm text-text">Drag & drop files here</p>
                  <p className="mt-1 text-xs text-muted-foreground">or click to browse</p>
                  <p className="mt-4 text-[11px] uppercase tracking-wider text-muted-foreground">
                    JPG, PNG, PDF up to 10MB
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-background p-5">
                  <p className="text-sm font-medium text-text">Attached Files (0)</p>
                  <p className="mt-2 text-sm text-muted-foreground">No files attached yet</p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="p-0 pb-3">
                <SectionLabel number="5" title="Follow-up" icon={CalendarClock} />
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Duration</p>
                    <p className="mt-2 text-sm text-text">7 Days</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Follow-up Date</p>
                    <p className="mt-2 text-sm text-text">28 May 2025</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes (Optional)</p>
                  <textarea
                    rows={4}
                    placeholder="e.g. Review pain score and ROM..."
                    className="mt-2 w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm text-text outline-none placeholder:text-muted-foreground"
                  />
                  <div className="mt-2 text-right text-xs text-muted-foreground">0 / 300</div>
                </div>
              </div>
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="secondary" className="gap-2 border-[#ff4b5c]/30 text-[#cc3d4a] hover:bg-[#ff4b5c]/5">
              Cancel Consult
            </Button>
            <Button variant="secondary" className="gap-2">
              <Save className="h-4 w-4" />
              Save as Draft
            </Button>
            <Button className="gap-2 bg-[#ff4b5c] text-white hover:bg-[#e83d4d]">
              <Check className="h-4 w-4" />
              Save & Complete
            </Button>
          </div>
        </div>

        <aside className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-lg font-semibold text-text">Patient History</h3>
              <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">Recent activity timeline</p>
            </div>
            <button type="button" className="rounded-full border border-border p-2 text-muted-foreground xl:hidden">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-border py-4">
            <div className="mb-3 flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Search history"
                className="h-8 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted-foreground"
              />
              <button type="button" className="text-muted-foreground">
                <Filter className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {historyFilters.map((filter) => {
                const active = activeFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={
                      active
                        ? "rounded-full border border-[#ff4b5c] bg-[#ff4b5c]/10 px-3 py-1.5 text-xs font-medium text-[#cc3d4a]"
                        : "rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-text"
                    }
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 py-4">
            {visibleHistory.map((item) => {
              const Icon = item.icon;

              return (
                <div key={`${item.date}-${item.title}`} className="rounded-2xl border border-border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${item.ringTone} text-white`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{item.date}</p>
                          <h4 className="mt-1 text-sm font-semibold text-text">{item.title}</h4>
                          <p className={`mt-1 text-xs font-medium ${item.statusTone}`}>{item.status}</p>
                        </div>
                        <p className="shrink-0 text-xs text-muted-foreground">{item.time}</p>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>

          <Button variant="secondary" className="w-full gap-2">
            View Full History
            <ChevronRight className="h-4 w-4" />
          </Button>
        </aside>
      </div>
    </div>
  );
}