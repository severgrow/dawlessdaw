import type { ReactNode } from 'react';

/** Progressive disclosure for honesty notes / power-user essays. */
export function MoreInfo({
  label = 'More info',
  children,
  className = '',
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`more-info ${className}`.trim()}>
      <summary>{label}</summary>
      <div className="more-info-body">{children}</div>
    </details>
  );
}
