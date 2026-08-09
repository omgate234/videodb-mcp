import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "VideoDB MCP Server",
  description:
    "Connect Claude to VideoDB — upload, index, search, edit, and stream videos from your VideoDB collections.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
