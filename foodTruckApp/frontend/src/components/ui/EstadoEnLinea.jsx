import { useEffect, useState } from 'react';

export const EstadoEnLinea = ({ className = '' }) => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const colorClass = isOnline ? 'text-green-600' : 'text-red-600';
  const label = isOnline ? 'En linea' : 'Sin conexion';

  return (
    <div className={`w-full justify-center items-center ${className}`}>
      <div className="max-w-6xl">
        <span className="text-xs text-gray-500">Estado:&nbsp;</span>
        <span
          className={`text-xs font-semibold ${colorClass}`}
          aria-live="polite"
        >
          {label}
        </span>
      </div>
    </div>
  );
};
