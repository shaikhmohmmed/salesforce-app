import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  LogOut, Plus, Trash2, Edit3, Eye, Loader2, CloudLightning,
  X, Check, AlertCircle, ChevronDown, Building2, Target,
  Users, Briefcase, FileText, Search, Database, Shield,
} from 'lucide-react';

/* ================================================
   Configuration
   ================================================ */
const API_BASE = 'http://localhost:5000/api';
axios.defaults.withCredentials = true;

const SF_OBJECTS = [
  { name: 'Account',     icon: Building2,  gradient: 'from-indigo-500 to-purple-600',  color: '#818cf8' },
  { name: 'Opportunity', icon: Briefcase,  gradient: 'from-amber-500 to-orange-600',   color: '#fbbf24' },
  { name: 'Lead',        icon: Target,     gradient: 'from-emerald-500 to-teal-600',   color: '#34d399' },
  { name: 'Contact',     icon: Users,      gradient: 'from-blue-500 to-cyan-600',      color: '#60a5fa' },
  { name: 'Case',        icon: FileText,   gradient: 'from-rose-500 to-pink-600',      color: '#fb7185' },
];

/* ================================================
   Toast Notification Component
   ================================================ */
function Toast({ toasts, removeToast }) {
  return (
    <div className="fixed top-5 right-5 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl backdrop-blur-2xl border text-sm font-medium animate-slide-in
            ${toast.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
              : 'bg-red-500/15 border-red-500/25 text-red-300'
            }`}
        >
          {toast.type === 'success'
            ? <Check size={16} className="shrink-0" />
            : <AlertCircle size={16} className="shrink-0" />
          }
          <span>{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 opacity-50 hover:opacity-100 transition-opacity"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ================================================
   Main App Component
   ================================================ */
export default function App() {
  /* ---- Auth state ---- */
  const [auth, setAuth] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  /* ---- Data state ---- */
  const [selectedObject, setSelectedObject] = useState('Account');
  const [records, setRecords] = useState([]);
  const [fields, setFields] = useState([]);
  const [offset, setOffset] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  /* ---- Modal state ---- */
  const [activeModal, setActiveModal] = useState(null);   // 'view' | 'create' | 'edit'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  /* ---- Toast state ---- */
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  };
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  /* ================================================
     Auth Check
     ================================================ */
  useEffect(() => {
    axios.get(`${API_BASE}/auth/status`)
      .then(res => setAuth(res.data.authenticated))
      .catch(() => setAuth(false))
      .finally(() => setLoadingAuth(false));
  }, []);

  /* ================================================
     Fetch Records (paginated, 20 at a time)
     ================================================ */
  const fetchRecords = useCallback(async (currentOffset, reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await axios.get(
        `${API_BASE}/sobjects/${selectedObject}?offset=${currentOffset}`
      );
      setFields(res.data.fields);
      const newRecords = res.data.records;
      if (res.data.totalSize !== undefined) setTotalSize(res.data.totalSize);
      setHasMore(newRecords.length === 20);
      setRecords(prev => (reset ? newRecords : [...prev, ...newRecords]));
    } catch (err) {
      if (err.response?.status === 401) {
        setAuth(false);
        addToast('Session expired. Please login again.', 'error');
      } else {
        addToast('Failed to fetch records', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedObject, loading]);

  /* Reset on object change */
  useEffect(() => {
    if (auth) {
      setRecords([]);
      setOffset(0);
      setHasMore(true);
      fetchRecords(0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObject, auth]);

  /* ================================================
     Infinite Scroll (IntersectionObserver)
     ================================================ */
  const observer = useRef();
  const lastRecordRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setOffset(prev => {
          const next = prev + 20;
          fetchRecords(next, false);
          return next;
        });
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore, fetchRecords]);

  /* ================================================
     Action Handlers
     ================================================ */
  const handleLogin = () => {
    window.location.href = `${API_BASE}/auth/login`;
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API_BASE}/auth/logout`);
    } catch (e) { /* ignore */ }
    setAuth(false);
    setRecords([]);
    setFields([]);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this record? This action cannot be undone.')) return;
    try {
      await axios.delete(`${API_BASE}/sobjects/${selectedObject}/${id}`);
      setRecords(prev => prev.filter(r => r.Id !== id));
      addToast('Record deleted successfully');
    } catch (err) {
      addToast('Failed to delete record', 'error');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (activeModal === 'create') {
        await axios.post(`${API_BASE}/sobjects/${selectedObject}`, formData);
        addToast(`${selectedObject} created successfully`);
      } else if (activeModal === 'edit') {
        const payload = { ...formData };
        // Remove non-writable fields
        delete payload.Id;
        delete payload.attributes;
        delete payload.CaseNumber;
        await axios.patch(
          `${API_BASE}/sobjects/${selectedObject}/${selectedRecord.Id}`,
          payload
        );
        addToast(`${selectedObject} updated successfully`);
      }
      setActiveModal(null);
      setFormData({});
      setSelectedRecord(null);
      setOffset(0);
      fetchRecords(0, true);
    } catch (err) {
      const msg = err.response?.data?.[0]?.message
        || err.response?.data?.message
        || 'Error saving record. Check required fields.';
      addToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ---- Derived values ---- */
  const currentObj = SF_OBJECTS.find(o => o.name === selectedObject) || SF_OBJECTS[0];
  const ObjIcon = currentObj.icon;

  /* ================================================
     RENDER — Loading Splash
     ================================================ */
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <CloudLightning size={28} className="text-white" />
            </div>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 blur-xl opacity-40 animate-glow-pulse" />
          </div>
          <Loader2 className="animate-spin text-indigo-400 mt-2" size={24} />
          <p className="text-slate-400 font-medium text-sm">Checking authentication…</p>
        </div>
      </div>
    );
  }

  /* ================================================
     RENDER — Login Page
     ================================================ */
  if (!auth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Ambient blurred lights */}
        <div className="absolute top-1/4 -left-32 w-80 h-80 bg-indigo-600/20 rounded-full blur-[120px] animate-float" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-600/15 rounded-full blur-[140px] animate-float-delayed" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/8 rounded-full blur-[180px]" />

        <div className="relative glass-card-strong rounded-3xl shadow-2xl p-10 sm:p-12 max-w-md w-full text-center animate-scale-up">
          {/* Logo */}
          <div className="relative w-20 h-20 mx-auto mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/30 rotate-3 hover:rotate-0 transition-transform duration-500">
              <CloudLightning size={36} className="text-white" />
            </div>
            <div className="absolute -inset-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl blur-xl opacity-30 animate-glow-pulse" />
          </div>

          <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
            Salesforce <span className="gradient-text">Manager</span>
          </h1>
          <p className="text-slate-400 mb-10 text-sm leading-relaxed max-w-xs mx-auto">
            Connect your Salesforce developer org to manage Accounts, Contacts, Leads, Opportunities, and Cases.
          </p>

          <button
            onClick={handleLogin}
            className="btn-shine w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-4 rounded-2xl transition-all duration-300 shadow-xl shadow-indigo-600/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 text-base"
          >
            Log in with Salesforce
          </button>

          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-600">
            <Shield size={12} />
            <span>Secured with OAuth 2.0 + PKCE</span>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================
     RENDER — Main Dashboard
     ================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <Toast toasts={toasts} removeToast={removeToast} />

      {/* ---- Header ---- */}
      <header className="sticky top-0 z-40 bg-slate-950/70 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          {/* Left: Logo + Selector */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <CloudLightning size={18} className="text-white" />
              </div>
              <h1 className="text-base font-bold text-white hidden md:block tracking-tight">
                SF Manager
              </h1>
            </div>

            <div className="h-6 w-px bg-white/10 hidden sm:block" />

            {/* Object dropdown */}
            <div className="relative">
              <select
                id="object-selector"
                value={selectedObject}
                onChange={(e) => setSelectedObject(e.target.value)}
                className="appearance-none bg-white/5 border border-white/10 text-white rounded-xl pl-10 pr-10 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer hover:bg-white/10 transition-all"
              >
                {SF_OBJECTS.map(obj => (
                  <option key={obj.name} value={obj.name}>{obj.name}</option>
                ))}
              </select>
              <ObjIcon
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: currentObj.color }}
              />
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              id="btn-create"
              onClick={() => { setFormData({}); setSelectedRecord(null); setActiveModal('create'); }}
              className="btn-shine flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">New {selectedObject}</span>
            </button>
            <button
              id="btn-logout"
              onClick={handleLogout}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ---- Main Content ---- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Stats bar */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${currentObj.gradient} flex items-center justify-center shadow-lg`}>
              <ObjIcon size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{selectedObject} Records</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {records.length} loaded{totalSize > 0 ? ` of ${totalSize} total` : ''} · Infinite scroll enabled
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Database size={12} />
            <span className="hidden sm:inline">20 records per batch</span>
          </div>
        </div>

        {/* Records Table */}
        <div className="glass-card rounded-2xl overflow-hidden shadow-2xl shadow-black/20">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  {fields.map(field => (
                    <th
                      key={field}
                      className="px-5 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap"
                    >
                      {field.replace(/([A-Z])/g, ' $1').trim()}
                    </th>
                  ))}
                  <th className="px-5 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-widest text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => {
                  const isLast = records.length === index + 1;
                  return (
                    <tr
                      key={record.Id}
                      ref={isLast ? lastRecordRef : null}
                      className="table-row-hover border-b border-white/[0.04] group"
                    >
                      {fields.map(f => (
                        <td key={f} className="px-5 py-4 text-slate-300 max-w-[220px] truncate whitespace-nowrap">
                          {record[f] !== null && record[f] !== undefined
                            ? String(record[f])
                            : <span className="text-slate-700">—</span>
                          }
                        </td>
                      ))}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity duration-200">
                          <button
                            onClick={() => { setSelectedRecord(record); setActiveModal('view'); }}
                            className="p-2 rounded-lg hover:bg-blue-500/15 text-slate-400 hover:text-blue-400 transition-colors"
                            title="View details"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => { setSelectedRecord(record); setFormData(record); setActiveModal('edit'); }}
                            className="p-2 rounded-lg hover:bg-amber-500/15 text-slate-400 hover:text-amber-400 transition-colors"
                            title="Edit record"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(record.Id)}
                            className="p-2 rounded-lg hover:bg-red-500/15 text-slate-400 hover:text-red-400 transition-colors"
                            title="Delete record"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Empty state */}
          {records.length === 0 && !loading && (
            <div className="py-24 text-center animate-fade-in">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                <Search size={24} className="text-slate-700" />
              </div>
              <p className="text-slate-500 font-semibold">No {selectedObject.toLowerCase()} records found</p>
              <p className="text-slate-700 text-sm mt-1.5">Create your first record to get started</p>
            </div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="py-8 flex items-center justify-center gap-3 text-slate-500 animate-fade-in">
              <Loader2 className="animate-spin" size={18} />
              <span className="text-sm font-medium">Loading records…</span>
            </div>
          )}

          {/* All loaded indicator */}
          {!hasMore && records.length > 0 && !loading && (
            <div className="py-4 text-center text-[11px] text-slate-700 border-t border-white/[0.04] uppercase tracking-widest">
              All records loaded
            </div>
          )}
        </div>
      </main>

      {/* ================================================
         Modal Overlay
         ================================================ */}
      {activeModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => { if (!saving) setActiveModal(null); }}
        >
          <div
            className="bg-slate-900/95 backdrop-blur-2xl border border-white/8 rounded-2xl shadow-2xl shadow-black/40 w-full max-w-lg animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${currentObj.gradient} flex items-center justify-center shadow-lg`}>
                  {activeModal === 'create' && <Plus size={18} className="text-white" />}
                  {activeModal === 'edit' && <Edit3 size={18} className="text-white" />}
                  {activeModal === 'view' && <Eye size={18} className="text-white" />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {activeModal === 'create' && `Create ${selectedObject}`}
                    {activeModal === 'edit' && `Edit ${selectedObject}`}
                    {activeModal === 'view' && `${selectedObject} Details`}
                  </h2>
                  {activeModal === 'view' && selectedRecord && (
                    <p className="text-xs text-slate-500 mt-0.5">ID: {selectedRecord.Id}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => { if (!saving) setActiveModal(null); }}
                className="p-2 rounded-xl hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {activeModal === 'view' ? (
                /* ---- View Mode ---- */
                <div className="space-y-1">
                  {fields.map(f => (
                    <div
                      key={f}
                      className="flex items-start justify-between gap-6 py-3 border-b border-white/[0.04] last:border-0"
                    >
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest shrink-0 pt-0.5">
                        {f.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className="text-sm text-slate-200 text-right break-words">
                        {selectedRecord[f] !== null && selectedRecord[f] !== undefined
                          ? String(selectedRecord[f])
                          : <span className="text-slate-700">—</span>
                        }
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                /* ---- Create / Edit Form ---- */
                <form onSubmit={handleSave} id="record-form" className="space-y-5">
                  {fields.filter(f => f !== 'CaseNumber').map(field => {
                    const isRequired = ['Name', 'LastName', 'Subject', 'StageName', 'CloseDate', 'Company', 'Status'].includes(field);
                    let inputType = 'text';
                    if (field === 'CloseDate') inputType = 'date';
                    else if (field === 'Amount' || field === 'AnnualRevenue') inputType = 'number';
                    else if (field === 'Email') inputType = 'email';
                    else if (field === 'Phone') inputType = 'tel';

                    return (
                      <div key={field}>
                        <label
                          htmlFor={`field-${field}`}
                          className="block text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-widest"
                        >
                          {field.replace(/([A-Z])/g, ' $1').trim()}
                          {isRequired && <span className="text-red-400 ml-1">*</span>}
                        </label>
                        <input
                          id={`field-${field}`}
                          type={inputType}
                          step={inputType === 'number' ? 'any' : undefined}
                          value={formData[field] || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
                          className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all hover:bg-white/[0.06]"
                          placeholder={`Enter ${field.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}`}
                          required={isRequired}
                        />
                      </div>
                    );
                  })}
                </form>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => { if (!saving) setActiveModal(null); }}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-sm font-medium transition-all disabled:opacity-50"
              >
                {activeModal === 'view' ? 'Close' : 'Cancel'}
              </button>
              {activeModal !== 'view' && (
                <button
                  type="submit"
                  form="record-form"
                  disabled={saving}
                  className="btn-shine px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving && <Loader2 className="animate-spin" size={14} />}
                  {activeModal === 'create' ? 'Create Record' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
