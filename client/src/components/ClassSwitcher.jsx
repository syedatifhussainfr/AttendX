import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useClass } from "../state/ClassContext.jsx";

const classMeta = (academicClass) =>
  academicClass
    ? [
        academicClass.course,
        academicClass.specialization,
        academicClass.semester && `Semester ${academicClass.semester}`,
        academicClass.academicYear,
      ]
        .filter(Boolean)
        .join(" · ")
    : "No class selected";

export function ClassSwitcher() {
  const { classes, selectedClass, selectClass } = useClass();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const activeClasses = classes.filter((item) => item.active);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector(".class-switcher-trigger")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="class-switcher" ref={rootRef}>
      <button
        type="button"
        className="class-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="class-switcher-state">
          <i /> Active workspace
        </span>
        <span className="class-switcher-copy">
          <strong>{selectedClass?.displayName || "Choose a class"}</strong>
          <small>{classMeta(selectedClass)}</small>
        </span>
        <ChevronDown className={open ? "open" : ""} />
      </button>
      {open && (
        <div className="class-switcher-menu" role="listbox" aria-label="Choose active class">
          <header>
            <span>Switch workspace</span>
            <small>{activeClasses.length} available</small>
          </header>
          <div>
            {activeClasses.map((academicClass) => {
              const selected = academicClass.id === selectedClass?.id;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={selected ? "selected" : ""}
                  key={academicClass.id}
                  onClick={() => {
                    selectClass(academicClass.id);
                    setOpen(false);
                  }}
                >
                  <span>
                    <strong>{academicClass.displayName}</strong>
                    <small>{classMeta(academicClass)}</small>
                  </span>
                  {selected && <Check />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
