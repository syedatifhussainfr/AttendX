import { X } from "lucide-react";
export function Dialog({ open, title, children, onClose, actions }) {
  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="dialog" role="dialog" aria-modal="true">
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {actions && <footer>{actions}</footer>}
      </section>
    </div>
  );
}
