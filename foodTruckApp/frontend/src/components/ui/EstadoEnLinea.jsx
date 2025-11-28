import { useEffect, useState } from 'react';

export const EstadoEnLinea = ({ className = '', compact = false }) => {
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

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

  const colorText = isOnline ? 'text-emerald-600' : 'text-red-600';
  const colorBorder = isOnline ? 'border-emerald-600' : 'border-red-600';
  const colorFondo = isOnline ? 'bg-emerald-600/5' : 'bg-red-600/10';
  const label = isOnline ? 'En linea' : 'Sin conexion';
  const outerLayout = compact ? 'inline-flex items-center' : 'w-full flex justify-center items-center';
  const innerLayout = compact ? 'inline-flex items-center' : 'max-w-6xl w-full flex justify-start items-center';

  return (
    <div className={`${outerLayout} ${className}`}>
      <div className={innerLayout}>
        <div className={`rounded-md border px-3 py-2 ${colorBorder} ${colorFondo}`}>
          <span className='text-sm font-semibold text-gray-600'>Estado: </span>
          <span className={`text-sm font-semibold ${colorText}`} aria-live='polite'>
            {label}
          </span>
        </div>
      </div>
    </div>
  );
};
