import localFont from 'next/font/local';
import { BrandLogo } from '@/components/app/brand-logo';
import { SceneBackground } from '@/components/app/scene-background';
import { ThemeProvider } from '@/components/app/theme-provider';
import { resolveDesign, themeForDesign } from '@/lib/design/design';
import { DesignProvider } from '@/lib/design/design-context';
import { cn } from '@/lib/shadcn/utils';
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
  // Default design comes from the DESIGN env var (runtime, server-side); a
  // stored in-UI choice overrides it on the client (see DesignProvider + the
  // no-flash script below).
  const design = resolveDesign(process.env.DESIGN);
  const initialTheme = themeForDesign(design);

  return (
    <html
      lang="en"
      data-design={design}
      suppressHydrationWarning
      className={cn(
        publicSans.variable,
        commitMono.variable,
        'scroll-smooth font-sans antialiased'
      )}
    >
      <head>
        {/* Apply a stored design choice before paint to avoid a flash of the
            env-default palette. next-themes handles the light/dark class. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var d=localStorage.getItem('voice-agent.design');if(d==='dark-green'||d==='light'||d==='dark'){document.documentElement.dataset.design=d;}}catch(e){}})();",
          }}
        />
        <title>Huawei</title>
        <meta name="description" content="ElevenLabs voice assistant" />
      </head>
      <body className="overflow-x-hidden">
        <ThemeProvider
          attribute="class"
          defaultTheme={initialTheme}
          enableSystem={false}
          disableTransitionOnChange
        >
          <DesignProvider initialDesign={design}>
            <SceneBackground />
            {/* Huawei logo (top-left). The wordmark follows the design palette
                (--ink) while the flower keeps its brand red — see BrandLogo. */}
            <div className="fixed top-5 left-6 z-40 text-(--ink)">
              <BrandLogo title="Huawei" className="block h-9 w-auto" />
            </div>
            {children}
            <footer className="font-chakra pointer-events-none fixed inset-x-0 bottom-2 z-30 text-center text-[10px] tracking-[0.12em] text-(--ink-soft) opacity-70">
              ©2026 Huawei Device Co., Ltd. Bütün hakları saklıdır.
            </footer>
          </DesignProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
