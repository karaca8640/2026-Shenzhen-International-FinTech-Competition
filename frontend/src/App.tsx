import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, ChevronRight, Clock3, FileText, FolderOpen, LayoutDashboard, LockKeyhole, Menu, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Button, Spinner } from "./components/ui";
import { useToast } from "./components/Toaster";
import { api } from "./refundpath/api";
import CaseForm, { Modal } from "./refundpath/CaseForm";
import CaseWorkspace from "./refundpath/CaseWorkspace";
import { amount, dateLabel } from "./refundpath/format";
import { Status, type Action } from "./refundpath/shared";
import type { Case, Details, Registry } from "./refundpath/types";

function Brand() {
  return <Link className="brand" to="/" aria-label="RefundPath home"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="M10 23V10h7.5a4.5 4.5 0 0 1 0 9H10m8-1 5 5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/><circle cx="10" cy="23" r="2.2" fill="#b7ddcd"/></svg><span>RefundPath<span className="brand-dot">.</span></span></Link>;
}

function CaseList({cases, busy, onDelete}: {cases: Case[]; busy: boolean; onDelete: (c: Case) => void}) {
  return <div className="case-list"><div className="case-list-labels"><span>Case / provider</span><span>Status</span><span>Refund estimate</span><span>Provider deadline</span><span/></div>{cases.map(c => <div className="case-list-row" key={c.id}><Link to={`/cases/${c.id}`} className="case-provider"><div className="provider-monogram">{c.details.provider_name.charAt(0)}</div><div><strong>{c.details.provider_name}</strong><small>{c.reference} · {c.details.student_name}</small></div></Link><Status value={c.display_status}/><div className="case-money"><strong>{amount(c.analysis?.estimate)}</strong><small>AUD · provisional</small></div><div className="case-date"><strong>{dateLabel(c.analysis?.deadline?.date)}</strong><small>{c.remaining_days == null ? "Trigger needs verification" : c.remaining_days < 0 ? "Past provisional date" : `${c.remaining_days} days remaining`}</small></div><div className="row-actions"><button className="icon-button" disabled={busy} aria-label={`Delete case ${c.reference}`} onClick={() => onDelete(c)}><Trash2 size={15}/></button><Link className="icon-button" aria-label={`Open case ${c.reference}`} to={`/cases/${c.id}`}><ChevronRight size={18}/></Link></div></div>)}</div>;
}

function Sources({rules}: {rules: Registry | null}) {
  return <><div className="page-heading"><div className="eyebrow">Australia · versioned decision rules</div><h1>Sources & legal rules</h1><p>Inspect the authority behind each calculation. A missing or expired rule blocks calculation.</p></div><div className="source-registry"><ShieldCheck size={22}/><div><strong>{rules?.version ?? "Registry unavailable"}</strong><p>Last checked {dateLabel(rules?.checked_at)} · review due {dateLabel(rules?.review_due)}</p></div><span className="small-tag">Snapshot, not live monitoring</span></div>{rules?.sources.map(s => <article className="source-entry" key={s.id}><div className="source-entry-title"><span className="source-number">{String((rules?.sources.indexOf(s) ?? 0) + 1).padStart(2, "0")}</span><div><h2>{s.title}</h2><p>{s.section}</p></div><a className="icon-button" href={s.url} target="_blank" rel="noreferrer" aria-label={`Open ${s.title}`}><ArrowRight size={18}/></a></div><p>{s.summary}</p><div className="source-metadata"><span>Version<strong>{s.version}</strong></span><span>Effective / compilation<strong>{s.effective_from ? dateLabel(s.effective_from) : "Guidance · no statutory commencement"}</strong></span><span>Last checked<strong>{dateLabel(s.checked_at)}</strong></span></div></article>)}<p className="legal-footnote">The 2024 instrument repeals the 2014 specification. Guidance is checked against the legislation; conflicting or outdated guidance is not used to override the statutory rule. Current professional review is needed for an individual case, public holidays, exceptions and any later changes.</p></>;
}

