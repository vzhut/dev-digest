"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

/* Model/repo text is untrusted: raw HTML is skipped (no rehype-raw), anchors are
   plain spans (nothing clickable) and images never load (no remote fetch). */
const COMPONENTS: Components = {
  a: ({ children }) => <span>{children}</span>,
  img: ({ alt }) => <span>{alt}</span>,
};

export function TourMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}
