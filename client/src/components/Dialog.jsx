import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

let openDialogCount = 0;
let savedPageStyles = null;
let savedRootState = null;
const dialogStack = [];

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const focusableInside = (container) =>
  [...container.querySelectorAll(focusableSelector)].filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );

export function Dialog({ open, title, children, onClose, actions }) {
  const onCloseRef = useRef(onClose);
  const dialogRef = useRef(null);
  const dialogToken = useRef(Symbol("dialog"));
  const returnFocusRef = useRef(null);
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const token = dialogToken.current;
    returnFocusRef.current = document.activeElement;
    dialogStack.push(token);
    if (openDialogCount === 0) {
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      const appRoot = document.getElementById("root");
      savedPageStyles = {
        bodyOverflow: document.body.style.overflow,
        bodyPaddingRight: document.body.style.paddingRight,
        htmlOverflow: document.documentElement.style.overflow,
      };
      savedRootState = appRoot
        ? {
            element: appRoot,
            inert: appRoot.inert,
            ariaHidden: appRoot.getAttribute("aria-hidden"),
          }
        : null;
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      if (scrollbarWidth > 0)
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      if (appRoot) {
        appRoot.inert = true;
        appRoot.setAttribute("aria-hidden", "true");
      }
    }
    openDialogCount += 1;
    const isTopDialog = () => dialogStack.at(-1) === token;
    const focusDialog = () => {
      if (!isTopDialog() || !dialogRef.current) return;
      const initial =
        dialogRef.current.querySelector("[data-dialog-initial-focus]") ||
        focusableInside(dialogRef.current)[0] ||
        dialogRef.current;
      initial.focus({ preventScroll: true });
    };
    const animationFrame = window.requestAnimationFrame(focusDialog);
    const containFocus = (event) => {
      if (!isTopDialog() || !dialogRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableInside(dialogRef.current);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialogRef.current.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", containFocus, true);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", containFocus, true);
      const stackIndex = dialogStack.lastIndexOf(token);
      if (stackIndex !== -1) dialogStack.splice(stackIndex, 1);
      openDialogCount = Math.max(0, openDialogCount - 1);
      if (openDialogCount === 0 && savedPageStyles) {
        document.body.style.overflow = savedPageStyles.bodyOverflow;
        document.body.style.paddingRight = savedPageStyles.bodyPaddingRight;
        document.documentElement.style.overflow = savedPageStyles.htmlOverflow;
        if (savedRootState?.element) {
          savedRootState.element.inert = savedRootState.inert;
          if (savedRootState.ariaHidden == null)
            savedRootState.element.removeAttribute("aria-hidden");
          else
            savedRootState.element.setAttribute(
              "aria-hidden",
              savedRootState.ariaHidden,
            );
        }
        savedPageStyles = null;
        savedRootState = null;
      }
      const returnTarget = returnFocusRef.current;
      if (
        openDialogCount === 0 &&
        returnTarget?.isConnected &&
        typeof returnTarget.focus === "function"
      )
        window.requestAnimationFrame(() =>
          returnTarget.focus({ preventScroll: true }),
        );
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget &&
        dialogStack.at(-1) === dialogToken.current &&
        onClose()
      }
    >
      <section
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {actions && <footer>{actions}</footer>}
      </section>
    </div>,
    document.body,
  );
}
