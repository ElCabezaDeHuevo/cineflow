"use client";

import type { ReactNode } from "react";

type ServerAction = (formData: FormData) => void | Promise<void>;

export default function ConfirmSubmit({
  action,
  message,
  className,
  children,
}: {
  action: ServerAction;
  message: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
