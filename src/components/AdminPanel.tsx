import React, { useState, useEffect } from 'react';
import { useAuth } from './Auth';
import { Trash2, UserCog, ShieldCheck, ShieldAlert, Shield, Plus, X, Check, Clock, Ban } from 'lucide-react';

interface UserData {
  uid: string;
  email: string;
  username: string;
  role: string;
  status: string;
  registeredAt: string | null;
}

export default function AdminPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [addError, setAddError] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch users. Ensure you have admin privileges.');
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setGeneratedPasswordResult(null);
    try {
      const token = localStorage.getItem('authToken');
      const body: any = { email: newEmail, username: newUsername, role: newRole, emailPassword };
      if (!emailPassword && newPassword) body.password = newPassword;
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      
      if (!emailPassword && data.generatedPassword) {
        setGeneratedPasswordResult(data.generatedPassword);
      } else {
        setShowAddForm(false);
      }
      setNewEmail(''); setNewUsername(''); setNewPassword(''); setNewRole('user');
      fetchUsers();
    } catch (err: any) {
      setAddError(err.message);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleRoleChange = async (uid: string, newRole: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`/api/admin/users/${uid}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole })
      });
      if (!res.ok) throw new Error('Failed to update role');
      fetchUsers();
    } catch (err: any) { alert(err.message); }
  };

  const handleApprove = async (uid: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`/api/admin/users/${uid}/approve`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to approve user');
      fetchUsers();
    } catch (err: any) { alert(err.message); }
  };

  const handleDeny = async (uid: string) => {
    if (!confirm('Deny this registration? The user will not be able to log in.')) return;
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`/api/admin/users/${uid}/deny`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to deny user');
      fetchUsers();
    } catch (err: any) { alert(err.message); }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!confirm('Are you sure you want to delete this user? All their data will be lost.')) return;
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`/api/admin/users/${uid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete user');
      fetchUsers();
    } catch (err: any) { alert(err.message); }
  };

  if (loading) return <div className="text-white">Loading Admin Panel...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  const pendingUsers = users.filter(u => u.status === 'pending');
  const approvedUsers = users.filter(u => u.status !== 'pending' && u.status !== 'denied');

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const statusBadge = (status: string) => {
    if (!status || status === 'approved') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <Check className="w-3 h-3" /> Approved
      </span>
    );
    if (status === 'pending') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <Clock className="w-3 h-3" /> Pending
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
        <Ban className="w-3 h-3" /> Denied
      </span>
    );
  };

  return (
    <div className="text-white max-w-4xl mx-auto w-full space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-indigo-400" />
          <div>
            <h2 className="text-2xl font-bold tracking-wider">Administration</h2>
            <p className="text-white/50 text-sm">Manage user accounts and permissions.</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors text-sm font-semibold tracking-wider"
        >
          {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showAddForm ? 'CANCEL' : 'ADD USER'}
        </button>
      </div>

      {/* Add User Form */}
      {showAddForm && (
        <form onSubmit={handleAddUser} className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-lg font-bold tracking-wider mb-2">Create New User</h3>
          {addError && <div className="text-red-400 bg-red-400/10 p-3 rounded text-sm">{addError}</div>}
          
          {/* Password mode toggle */}
          <div className="flex gap-2 bg-black/30 rounded-lg p-1">
            <button type="button"
              onClick={() => setEmailPassword(true)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-semibold transition-all ${emailPassword ? 'bg-indigo-600 text-white' : 'text-white/50 hover:text-white'}`}>
              📧 Generate &amp; Email Password
            </button>
            <button type="button"
              onClick={() => setEmailPassword(false)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-semibold transition-all ${!emailPassword ? 'bg-indigo-600 text-white' : 'text-white/50 hover:text-white'}`}>
              🔑 Set Manual Password
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input type="text" placeholder="Username"
              className="bg-black/50 border border-white/10 px-4 py-2.5 rounded-lg text-white outline-none focus:border-indigo-500"
              value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
            <input type="email" placeholder="Email Address"
              className="bg-black/50 border border-white/10 px-4 py-2.5 rounded-lg text-white outline-none focus:border-indigo-500"
              value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
            {!emailPassword && (
              <input type="password" placeholder="Password (min 8 characters)"
                className="bg-black/50 border border-white/10 px-4 py-2.5 rounded-lg text-white outline-none focus:border-indigo-500"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required={!emailPassword} minLength={8} />
            )}
            <select className="bg-black/50 border border-white/10 px-4 py-2.5 rounded-lg text-white outline-none focus:border-indigo-500 appearance-none"
              value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="user">Role: USER</option>
              <option value="admin">Role: ADMIN</option>
            </select>
          </div>

          {emailPassword && (
            <p className="text-xs text-white/40 -mt-1">A strong 12-character password will be auto-generated and sent to the user's email address.</p>
          )}

          {generatedPasswordResult && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <p className="text-amber-300 text-sm font-bold mb-1">User created! Generated Password:</p>
              <code className="block text-amber-300 font-mono text-lg font-black tracking-widest select-all">{generatedPasswordResult}</code>
              <p className="text-white/40 text-xs mt-2">Share this with the user directly. It won't be shown again.</p>
            </div>
          )}

          <div className="flex justify-end mt-2">
            <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold tracking-wider rounded-lg transition-colors">
              CREATE ACCOUNT
            </button>
          </div>
        </form>
      )}

      {/* Pending Approvals */}
      {pendingUsers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold tracking-wider text-amber-400">Pending Approvals</h3>
            <span className="bg-amber-500 text-black text-xs font-black px-2 py-0.5 rounded-full">{pendingUsers.length}</span>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden divide-y divide-amber-500/10">
            {pendingUsers.map(u => (
              <div key={u.uid} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold uppercase shrink-0">
                    {u.username?.[0] || '?'}
                  </div>
                  <div>
                    <div className="font-medium text-white">{u.username}</div>
                    <div className="text-xs text-white/40">{u.email}</div>
                    <div className="text-xs text-white/30 mt-0.5">Registered {formatDate(u.registeredAt)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(u.uid)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => handleDeny(u.uid)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Users Table */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider">All Users</h3>
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-black/40 border-b border-white/10 text-white/50 text-xs tracking-wider uppercase">
              <tr>
                <th className="p-4 font-semibold">User</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Role</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {approvedUsers.map(u => (
                <tr key={u.uid} className="hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold uppercase shrink-0">
                        {u.username?.[0] || '?'}
                      </div>
                      <div>
                        <div className="font-medium text-white">
                          {u.username}
                          {u.uid === user?.uid && <span className="text-xs ml-2 bg-white/10 px-2 py-0.5 rounded-full text-white/50">You</span>}
                        </div>
                        <div className="text-xs text-white/40">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">{statusBadge(u.status)}</td>
                  <td className="p-4">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide border ${
                      u.role === 'admin'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-white/5 text-white/60 border-white/10'
                    }`}>
                      {u.role === 'admin' ? <ShieldAlert className="w-3.5 h-3.5" /> : <UserCog className="w-3.5 h-3.5" />}
                      {u.role.toUpperCase()}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      {u.role !== 'admin' ? (
                        <button onClick={() => handleRoleChange(u.uid, 'admin')}
                          className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded transition-colors flex items-center gap-1">
                          <Shield className="w-3.5 h-3.5" /> Promote
                        </button>
                      ) : (
                        <button onClick={() => handleRoleChange(u.uid, 'user')}
                          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded transition-colors"
                          disabled={u.uid === user?.uid}
                          title={u.uid === user?.uid ? "Cannot demote yourself" : "Demote to User"}>
                          Demote
                        </button>
                      )}
                      <button onClick={() => handleDeleteUser(u.uid)}
                        className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                        disabled={u.uid === user?.uid}
                        title={u.uid === user?.uid ? "Cannot delete yourself" : "Delete User"}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {approvedUsers.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-white/50">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
