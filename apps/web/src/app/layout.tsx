import Providers from '@/components/layout/providers';
import { Toaster } from '@/components/ui/sonner';
import { fontVariables } from '@/components/themes/font.config';
import { DEFAULT_THEME, THEMES } from '@/components/themes/theme.config';
import { isClerkEnabled } from '@/lib/clerk/flags';
import ThemeProvider from '@/components/themes/theme-provider';
import { siteConfig } from '@/lib/site';
import { cn } from '@/lib/utils';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import Script from 'next/script';
import NextTopLoader from 'nextjs-toploader';
import '../styles/globals.css';

const META_THEME_COLORS = {
  light: '#ffffff',
  dark: '#09090b'
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`
  },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  referrer: 'strict-origin-when-cross-origin',
  creator: siteConfig.name,
  publisher: siteConfig.name,
  alternates: {
    canonical: '/'
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      {
        url: '/favicon.svg',
        type: 'image/svg+xml'
      },
      {
        url: '/icon',
        type: 'image/png'
      }
    ],
    shortcut: '/favicon.svg',
    apple: '/apple-icon'
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: siteConfig.ogImageAlt
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.name,
    description: siteConfig.description,
    images: ['/twitter-image']
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: META_THEME_COLORS.light },
    { media: '(prefers-color-scheme: dark)', color: META_THEME_COLORS.dark }
  ]
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const activeThemeValue = cookieStore.get('active_theme')?.value;
  const isValidTheme = THEMES.some((t) => t.value === activeThemeValue);
  const themeToApply = isValidTheme ? activeThemeValue! : DEFAULT_THEME;
  const clerkEnabled = isClerkEnabled();
  const clerkPublishableKey = clerkEnabled
    ? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()
    : undefined;

  return (
    <html lang='en' suppressHydrationWarning data-theme={themeToApply}>
      <body
        className={cn(
          'bg-background overflow-x-hidden overscroll-none font-sans antialiased',
          fontVariables
        )}
      >
        <Script id='theme-color-sync' strategy='beforeInteractive'>
          {`
            try {
              // Keep the browser UI color aligned with the resolved theme early.
              if (
                localStorage.theme === 'dark' ||
                ((!('theme' in localStorage) || localStorage.theme === 'system') &&
                  window.matchMedia('(prefers-color-scheme: dark)').matches)
              ) {
                document
                  .querySelector('meta[name="theme-color"]')
                  ?.setAttribute('content', '${META_THEME_COLORS.dark}');
              }
            } catch (_) {}
          `}
        </Script>
        <NextTopLoader color='var(--primary)' showSpinner={false} />
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
          enableColorScheme
        >
          <Providers
            activeThemeValue={themeToApply}
            clerkEnabled={clerkEnabled}
            clerkPublishableKey={clerkPublishableKey}
          >
            <Toaster />
            {children}
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
