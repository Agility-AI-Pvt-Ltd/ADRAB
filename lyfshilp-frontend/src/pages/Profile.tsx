import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usersApi } from '../api';
import { Avatar, useToast } from '../components/shared';
import type { TeamDepartment } from '../types';

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const { toast } = useToast();
  if (!user) return null;

  const currentUser = user;
  const [name, setName] = useState(user?.name ?? '');
  const [department, setDepartment] = useState<TeamDepartment | ''>(user.department ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteEmail, setDeleteEmail] = useState(user.email);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function saveProfile() {
    setSaving(true);
    try {
      await usersApi.updateMe({
        name: name.trim() || currentUser.name,
        department: department || null,
      });
      await refreshUser();
      toast('success', 'Profile updated');
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not update profile');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    setChangingPassword(true);
    try {
      await usersApi.changePassword(currentPassword || null, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      toast('success', currentUser.auth_provider === 'google' ? 'Password set successfully' : 'Password updated successfully');
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not update password');
    } finally {
      setChangingPassword(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await usersApi.deleteMe(deleteEmail, deletePassword || null);
      toast('success', 'Account deleted');
      logout();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not delete account');
      setDeleting(false);
    }
  }

  return (
    <div className="content">
      <div className="profile-grid">
        <div className="card">
          <div className="card-body">
            <div className="profile-head">
              <Avatar name={currentUser.name} email={currentUser.email} size="lg" />
              <div>
                <div className="profile-name">{currentUser.name}</div>
                <div className="profile-subtitle">{currentUser.email}</div>
              </div>
            </div>

            <div className="profile-meta">
              <div className="profile-meta-item">
                <div className="profile-meta-label">User ID</div>
                <div className="profile-meta-value profile-code">{currentUser.id}</div>
              </div>
              <div className="profile-meta-item">
                <div className="profile-meta-label">Role</div>
                <div className="profile-meta-value" style={{ textTransform: 'capitalize' }}>{currentUser.role.replace('_', ' ')}</div>
              </div>
              <div className="profile-meta-item">
                <div className="profile-meta-label">Auth Provider</div>
                <div className="profile-meta-value" style={{ textTransform: 'capitalize' }}>{currentUser.auth_provider}</div>
              </div>
              <div className="profile-meta-item">
                <div className="profile-meta-label">Status</div>
                <div className="profile-meta-value">{currentUser.is_active ? 'Active' : 'Inactive'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Personal Details</div>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" value={currentUser.email} disabled />
            </div>
            <div className="form-group">
              <label className="form-label">Department</label>
              <select
                className="form-select"
                value={department}
                onChange={e => setDepartment((e.target.value || '') as TeamDepartment | '')}
              >
                <option value="">No Department</option>
                <option value="sales">Sales</option>
                <option value="marketing">Marketing</option>
                <option value="counsellor">Counsellor</option>
                <option value="academic">Academic</option>
                <option value="founders">Founders</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{currentUser.auth_provider === 'google' ? 'Set Password' : 'Reset Password'}</div>
          </div>
          <div className="card-body">
            {currentUser.auth_provider === 'google' && (
              <div className="profile-note">
                Your account signs in with Google right now. You can also set a password here for local sign-in.
              </div>
            )}
            {currentUser.auth_provider !== 'google' && (
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                className="form-input"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>
            <button
              className="btn btn-outline"
              onClick={changePassword}
              disabled={changingPassword || newPassword.length < 8}
            >
              {changingPassword ? 'Updating…' : currentUser.auth_provider === 'google' ? 'Set Password' : 'Update Password'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Delete Account</div>
          </div>
          <div className="card-body">
            <div className="profile-note profile-note-danger">
              This will deactivate your account and sign you out immediately.
            </div>
            <div className="form-group">
              <label className="form-label">Confirm Your Email</label>
              <input className="form-input" value={deleteEmail} onChange={e => setDeleteEmail(e.target.value)} />
            </div>
            {currentUser.auth_provider !== 'google' && (
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                />
              </div>
            )}
            <button
              className="btn btn-danger"
              onClick={deleteAccount}
              disabled={deleting || deleteEmail.toLowerCase() !== currentUser.email.toLowerCase()}
            >
              {deleting ? 'Deleting…' : 'Delete Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
