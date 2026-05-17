/**
 * Global footer — sits at the end of every page, just above the mobile
 * bottom-tab bar. Subtle by design (small text, muted color) so it never
 * fights with content above it.
 */
export default function Footer() {
  return (
    <footer className="mt-12 mb-4 md:mb-8 px-4 md:px-8">
      <div className="mx-auto max-w-screen-xl border-t border-border pt-4">
        <p className="text-center text-xs text-muted-foreground">
          Designed &amp; developed by{' '}
          <span className="font-600 text-foreground/80">Sohil Gupta</span>
        </p>
      </div>
    </footer>
  );
}
