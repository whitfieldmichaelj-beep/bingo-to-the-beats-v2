import type {
  HTMLAttributes,
  ReactNode,
} from "react";

type PanelProps =
  HTMLAttributes<HTMLElement> & {
    children: ReactNode;
  };

export default function Panel({
  className = "",
  children,
  ...props
}: PanelProps) {
  return (
    <section
      className={`bttb-panel ${className}`.trim()}
      {...props}
    >
      {children}
    </section>
  );
}