function Privacy() {
  return <><div className="page-heading"><div className="eyebrow">Designed for student control</div><h1>Privacy & sandbox safety</h1><p>A clear boundary between preparing a request and taking real-world action.</p></div><div className="privacy-columns"><div><LockKeyhole size={26}/><h2>Your documents stay local by default</h2><p>Text PDFs and TXT files are processed by the backend on your computer. The original bytes are discarded after processing. Masked extracted text and case facts are stored in a local SQLite database.</p><p>External AI summaries require an explicit opt-in in the case’s Safety tab and an explicit summarisation action. With no configured API, the assistant works locally. No external OCR is implemented.</p><h2>Minimum information</h2><p>Do not upload real passport or bank identifiers for this presentation. The demo documents are entirely synthetic. Do not enter account numbers; the recipient check compares names and supplied payment fields only.</p></div><div><ShieldCheck size={26}/><h2>Every submission is simulated</h2><p>RefundPath cannot email a provider, submit an application, make a payment, contact an ombudsman or verify a bank account. After you approve a draft, the simulation updates this local case only.</p><h2>Deletion & session boundaries</h2><p>Use the delete action in the case list to remove a case and its extracted text. Sessions expire after 24 hours; expired records are purged within one minute while the backend runs, and on the next startup when it was stopped. This is a local prototype, not a production document vault. Your browser uses an HttpOnly session cookie.</p><h2>Decisions need human authority</h2><p>Risk flags describe inconsistencies; they do not prove fraud. Documents, legislation and complaint jurisdiction may require professional review. Estimates are not legal or financial advice.</p></div></div></>;
}

