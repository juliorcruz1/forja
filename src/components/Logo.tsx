import { logoInner } from '../brand/logoSvg';

/** Reusable FORJA logo (pyramid of 6 flames). */
export function Logo({ size = 40, background = true, className = '' }: { size?: number; background?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="FORJA"
      dangerouslySetInnerHTML={{ __html: logoInner({ background }) }}
    />
  );
}
