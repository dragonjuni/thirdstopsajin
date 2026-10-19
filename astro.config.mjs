// @ts-check
import { defineConfig } from 'astro/config';

// English lives at the root and Korean under /ko/. The routes do this
// themselves (see src/pages/[...lang]/), so Astro's i18n option is not used.
export default defineConfig({
  site: 'https://thirdstopsajin.com',
  // Two routes producing the same URL must fail the build, not just warn.
  prerenderConflictBehavior: 'error',
  image: {
    // Every photo, including those in Markdown, gets a srcset.
    layout: 'constrained',
    responsiveStyles: true,
    // Fewer sizes per photo keeps the site under GitHub Pages' 1 GB cap.
    // A ~2000px export becomes 640, 1080, 1600 and its own width.
    breakpoints: [640, 1080, 1600],
  },
});
