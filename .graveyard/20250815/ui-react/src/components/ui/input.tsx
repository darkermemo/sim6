import React from 'react'

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string }

export function Input({ label, className = '', ...props }: InputProps) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>}
      <input className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white ${className}`} {...props} />
    </div>
  )
}


