"use client";

import { useId } from "react";

export default function LocalDateTimeField({ name, required, className }: {
  name: string; required?: boolean; className: string;
}) {
  const id = useId();
  return <>
    <input id={id} name={name + "_local"} type="datetime-local" required={required} className={className}
      onInput={event => {
        const input = event.currentTarget;
        const hidden = input.form?.elements.namedItem(name);
        if (hidden instanceof HTMLInputElement) {
          hidden.value = input.value && Number.isFinite(Date.parse(input.value)) ? new Date(input.value).toISOString() : "";
        }
      }} />
    <input type="hidden" name={name} />
  </>;
}
