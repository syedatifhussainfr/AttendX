import { useState } from "react";

const blockClipboardEntry = (event) => {
  event.preventDefault();
  const input = event.currentTarget;
  input.setCustomValidity("Clipboard entry is disabled here. Type the value manually.");
  input.reportValidity();
  window.setTimeout(() => input.setCustomValidity(""), 1800);
};

export function ManualEntryInput({ id, type = "password", expected, ...props }) {
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const matched = expected && typed === expected;
  return (
    <>
      <input
        {...props}
        id={id}
        type={type}
        className={["manual-entry-input", props.className]
          .filter(Boolean)
          .join(" ")}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck="false"
        readOnly={!armed}
        data-1p-ignore="true"
        data-bwignore="true"
        data-lpignore="true"
        data-form-type="other"
        aria-describedby={expected ? `${id}-typing-status` : props["aria-describedby"]}
        onChange={(event) => {
          setTyped(event.target.value);
          props.onChange?.(event);
        }}
        onFocus={(event) => {
          setArmed(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setArmed(false);
          props.onBlur?.(event);
        }}
        onPaste={blockClipboardEntry}
        onDrop={blockClipboardEntry}
      />
      {expected && (
        <small
          id={`${id}-typing-status`}
          className={`manual-entry-status ${matched ? "matched" : ""}`}
          role="status"
        >
          {matched
            ? "Phrase matched"
            : `Type manually · ${Math.min(typed.length, expected.length)}/${expected.length}`}
        </small>
      )}
    </>
  );
}
