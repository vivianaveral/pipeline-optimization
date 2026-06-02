import "./globals.css";

export const metadata = {
  title: "BruntWork Sales Initiative KPI Tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
