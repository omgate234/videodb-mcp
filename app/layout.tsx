import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SITE } from "./site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.origin),
  title: {
    default: SITE.title,
    template: "%s · VideoDB MCP Server",
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "VideoDB MCP server",
    "MCP server",
    "Model Context Protocol",
    "remote MCP",
    "Claude connector",
    "Claude MCP",
    "Claude Code MCP",
    "Cursor MCP",
    "video search AI",
    "video indexing",
    "video RAG",
    "video transcription",
    "highlight reel",
    "clip generation",
    "RTSP stream analysis",
    "Streamable HTTP",
    "OAuth 2.1",
    "VideoDB",
  ],
  authors: [{ name: "VideoDB", url: SITE.links.videodb }],
  creator: "VideoDB",
  publisher: "Spext Labs Inc. (VideoDB)",
  category: "technology",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    url: SITE.origin,
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    site: "@videodb_io",
    creator: "@videodb_io",
    title: SITE.title,
    description: SITE.description,
  },
  other: {
    "mcp:endpoint": SITE.endpoint,
    "mcp:transport": "streamable-http",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
