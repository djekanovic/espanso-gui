interface Props {
  size?: number
  className?: string
}

// Dark, fixed background (not theme-tinted) so it always has strong
// contrast, keeping espanso's own flowing "trail" path from their icon
// mark as a subtle accent flourish behind a plain "G" (for GUI) monogram.
export default function Logo({ size = 28, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="18 21 50 50"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <rect x="18" y="21" width="50" height="50" rx="9" fill="var(--bg-tertiary)" stroke="var(--border-light)" strokeWidth="1" />
      <path
        d="M41.915 39.9014C31.9366 40.5752 28.1605 35.4357 25.2559 32.8699C23.6156 48.7153 28.0922 50.9599 32.9447 53.2006C37.7972 55.4413 49.3816 50.909 56.4554 53.5727C56.0965 42.291 51.8933 39.2277 41.915 39.9014Z"
        fill="var(--accent-secondary)"
        opacity="0.4"
      />
      <text
        x="43.5"
        y="48"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-sans)"
        fontWeight="800"
        fontSize="32"
        fill="var(--accent)"
      >
        G
      </text>
    </svg>
  )
}
