import { useState, type ReactNode } from 'react';

/** One-sentence lead + optional ? how-to expand. */
export function HowTo({
  sentence,
  children,
}: {
  sentence: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="howto">
      <p className="lead howto-lead">
        {sentence}{' '}
        {children ? (
          <button
            type="button"
            className="howto-q"
            aria-expanded={open}
            aria-label="How to"
            title="How to"
            onClick={() => setOpen((v) => !v)}
          >
            ?
          </button>
        ) : null}
      </p>
      {open && children ? <div className="howto-body muted small">{children}</div> : null}
    </div>
  );
}
