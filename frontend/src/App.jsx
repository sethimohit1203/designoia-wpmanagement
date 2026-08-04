import { Routes, Route } from 'react-router-dom';
import Layout from './layout/Layout';
import Dashboard from './pages/Dashboard';
import Numbers from './pages/Numbers';
import BulkSender from './pages/BulkSender';
import Contacts from './pages/Contacts';
import Templates from './pages/Templates';
import Campaigns from './pages/Campaigns';
import Chatbot from './pages/Chatbot';
import Analytics from './pages/Analytics';
import Sheets from './pages/Sheets';
import Groups from './pages/Groups';
import Broadcast from './pages/Broadcast';
import AutoBroadcast from './pages/AutoBroadcast';
import AddMembers from './pages/AddMembers';
import Settings from './pages/Settings';

// ⚠️ LOGIN IS TEMPORARILY DISABLED — the dashboard is open to anyone with
// this URL while the login/domain/TLS deployment gets sorted out. Login.jsx,
// ResetPassword.jsx, and the backend auth routes are untouched and still
// work; to re-enable, restore the `authed` gate below (git history has the
// exact prior version) and put requireAuth back in backend/src/server.js.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/numbers" element={<Numbers />} />
        <Route path="/bulk-sender" element={<BulkSender />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/chatbot" element={<Chatbot />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/sheets" element={<Sheets />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/broadcast" element={<Broadcast />} />
        <Route path="/auto-broadcast" element={<AutoBroadcast />} />
        <Route path="/add-members" element={<AddMembers />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
