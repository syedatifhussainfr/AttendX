import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
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
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const optionsRef = useRef(null);
  const activeClasses = useMemo(
    () => classes.filter((item) => item.active),
    [classes],
  );
  const filteredClasses = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return activeClasses;
    return activeClasses.filter((academicClass) =>
      [
        academicClass.displayName,
        academicClass.code,
        academicClass.course,
        academicClass.specialization,
        academicClass.semester,
        academicClass.section,
        academicClass.academicYear,
        academicClass.batch,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [activeClasses, query]);

  useEffect(() => {
    if (!open) return undefined;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const savedPageStyles = {
      bodyOverflow: document.body.style.overflow,
      bodyPaddingRight: document.body.style.paddingRight,
      htmlOverflow: document.documentElement.style.overflow,
    };
    document.body.classList.add("class-switcher-open");
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (scrollbarWidth > 0)
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    const animationFrame = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
      optionsRef.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    });
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
        rootRef.current?.querySelector(".class-switcher-trigger")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.body.classList.remove("class-switcher-open");
      document.body.style.overflow = savedPageStyles.bodyOverflow;
      document.body.style.paddingRight = savedPageStyles.bodyPaddingRight;
      document.documentElement.style.overflow = savedPageStyles.htmlOverflow;
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const containWheel = (event) => {
    const list = optionsRef.current;
    if (!list) return;
    const atTop = list.scrollTop <= 0;
    const atBottom = Math.ceil(list.scrollTop + list.clientHeight) >= list.scrollHeight;
    if (!list.contains(event.target)) {
      event.preventDefault();
      list.scrollTop += event.deltaY;
    }
    if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom))
      event.preventDefault();
    event.stopPropagation();
  };
  const navigateOptions = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const options = [...(optionsRef.current?.querySelectorAll('[role="option"]') || [])];
    if (!options.length) return;
    event.preventDefault();
    const current = options.indexOf(document.activeElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : event.key === "ArrowUp"
            ? Math.max(0, current < 0 ? options.length - 1 : current - 1)
            : Math.min(options.length - 1, current + 1);
    options[next].focus();
  };

  return (
    <>
      {open &&
        createPortal(
          <div
            className="class-switcher-backdrop"
            aria-hidden="true"
            onPointerDown={close}
            onWheel={(event) => event.preventDefault()}
          />,
          document.body,
        )}
      <div className="class-switcher" ref={rootRef}>
      <button
        type="button"
        className="class-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
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
        <div
          className="class-switcher-menu"
          onKeyDown={navigateOptions}
          onWheel={containWheel}
        >
          <header>
            <span>Switch workspace</span>
            <small>
              {filteredClasses.length === activeClasses.length
                ? `${activeClasses.length} available`
                : `${filteredClasses.length} of ${activeClasses.length}`}
            </small>
          </header>
          <label className="class-switcher-search">
            <Search />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search class, course, semester or year"
              aria-label="Search class workspaces"
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear class search"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                <X />
              </button>
            )}
          </label>
          <div
            className="class-switcher-options"
            role="listbox"
            aria-label="Choose active class"
            ref={optionsRef}
          >
            {filteredClasses.map((academicClass) => {
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
                    close();
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
            {!filteredClasses.length && (
              <div className="class-switcher-empty">
                <strong>No matching classes</strong>
                <small>Try a class code, course, section, semester, or year.</small>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </>
  );
}
