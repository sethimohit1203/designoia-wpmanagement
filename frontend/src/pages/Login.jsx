import { useState } from 'react';
import api from '../api/client';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { password });
      sessionStorage.setItem('token', data.token);
      onLogin();
    } catch (err) {
      setError(err.response?.data?.error || 'Incorrect password. Please try again.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot() {
    setForgotLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password');
      setForgotSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send reset link');
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">💬</div>
          <h1 className="text-2xl font-bold text-gray-800">ClikixPress</h1>
          <p className="text-gray-500 text-sm mt-1">WhatsApp Automation Dashboard</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent pr-12"
              placeholder="Enter password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              autoFocus
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              onClick={() => setShow((s) => !s)}
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent/90 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Signing In…' : 'Sign In'}
          </button>
        </form>
        <div className="text-center mt-4">
          {forgotSent ? (
            <p className="text-xs text-green-600">Reset link sent — check the admin inbox (link expires in 15 min).</p>
          ) : (
            <button
              type="button"
              onClick={handleForgot}
              disabled={forgotLoading}
              className="text-xs text-gray-400 hover:text-accent disabled:opacity-60"
            >
              {forgotLoading ? 'Sending…' : 'Forgot password?'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
