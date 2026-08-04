import { useState } from 'react';
import api from '../api/client';

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters');
    if (newPassword !== confirm) return setError('Passwords do not match');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed — the link may have expired');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🔑</div>
          <h1 className="text-2xl font-bold text-gray-800">Reset Password</h1>
          <p className="text-gray-500 text-sm mt-1">ClikixPress Dashboard</p>
        </div>

        {!token ? (
          <p className="text-sm text-red-500 text-center">
            No reset token found in the link. Go back to the login page and request a new reset link.
          </p>
        ) : done ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-green-600">Password updated. You can log in now.</p>
            <a href="/" className="inline-block text-sm text-teal-600 hover:underline">Back to login</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="New password (min 8 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
            />
            <input
              type="password"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? 'Updating…' : 'Set New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
