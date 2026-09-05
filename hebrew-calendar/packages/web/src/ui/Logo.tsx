interface Props {
  /** Rendered size in pixels. The mark is drawn to stay legible down to 16. */
  size?: number;
  /** Set when a nearby element already names the product. */
  decorative?: boolean;
}

/**
 * The mark: a crescent moon above a horizon.
 *
 * The Hebrew calendar is lunisolar, which is *why* its dates move against the
 * civil one — so the moon states the reason the product exists rather than the
 * category it sits in. The horizon is the sunset the Hebrew day turns on, in
 * the warm tone the interface already uses for holidays and candle-lighting.
 *
 * Two shapes only, both filled: a stroked arc would read as the letter C at
 * small sizes, and a crescent that tapers to points does not.
 */
export function Logo({ size = 28, decorative = false }: Props) {
  return (
    <svg
      className="brand-logo"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'מועד'}
      focusable="false"
    >
      <path d="M40 12 A21 21 0 1 0 40 52 A25 25 0 0 1 40 12 Z" fill="currentColor" />
      <rect x="9" y="53" width="46" height="5" rx="2.5" fill="var(--holiday)" />
    </svg>
  );
}
