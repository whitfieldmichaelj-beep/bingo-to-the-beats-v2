"use client";

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

type PanelProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  as?: "section" | "aside" | "article" | "div";
};

export function BttbPanel({
  as = "section",
  className = "",
  children,
  ...props
}: PanelProps) {
  const Component = as;

  return (
    <Component
      className={`bttb-panel ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

type ButtonVariant =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "info";

type ButtonProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    icon?: ReactNode;
  };

export function BttbButton({
  variant = "secondary",
  icon,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`bttb-button bttb-button--${variant} ${className}`.trim()}
      {...props}
    >
      {icon && (
        <span className="bttb-button__icon">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </button>
  );
}

type StatProps = {
  label: string;
  value: ReactNode;
  hint?: string;
};

export function BttbStat({
  label,
  value,
  hint,
}: StatProps) {
  return (
    <article className="bttb-stat">
      <span className="bttb-stat__label">
        {label}
      </span>
      <strong className="bttb-stat__value">
        {value}
      </strong>
      {hint && (
        <small className="bttb-stat__hint">
          {hint}
        </small>
      )}
    </article>
  );
}

type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export function BttbBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`bttb-badge bttb-badge--${tone}`}
    >
      {children}
    </span>
  );
}
