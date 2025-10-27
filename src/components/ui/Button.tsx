import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';

interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  to?: string;
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  disabled?: boolean;
}

const PATH_TO_KEY: Record<string, keyof import('../../contexts/FeatureFlagsContext').PageKey | string> = {
  '/': 'home',
  '/portfolio': 'portfolio',
  '/portrait': 'portrait',
  '/maternity': 'maternity',
  '/events': 'events',
  '/contact': 'contact',
  '/booking': 'booking',
  '/store': 'store',
  '/admin': 'admin',
  '/dashboard': 'clientDashboard',
  '/packages-admin': 'packagesAdmin',
  '/admin-store': 'admin'
};

export const Button = ({
  children,
  variant = 'primary',
  to,
  href,
  onClick,
  type = 'button',
  className = '',
  disabled = false
}: ButtonProps) => {
  const { flags } = useFeatureFlags();

  const baseClasses = variant === 'primary'
    ? 'btn-primary'
    : 'btn-secondary';

  // If this is a link to a page that is disabled, render nothing
  if (to) {
    const key = PATH_TO_KEY[to];
    if (key && !(flags.pages as any)[key]) {
      return null;
    }
    return (
      <Link to={to} className={`${baseClasses} ${className} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {children}
      </Link>
    );
  }

  // External link (always render)
  if (href) {
    return (
      <a
        href={href}
        className={`${baseClasses} ${className} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={disabled}
      >
        {children}
      </a>
    );
  }

  // Regular button
  return (
    <button
      type={type}
      className={`${baseClasses} ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
    >
      {children}
    </button>
  );
};

export default Button;
