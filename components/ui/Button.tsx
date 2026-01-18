import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  isLoading,
  disabled,
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center font-medium tracking-tight transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    // Solid Black/Dark Stone for primary - High Fashion/Bold
    primary: "bg-stone-900 text-white hover:bg-black focus:ring-stone-800 shadow-sm hover:shadow-md",
    // Clean white with subtle border
    secondary: "bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 focus:ring-stone-300 shadow-sm",
    ghost: "bg-transparent text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus:ring-stone-300",
    danger: "bg-rose-50 text-rose-600 hover:bg-rose-100 focus:ring-rose-500",
    outline: "border border-stone-900 text-stone-900 hover:bg-stone-50 focus:ring-stone-900"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm", // Slightly larger padding for "Bold" look
    lg: "px-6 py-3.5 text-base"
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : null}
      {children}
    </button>
  );
};