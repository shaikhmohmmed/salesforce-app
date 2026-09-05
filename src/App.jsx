import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { LogOut, Plus, Trash2, Edit2, Eye, RefreshCw } from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';
axios.defaults.withCredentials = true;

const OBJECT_OPTIONS = ['Account', 'Opportunity', 'Lead', 'Contact', 'Case'];

export default function App() {
  const [auth, setAuth] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [selectedObject, setSelectedObject] = useState('Account');
  const [records, setRecords] = useState([]);
  const [fields, setFields] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const [activeModal, setActiveModal] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    axios.get(`${API_BASE}/auth/status`)
      .then(res => setAuth(res.data.authenticated))
      .catch(() => setAuth(false))
      .finally(() => setLoadingAuth(false));
  }, []);

  const fetchRecords = useCallback(async (currentOffset, reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/sobjects/${selectedObject}?offset=${currentOffset}`);
      setFields(res.data.fields);
      const newRecords = res.data.records;
      setHasMore(newRecords.length === 20);
      setRecords(prev => (reset ? newRecords : [...prev, ...newRecords]));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedObject, loading]);

  useEffect(() => {
    if (auth) {
      setRecords([]);
      setOffset(0);
      setHasMore(true);
      fetchRecords(0, true);
    }
  }, [selectedObject, auth]);

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

  const handleLogin = () => window.location.href = `${API_BASE}/auth/login`;
  const handleLogout = async () => {
    await axios.post(`${API_BASE}/auth/logout`);
    setAuth(false);
    setRecords([]);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    try {
      await axios.delete(`${API_BASE}/sobjects/${selectedObject}/${id}`);
      setRecords(prev => prev.filter(r => r.Id !== id));
    } catch (err) {
      alert('Delete failed.');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (activeModal === 'create') {
        await axios.post(`${API_BASE}/sobjects/${selectedObject}`, formData);
      } else if (activeModal === 'edit') {
        const payload = { ...formData };
        delete payload.Id;
        delete payload.attributes;
        delete payload.CaseNumber;
        await axios.patch(`${API_BASE}/sobjects/${selectedObject}/${selectedRecord.Id}`, payload);
      }
      setActiveModal(null);
      setFormData({});
      setOffset(0);
      fetchRecords(0, true);
    } catch (err) {
      alert('Error saving record. Check required fields.');
    }
  };

  if (loadingAuth) return <div className="p-10 text-center font-medium">Checking authentication...</div>;

  if (!auth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-md w-full">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Salesforce Manager</h1>
          <p className="text-sm text-slate-500 mb-6">Authorize your developer account to begin.</p>
          <button onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition">
            Log in with Salesforce
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-slate-800">Salesforce CRUD Hub</h1>
          <select 
            value={selectedObject} 
            onChange={(e) => setSelectedObject(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 font-medium text-slate-700"
          >
            {OBJECT_OPTIONS.map(obj => <option key={obj} value={obj}>{obj}</option>)}
          </select>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => { setFormData({}); setActiveModal('create'); }}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
          >
            <Plus size={16} /> <span>New {selectedObject}</span>
          </button>
          <button 
            onClick={handleLogout} 
            className="flex items-center space-x-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-sm transition"
          >
            <LogOut size={16} /> <span>Logout</span>
          </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-100 border-b uppercase font-semibold text-xs text-slate-500">
              <tr>
                {fields.map(field => <th key={field} className="px-4 py-3">{field}</th>)}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => {
                const isLast = records.length === index + 1;
                return (
                  <tr key={record.Id} ref={isLast ? lastRecordRef : null} className="border-b hover:bg-slate-50 transition">
                    {fields.map(f => (
                      <td key={f} className="px-4 py-3 max-w-xs truncate">
                        {record[f] !== null && record[f] !== undefined ? String(record[f]) : '-'}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right space-x-2">
                      <button onClick={() => { setSelectedRecord(record); setActiveModal('view'); }} className="text-slate-400 hover:text-blue-600">
                        <Eye size={16} />
                      </button>
                      <button onClick={() => { setSelectedRecord(record); setFormData(record); setActiveModal('edit'); }} className="text-slate-400 hover:text-amber-600">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(record.Id)} className="text-slate-400 hover:text-red-600">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {records.length === 0 && !loading && (
            <div className="p-8 text-center text-slate-400">No records found.</div>
          )}

          {loading && (
            <div className="p-4 flex items-center justify-center space-x-2 text-slate-500">
              <RefreshCw className="animate-spin" size={18} />
              <span>Loading records...</span>
            </div>
          )}
        </div>
      </main>

      {activeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold mb-4 text-slate-800">
              {activeModal === 'create' && `Create ${selectedObject}`}
              {activeModal === 'edit' && `Edit ${selectedObject}`}
              {activeModal === 'view' && `${selectedObject} Details`}
            </h2>

            {activeModal === 'view' ? (
              <div className="space-y-3">
                {fields.map(f => (
                  <div key={f} className="border-b pb-1 text-sm flex justify-between">
                    <span className="font-semibold text-slate-500">{f}:</span>
                    <span className="text-slate-800">{selectedRecord[f] || '-'}</span>
                  </div>
                ))}
                <div className="mt-6 flex justify-end">
                  <button onClick={() => setActiveModal(null)} className="px-4 py-2 border rounded-lg">Close</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                {fields.filter(f => f !== 'CaseNumber').map(field => (
                  <div key={field}>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{field}</label>
                    <input 
                      type="text"
                      value={formData[field] || ''}
                      onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      required={['Name', 'LastName', 'Subject', 'StageName', 'CloseDate'].includes(field)}
                    />
                  </div>
                ))}
                <div className="flex justify-end space-x-3 pt-3">
                  <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 border rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Save</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}