export default function App() {
  const [cases, setCases] = useState<Case[]>([]);
  const [rules, setRules] = useState<Registry | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newCase, setNewCase] = useState(false);
  const [deleteCase, setDeleteCase] = useState<Case | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All cases");
  const [scenario, setScenario] = useState("matched");
  const toast = useToast();
  const navigate = useNavigate();
  const {pathname} = useLocation();
  const selected = cases.find(c => pathname === `/cases/${c.id}`);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { await api.session(); const [records, legal] = await Promise.all([api.cases(), api.rules()]); setCases(records); setRules(legal); }
    catch { setError("The local backend is unavailable. Start the RefundPath API, then retry."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { setMobileMenu(false); }, [pathname]);
  useEffect(() => {
    if (!mobileMenu) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileMenu(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileMenu]);

  const action: Action = async (work, message) => {
    if (busy) return false;
    setBusy(true);
    try { const updated = await work(); setCases(all => all.some(c => c.id === updated.id) ? all.map(c => c.id === updated.id ? updated : c) : [updated, ...all]); if (message) toast(message, "success"); return true; }
    catch (e) { toast((e as Error).message || "The request could not be completed.", "error"); return false; }
    finally { setBusy(false); }
  };
  const create = async (details: Details) => { const ok = await action(async () => { const c = await api.create(details); navigate(`/cases/${c.id}`); return c; }, "Private case created. Add your source documents."); if (ok) setNewCase(false); };
  const demo = () => void action(async () => { const c = await api.demo(scenario); navigate(`/cases/${c.id}`); return c; }, "Synthetic demo loaded. Review the case evidence.");
  const remove = async () => {
    if (!deleteCase) return;
    setBusy(true);
    try { await api.remove(deleteCase.id); setCases(all => all.filter(c => c.id !== deleteCase.id)); setDeleteCase(null); toast("Case and extracted text deleted.", "success"); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  const openCases = cases.filter(c => c.status !== "Resolved");
  const attention = openCases.filter(c => /review|approval|needed/.test(c.display_status));
  const deadlines = openCases.filter(c => c.analysis?.deadline).sort((a, b) => (a.analysis?.deadline?.date ?? "").localeCompare(b.analysis?.deadline?.date ?? ""));
  const visible = cases.filter(c => (!search || `${c.reference} ${c.details.provider_name} ${c.details.student_name}`.toLowerCase().includes(search.toLowerCase())) && (filter === "All cases" || filter === "Needs review" && /review|approval|needed/.test(c.display_status) || filter === "Waiting" && /Waiting|Follow-up|Overdue/.test(c.display_status) || filter === "Resolved" && c.status === "Resolved"));
  const currentPage = selected ? "Case workspace" : pathname === "/sources" ? "Sources & rules" : pathname === "/privacy" ? "Privacy & safety" : pathname === "/activity" ? "Activity" : pathname === "/documents" ? "Documents" : "Overview";

  return <div className="rp-app"><a href="#main-content" className="skip-link">Skip to main content</a>
    <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}><Brand/><div className="workspace-label"><span className="workspace-mark">AU</span><div>Student workspace<small>Australia only</small></div></div><div className="sidebar-caption">WORKSPACE</div><nav aria-label="Main navigation"><NavLink end to="/"><LayoutDashboard size={18}/>Overview</NavLink><NavLink to="/cases" className={selected ? "active" : ""}><FolderOpen size={18}/>Refund cases<span className="nav-count">{cases.length}</span></NavLink><NavLink to="/documents"><FileText size={18}/>Documents</NavLink><NavLink to="/activity"><Clock3 size={18}/>Activity</NavLink></nav><div className="sidebar-caption resources-caption">RESOURCES</div><nav aria-label="Resources"><NavLink to="/sources"><BookOpen size={18}/>Sources & rules</NavLink><NavLink to="/privacy"><ShieldCheck size={18}/>Privacy & safety</NavLink></nav><div className="sidebar-bottom"><div className="sandbox-label"><span/>Sandbox mode</div><p>Prepare, review, simulate.<br/>You approve every step.</p><div className="profile"><div className="profile-avatar">S</div><div>Student sandbox<small>Private · local session</small></div><LockKeyhole size={14}/></div></div></aside>
    {mobileMenu && <button className="mobile-shade" aria-label="Close navigation" onClick={() => setMobileMenu(false)}/>}
    <div className="main-shell"><header className="topbar"><button className="icon-button mobile-menu-button" aria-label="Toggle navigation" onClick={() => setMobileMenu(v => !v)}><Menu size={20}/></button><div className="breadcrumb">Workspace<ChevronRight size={13}/><strong>{currentPage}</strong></div><div className="topbar-right"><span className="sandbox-top"><LockKeyhole size={13}/>No real submissions</span><span className="top-avatar">S</span></div></header>
    <main id="main-content" tabIndex={-1} className="main-content" aria-busy={loading || busy}>
    {loading ? <div className="loading-state"><Spinner/><h2>Opening your private workspace</h2><p>Connecting to the local RefundPath API.</p></div> : error ? <div className="loading-state" role="alert"><ShieldCheck size={32}/><h1>Start the local backend</h1><p>{error}</p><Button variant="primary" onClick={() => void reload()}>Retry connection</Button></div> : selected ? <CaseWorkspace key={selected.id} c={selected} rules={rules} busy={busy} action={action}/> : pathname === "/sources" ? <Sources rules={rules}/> : pathname === "/privacy" ? <Privacy/> : pathname === "/activity" ? <><div className="page-heading"><div className="eyebrow">Your case history</div><h1>Activity</h1><p>Student actions and sandbox transitions, in one place.</p></div><div className="global-activity">{cases.flatMap(c => c.history.map(h => ({...h, case: c}))).sort((a, b) => b.at.localeCompare(a.at)).map(h => <Link key={h.id} to={`/cases/${h.case.id}`}><Clock3 size={18}/><div><strong>{h.status}</strong><p>{h.text}</p><small>{h.case.reference} · {dateLabel(h.at)}</small></div><ChevronRight size={17}/></Link>)}</div>{!cases.length && <div className="empty-inline"><p>No activity yet. Create a case to begin.</p></div>}</> : pathname === "/documents" ? <><div className="page-heading"><div className="eyebrow">Your evidence library</div><h1>Documents</h1><p>Masked extracted text is stored with each case. Open a case to preview or manage its sources.</p></div><div className="global-activity">{cases.flatMap(c => c.documents.map(d => <Link to={`/cases/${c.id}`} key={d.id}><FileText size={20}/><div><strong>{d.name}</strong><p>{c.details.provider_name} · {c.reference}</p><small>{d.facts.length} extracted fields · {d.synthetic ? "Synthetic demo" : "User document"} · raw file discarded</small></div><ChevronRight size={17}/></Link>))}</div>{!cases.some(c => c.documents.length) && <div className="empty-inline"><FileText size={24}/><p>No documents yet. Create a case and add your source files.</p></div>}</> : pathname === "/" || pathname === "/cases" ? <>
      <div className="page-heading heading-with-action"><div><div className="eyebrow">Your student refund workspace</div><h1>{pathname === "/cases" ? "Refund cases" : "Overview"}</h1><p>Know where your case stands, and what to do next.</p></div><Button variant="primary" onClick={() => setNewCase(true)}><Plus size={17}/>New refund case</Button></div>
      <div className="overview-metrics"><div><span>Open cases</span><strong>{String(openCases.length).padStart(2, "0")}</strong><small>In your workspace</small></div><div><span>Estimated refunds</span><strong>{amount(String(openCases.reduce((sum, c) => sum + Number(c.analysis?.estimate ?? 0), 0)))}</strong><small>Provisional · AUD only</small></div><div><span>Needs your attention</span><strong>{String(attention.length).padStart(2, "0")}</strong><small>Evidence or approval pending</small></div><div><span>Next provider deadline</span><strong className="metric-date">{deadlines.length ? dateLabel(deadlines[0].analysis?.deadline?.date) : "Not confirmed"}</strong><small>{deadlines.length ? `${deadlines[0].remaining_days} days · provisional date` : "A legal trigger must be sourced"}</small></div></div>
      {attention.length > 0 && <div className="attention-strip"><div className="attention-icon"><ShieldCheck size={20}/></div><div><strong>{attention.length} {attention.length === 1 ? "case needs" : "cases need"} your review</strong><p>Check the source information before preparing a refund request.</p></div><Link to={`/cases/${attention[0].id}`}>Review case<ArrowRight size={16}/></Link></div>}
      <div className="case-list-heading"><h2>Your refund cases<span>{cases.length}</span></h2><div className="case-tools"><label className="search-field"><Search size={15}/><input aria-label="Search refund cases" placeholder="Search cases…" value={search} onChange={e => setSearch(e.target.value)}/></label><select aria-label="Filter cases" value={filter} onChange={e => setFilter(e.target.value)}>{["All cases", "Needs review", "Waiting", "Resolved"].map(f => <option key={f}>{f}</option>)}</select></div></div>
      {visible.length ? <CaseList cases={visible} busy={busy} onDelete={setDeleteCase}/> : <div className="empty-workspace"><div className="empty-workspace-icon"><FolderOpen size={28}/></div><h2>{cases.length ? "No matching cases" : "Your first refund case starts here"}</h2><p>{cases.length ? "Try another search or status filter." : "Gather your agreement, payments and visa refusal. We’ll help you review the evidence and prepare your next step."}</p><Button onClick={() => { if (cases.length) { setSearch(""); setFilter("All cases"); } else setNewCase(true); }}>{cases.length ? "Reset filters" : "Create a case"}<ArrowRight size={15}/></Button></div>}
      <div className="demo-strip"><div className="demo-symbol"><CheckCircle2 size={25}/></div><div><span className="eyebrow">Try the complete workflow</span><h3>Explore with synthetic documents</h3><p>A private demo case. No API key, real student details or bank information needed.</p></div><div className="demo-controls"><select aria-label="Demo scenario" value={scenario} onChange={e => setScenario(e.target.value)}><option value="matched">Matching documents</option><option value="missing">Missing document</option><option value="agent">Agent payment</option><option value="conflict">Conflicting amount</option><option value="injection">Untrusted instructions</option></select><Button disabled={busy} onClick={demo}>Load demo case<ArrowRight size={15}/></Button></div></div>
      <div className="overview-footer"><span><LockKeyhole size={14}/>Local processing by default</span><Link to="/sources">Official sources checked {dateLabel(rules?.checked_at)}<ArrowRight size={13}/></Link></div>
    </> : <div className="loading-state"><h1>Case or page not found</h1><p>This case may belong to another session, have expired or have been deleted.</p><Link to="/">Return to overview</Link></div>}
    </main><footer className="app-footer"><span>RefundPath · Australia-only prototype</span><span>Estimates need authoritative confirmation. No legal or financial advice.</span></footer></div>
    {newCase && <CaseForm busy={busy} onClose={() => setNewCase(false)} onSubmit={create}/>}
    {deleteCase && <Modal title="Delete this case?" onClose={() => setDeleteCase(null)}><p className="dialog-intro">This removes {deleteCase.reference}, its masked source text, drafts and history from this sandbox.</p><div className="dialog-actions"><Button onClick={() => setDeleteCase(null)}><X size={15}/>Keep case</Button><Button variant="primary" disabled={busy} onClick={() => void remove()}>Delete case</Button></div></Modal>}
  </div>;
}
