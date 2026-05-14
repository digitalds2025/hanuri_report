import type { ReactNode } from "react";

export function ReportViewer({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">{children}</div>;
}

export function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
      <div className="text-sm text-slate-700">{children}</div>
    </section>
  );
}
