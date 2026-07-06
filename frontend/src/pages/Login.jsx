import { useState } from 'react';

const CORRECT_PASSWORD = 'mohit@123';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (password === CORRECT_PASSWORD) {
      sessionStorage.setItem('auth', '1');
      onLogin();
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
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
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 pr-12"
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
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
