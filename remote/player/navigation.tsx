import type { AnchorHTMLAttributes } from "react";

// The rehearsal bundle uses full-page navigation and the existing player pages.
// It does not load Next's host application, authentication UI, or development server.
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}

const router = {
  replace: (url: string) => window.location.replace(url),
  push: (url: string) => window.location.assign(url),
};
export const useRouter = () => router;
let search: URLSearchParams | undefined;
export const useSearchParams = () => search ??= new URLSearchParams(window.location.search);
