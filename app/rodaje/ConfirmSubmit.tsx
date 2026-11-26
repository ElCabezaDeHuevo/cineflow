"use client";

import type { ReactNode } from "react";

export default function ConfirmSubmit({ children, message, className }: { children: ReactNode; message: string; className?: string }) {
  return <button type="submit" className={className} onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}>{children}</button>;
}
