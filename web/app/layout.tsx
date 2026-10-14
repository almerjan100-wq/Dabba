import type { Metadata } from "next";
import "./globals.css";
import "@/utils/route-change-detector";
import { AppGenProvider } from "@/components/appgen-provider";
import { seoConfig } from "@/lib/seo.config";

// Get the home page SEO config for the root layout
const homeSEO = seoConfig['/'] || { title: 'Web App', description: 'Built with AppGen' };

export const metadata: Metadata = {
  title: homeSEO.title,
  description: homeSEO.description,
  keywords: homeSEO.keywords,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppGenProvider>{children}</AppGenProvider>
      </body>
    </html>
  );
}
