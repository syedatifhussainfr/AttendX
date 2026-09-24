import { useEffect, useId, useRef, useState } from "react";

const blockClipboardEntry = (event) => {
  event.preventDefault();
  const input = event.currentTarget;
  input.setCustomValidity("Clipboard entry is disabled here. Type the value manually.");
  input.reportValidity();
  window.setTimeout(() => input.setCustomValidity(""), 1800);
};

export function ManualEntryInput({
  id,
  type = "password",
  expected,
  name,
  value,
  defaultValue = "",
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  onBeforeInput,
  ...props
}) {
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState(String(value ?? defaultValue ?? ""));
  const generatedId = useId().replace(/[^a-z0-9]/gi, "");
  const inputRef = useRef(null);
  const renderedValue = String(value ?? typed);
  const passwordField = type === "password";
  const domId = `manual-entry-${generatedId}`;
  const statusId = `${domId}-typing-status`;
  const matched = expected && renderedValue === expected;

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return undefined;
    const priorAutocomplete = form.getAttribute("autocomplete");
    const priorFormType = form.getAttribute("data-form-type");
    form.setAttribute("autocomplete", "off");
    form.setAttribute("data-form-type", "other");
    return () => {
      if (priorAutocomplete == null) form.removeAttribute("autocomplete");
      else form.setAttribute("autocomplete", priorAutocomplete);
      if (priorFormType == null) form.removeAttribute("data-form-type");
      else form.setAttribute("data-form-type", priorFormType);
    };
  }, []);

  return (
    <>
      <input
        {...props}
        ref={inputRef}
        id={domId}
        type="text"
        name={undefined}
        value={renderedValue}
        className={[
          "manual-entry-input",
          passwordField && "manual-entry-secret",
          props.className,
        ]
          .filter(Boolean)
          .join(" ")}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
        readOnly={!armed}
        data-attendx-field={id}
        data-1p-ignore="true"
        data-bwignore="true"
        data-lpignore="true"
        data-protonpass-ignore="true"
        data-dashlane-ignore="true"
        data-form-type="other"
        aria-describedby={expected ? statusId : props["aria-describedby"]}
        onKeyDown={(event) => {
          onKeyDown?.(event);
        }}
        onBeforeInput={(event) => {
          if (event.nativeEvent?.inputType === "insertReplacementText") {
            event.preventDefault();
            return;
          }
          onBeforeInput?.(event);
        }}
        onChange={(event) => {
          setTyped(event.target.value);
          onChange?.(event);
        }}
        onFocus={(event) => {
          setArmed(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setArmed(false);
          onBlur?.(event);
        }}
        onPaste={blockClipboardEntry}
        onDrop={blockClipboardEntry}
      />
      {name && <input type="hidden" name={name} value={renderedValue} />}
      {expected && (
        <small
          id={statusId}
          className={`manual-entry-status ${matched ? "matched" : ""}`}
          role="status"
        >
          {matched
            ? "Phrase matched"
            : `Type manually · ${Math.min(renderedValue.length, expected.length)}/${expected.length}`}
        </small>
      )}
    </>
  );
}
