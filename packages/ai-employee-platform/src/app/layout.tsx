import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Crews — AI Workforce Platform",
  description: "Hire, onboard, and manage AI employees for your business",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        {children}
      </body>
    </html>
  )
}
