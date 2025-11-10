export const Button = ({
  children,
  onClick,
  type = 'button',
  disabled = false,
  color = 'primario',
  size = 'md',
  withFocusRing = true,
  className = '',
}) => {
  const baseClasses = `
    inline-flex items-center justify-center font-semibold rounded-md
    transition-transform duration-200 ease-in-out
    outline-none focus:outline-none focus-visible:outline-none
    disabled:opacity-60 disabled:cursor-not-allowed
  `;

  const focusClasses = withFocusRing
    ? 'focus-visible:ring-2 focus-visible:ring-offset-2'
    : 'focus-visible:ring-0 ring-0';

  const colorClasses = {
    primario: 'bg-primario text-white hover:scale-105 focus-visible:ring-primario/50',
    secundario: 'bg-secundario text-white hover:scale-105 focus-visible:ring-secundario/50',
    info: 'bg-info text-white hover:scale-105 focus-visible:ring-info/50',
    peligro: 'bg-peligro text-white hover:scale-105 focus-visible:ring-peligro/50',
    neutral: 'bg-gray-200 text-gray-800 hover:scale-105 focus-visible:ring-gray-400/50',
  }[color];

  const sizeClasses = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-md',
    lg: 'px-5 py-3 text-lg',
  }[size];

  const handleClick = (e) => {
    if (type !== 'submit') {
      e.preventDefault?.();
    }
    e.stopPropagation?.();
    onClick?.(e);
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled}
      className={`${baseClasses} ${focusClasses} ${colorClasses} ${sizeClasses} ${className}`}
    >
      {children}
    </button>
  );
};

