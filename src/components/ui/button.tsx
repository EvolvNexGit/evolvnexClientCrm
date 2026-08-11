import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
};

export function Button({
  className,
  variant = "primary",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-base font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 xl:min-h-0",

        // 🔴 PRIMARY (main CTA)
        variant === "primary" &&
          "bg-primary text-white hover:bg-primary/90 shadow-redGlow",

        // ⚫ SECONDARY (subtle surface button)
        variant === "secondary" &&
          "bg-card text-text border border-border hover:bg-muted",

        // 👻 GHOST (minimal)
        variant === "ghost" &&
          "bg-transparent text-muted-foreground hover:bg-muted hover:text-text",

        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
