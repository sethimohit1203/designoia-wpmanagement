// Shared stat-card used across page headers (Auto Broadcast, Numbers, etc.)
// for the "icon + label + big value + delta" summary row.
export default function StatCard({ icon, iconBg = 'bg-accent/10', iconColor = 'text-accent', label, value, delta }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${iconBg} ${iconColor}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-2xl font-bold text-gray-900 leading-tight">{value}</div>
        {delta && <div className="text-xs text-wagreen font-medium mt-0.5">{delta}</div>}
      </div>
    </div>
  );
}
