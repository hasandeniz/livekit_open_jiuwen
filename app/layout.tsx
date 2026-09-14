import localFont from 'next/font/local';
import { FocusBehavior } from '@/components/app/focus-behavior';
import { ThemeProvider } from '@/components/app/theme-provider';
import { DEFAULT_DESIGN, themeForDesign } from '@/lib/design/design';
import { DesignProvider } from '@/lib/design/design-context';
import { cn } from '@/lib/shadcn/utils';
import '@/styles/assistant.css';
import '@/styles/globals.css';

const publicSans = localFont({
  src: [
    {
      path: '../fonts/PublicSans-VariableFont_wght.ttf',
      weight: '100 900',
      style: 'normal',
    },
    {
      path: '../fonts/PublicSans-Italic-VariableFont_wght.ttf',
      weight: '100 900',
      style: 'italic',
    },
  ],
  variable: '--font-public-sans',
  display: 'swap',
});

const commitMono = localFont({
  display: 'swap',
  variable: '--font-commit-mono',
  src: [
    {
      path: '../fonts/CommitMono-400-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/CommitMono-700-Regular.otf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../fonts/CommitMono-400-Italic.otf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../fonts/CommitMono-700-Italic.otf',
      weight: '700',
      style: 'italic',
    },
  ],
});

interface RootLayoutProps {
  children: React.ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  // The product uses one fixed dark theme.
  const design = DEFAULT_DESIGN;
  const initialTheme = themeForDesign(design);

  return (
    <html
      lang="tr"
      data-design={design}
      suppressHydrationWarning
      className={cn(
        publicSans.variable,
        commitMono.variable,
        'scroll-smooth font-sans antialiased'
      )}
    >
      <head>
        {/* Set the fixed palette before paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.dataset.design='dark';",
          }}
        />
        <title>Digital Human · Huawei</title>
        <meta name="description" content="ElevenLabs voice assistant" />
      </head>
      <body className="overflow-x-hidden">
        <FocusBehavior />
        <ThemeProvider
          attribute="class"
          defaultTheme={initialTheme}
          enableSystem={false}
          disableTransitionOnChange
        >
          <DesignProvider initialDesign={design}>{children}</DesignProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
