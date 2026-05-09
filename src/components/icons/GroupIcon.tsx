import React from "react";

export function GroupIconBlue({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="100" height="100" rx="25" fill="#2563EB" />
      <path 
        d="M35 55C35 49.4772 39.4772 45 45 45C50.5228 45 55 49.4772 55 55V60H35V55Z" 
        fill="white" 
      />
      <circle cx="45" cy="35" r="7" fill="white" />
      <path 
        d="M55 58C55 53.5817 58.5817 50 63 50C67.4183 50 71 53.5817 71 58V62H55V58Z" 
        fill="white" 
        style={{ opacity: 0.8 }}
      />
      <circle cx="63" cy="42" r="6" fill="white" style={{ opacity: 0.8 }} />
    </svg>
  );
}
