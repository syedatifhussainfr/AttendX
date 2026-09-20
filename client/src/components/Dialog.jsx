import { useEffect, useRef } from "react";
import { X } from "lucide-react";

let openDialogCount = 0;
let savedPageStyles = null;

export function Dialog({ open, title, children, onClose, actions }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    if (openDialogCount === 0) {
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      savedPageStyles = {
        bodyOverflow: document.body.style.overflow,
        bodyPaddingRight: document.body.style.paddingRight,
        htmlOverflow: document.documentElement.style.overflow,
      };
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      if (scrollbarWidth > 0)
        document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    openDialogCount += 1;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      openDialogCount = Math.max(0, openDialogCount - 1);
      if (openDialogCount === 0 && savedPageStyles) {
        document.body.style.overflow = savedPageStyles.bodyOverflow;
        document.body.style.paddingRight = savedPageStyles.bodyPaddingRight;
        document.documentElement.style.overflow = savedPageStyles.htmlOverflow;
        savedPageStyles = null;
      }
    };
  }, [open]);
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
