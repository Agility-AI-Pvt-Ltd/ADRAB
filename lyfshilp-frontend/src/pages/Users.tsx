import { useEffect, useState } from 'react';
import { usersApi } from '../api';
import { Avatar, Spinner, useToast } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import type { TeamDepartment, User } from '../types';

const ROLE_LABELS: Record<string, string> = {
  founder: 'Founder',
  team_member: 'Team Member',
  admin: 'Admin',
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [savingDepartmentUserId, setSavingDepartmentUserId] = useState<string | null>(null);
  const [togglingStatusUserId, setTogglingStatusUserId] = useState<string | null>(null);
  const [departmentDrafts, setDepartmentDrafts] = useState<Record<string, TeamDepartment | ''>>({});
  const [creatingFounder, setCreatingFounder] = useState(false);
  const [founderForm, setFounderForm] = useState({
    name: '',
    email: '',
    password: '',
  });

  const canCreateFounder = currentUser?.role === 'founder';

  async function load() {
    setLoading(true);
    try {
      const { data } = await usersApi.list();
      setUsers(data);
      setDepartmentDrafts(
        Object.fromEntries(
          data.map(user => [user.id, user.department ?? ''])
        ) as Record<string, TeamDepartment | ''>
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approveUser(userId: string) {
    setApprovingUserId(userId);
    try {
      await usersApi.update(userId, { is_active: true });
      toast('success', 'Team member approved successfully');
      await load();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not approve team member');
    } finally {
      setApprovingUserId(null);
    }
  }

  async function saveDepartment(userId: string) {
    setSavingDepartmentUserId(userId);
    try {
      await usersApi.update(userId, { department: departmentDrafts[userId] || null });
      toast('success', 'Department updated');
      await load();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not update department');
    } finally {
      setSavingDepartmentUserId(null);
    }
  }

  async function toggleActive(user: User) {
    setTogglingStatusUserId(user.id);
    try {
      await usersApi.update(user.id, { is_active: !user.is_active });
      toast('success', user.is_active ? 'Team member deactivated' : 'Team member activated');
      await load();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not update account status');
    } finally {
      setTogglingStatusUserId(null);
    }
  }

  async function createFounder() {
    if (!founderForm.name.trim() || !founderForm.email.trim() || founderForm.password.length < 8) {
      toast('error', 'Name, work email, and an 8+ character password are required');
      return;
    }

    setCreatingFounder(true);
    try {
      await usersApi.createFounder({
        name: founderForm.name.trim(),
        email: founderForm.email.trim(),
        password: founderForm.password,
        department: 'founders',
      });
      toast('success', 'Founder account created');
      setFounderForm({ name: '', email: '', password: '' });
      await load();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not create founder account');
    } finally {
      setCreatingFounder(false);
    }
  }

  const filtered = users.filter(user => {
    const matchesRole = !roleFilter || user.role === roleFilter;
    const matchesStatus = !statusFilter || (statusFilter === 'active' ? user.is_active : !user.is_active);
    const term = search.trim().toLowerCase();
    const matchesSearch = !term
      || user.name.toLowerCase().includes(term)
      || user.email.toLowerCase().includes(term);
    return matchesRole && matchesStatus && matchesSearch;
  });

  const counts = {
    total: users.length,
    founders: users.filter(user => user.role === 'founder').length,
    teamMembers: users.filter(user => user.role === 'team_member').length,
    pending: users.filter(user => user.role === 'team_member' && !user.is_active).length,
  };

  return (
    <div className="content">
      {canCreateFounder && (
        <div className="table-card" style={{ marginBottom: 20 }}>
          <div className="table-header">
            <span className="table-title">Add Founder</span>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              Only founders can create other founder accounts
            </span>
          </div>
          <div style={{ padding: '0 24px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Name</label>
              <input
                className="form-input"
                value={founderForm.name}
                onChange={e => setFounderForm(form => ({ ...form, name: e.target.value }))}
                placeholder="Founder name"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Work Email</label>
              <input
                className="form-input"
                type="email"
                value={founderForm.email}
                onChange={e => setFounderForm(form => ({ ...form, email: e.target.value }))}
                placeholder="name@agilityai.in"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Temporary Password</label>
              <input
                className="form-input"
                type="password"
                value={founderForm.password}
                onChange={e => setFounderForm(form => ({ ...form, password: e.target.value }))}
                placeholder="Minimum 8 characters"
              />
            </div>
          </div>
          <div style={{ padding: '0 24px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              New founders are created as active local accounts in the Founders department.
            </span>
            <button className="btn btn-primary" onClick={createFounder} disabled={creatingFounder}>
              {creatingFounder ? 'Creating…' : 'Add Founder'}
            </button>
          </div>
        </div>
      )}

      <div className="stats-row">
        <div className="stat-card total">
          <div className="stat-label">Total Users</div>
          <div className="stat-value">{counts.total}</div>
          <div className="stat-sub">Founders, admins, and team members</div>
        </div>
        <div className="stat-card approved">
          <div className="stat-label">Founders</div>
          <div className="stat-value">{counts.founders}</div>
          <div className="stat-sub">Founder accounts</div>
        </div>
        <div className="stat-card pending">
          <div className="stat-label">Team Members</div>
          <div className="stat-value">{counts.teamMembers}</div>
          <div className="stat-sub">All team-member accounts</div>
        </div>
        <div className="stat-card rejected">
          <div className="stat-label">Pending Approval</div>
          <div className="stat-value">{counts.pending}</div>
          <div className="stat-sub">Inactive team members</div>
        </div>
      </div>

      <div className="filters-row">
        <select className="filter-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          <option value="founder">Founder</option>
          <option value="admin">Admin</option>
          <option value="team_member">Team Member</option>
        </select>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div className="search-wrap">
          <span className="search-icon" style={{ fontSize: 13 }}>⌕</span>
          <input
            className="search-input"
            placeholder="Search people..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-outline btn-sm" onClick={load}>↺ Refresh</button>
      </div>

      <div className="table-card">
        <div className="table-header">
          <span className="table-title">People Directory</span>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {filtered.length} user{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <Spinner dark />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No users match these filters</div>
            <div className="empty-state-desc">Try adjusting the role, status, or search text.</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department</th>
                <th>Auth</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => {
                const canApprove = user.role === 'team_member' && !user.is_active;
                const canAssignDepartment = user.role === 'team_member';
                const canToggleStatus = user.role === 'team_member';
                const departmentValue = departmentDrafts[user.id] ?? '';
                return (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <Avatar name={user.name} email={user.email} size="sm" />
                        <div>
                          <div className="people-name">{user.name}</div>
                          <div className="people-email">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{ROLE_LABELS[user.role] ?? user.role}</td>
                    <td>
                      {canAssignDepartment ? (
                        <div className="department-cell">
                          <select
                            className="filter-select"
                            value={departmentValue}
                            onChange={e => setDepartmentDrafts(drafts => ({
                              ...drafts,
                              [user.id]: (e.target.value || '') as TeamDepartment | '',
                            }))}
                          >
                            <option value="">No Department</option>
                            <option value="sales">Sales</option>
                            <option value="marketing">Marketing</option>
                            <option value="counsellor">Counsellor</option>
                            <option value="academic">Academic</option>
                            <option value="founders">Founders</option>
                          </select>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => saveDepartment(user.id)}
                            disabled={savingDepartmentUserId === user.id || departmentValue === (user.department ?? '')}
                          >
                            {savingDepartmentUserId === user.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      ) : (
                        <span style={{ textTransform: 'capitalize' }}>{user.department ?? '—'}</span>
                      )}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{user.auth_provider}</td>
                    <td>
                      <span className={user.is_active ? 'status-pill status-pill-active' : 'status-pill status-pill-inactive'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                      {new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td>
                      {canToggleStatus ? (
                        <div className="people-actions">
                          {canApprove && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => approveUser(user.id)}
                              disabled={approvingUserId === user.id || togglingStatusUserId === user.id}
                            >
                              {approvingUserId === user.id ? 'Approving…' : 'Approve'}
                            </button>
                          )}
                          {user.is_active && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => toggleActive(user)}
                              disabled={togglingStatusUserId === user.id || approvingUserId === user.id}
                            >
                              {togglingStatusUserId === user.id ? 'Updating…' : 'Make Inactive'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
