export const EstadoEnLinea = ({ source = 'network', className = '' }) => {
  const isOnlineSource = source === 'network' || source === 'online';
  const colorClass = isOnlineSource ? 'text-green-600' : 'text-yellow-700';
  const label = isOnlineSource ? 'En línea' : 'Offline';

  return (
    <div className="w-full justify-center items-center">
      <div className="max-w-6xl">
        <span className="text-xs text-gray-500">Origen:&nbsp;</span>
        <span className={`text-xs font-medium ${colorClass}`}>{label}</span>
      </div>
    </div>
  );
};
