/**
 * Brand Assets Utility
 *
 * Reads brand name, logo URL and favicon URL from Vite env variables.
 * The browser's HTTP cache (driven by S3 Cache-Control headers) handles
 * caching automatically — no manual fetch or data-URL conversion needed.
 *
 * Exposed values:
 *   BRAND_NAME       – string, e.g. "Botamation"
 *   getBrandLogoSrc  – () => string  (returns the logo URL from env)
 *   initBrandAssets  – () => void    call once at app startup
 */

export const BRAND_NAME = import.meta.env.VITE_BRAND_NAME || 'App';
export const BRAND_LOGO_TRANSPARENT_BACKGROUND =
    import.meta.env.VITE_BRAND_LOGO_TRANSPARENT_BACKGROUND === 'true';
const BRAND_LOGO_URL = import.meta.env.VITE_BRAND_LOGO_URL || '';
const BRAND_FAVICON_URL = import.meta.env.VITE_BRAND_FAVICON_URL || '';

/** Returns the logo URL declared in the environment. */
export function getBrandLogoSrc() {
    return BRAND_LOGO_URL;
}

/**
 * Call once at app startup (e.g. in main.jsx before render).
 * Sets the page title and injects the favicon <link> if not already present.
 * Also cleans up any legacy cached data-URLs stored by older versions.
 */
export function initBrandAssets() {
    // Clean up legacy localStorage keys from old caching approach
    ['brandLogoDataUrl', 'brandFaviconDataUrl', 'brandLogoSrc', 'brandFaviconSrc'].forEach(
        (k) => localStorage.removeItem(k)
    );

    document.title = BRAND_NAME;

    if (!BRAND_LOGO_URL) {
        console.warn('[BrandAssets] VITE_BRAND_LOGO_URL is not set — logo will not be displayed.');
    }

    if (BRAND_FAVICON_URL) {
        fetch(BRAND_FAVICON_URL, { referrerPolicy: 'no-referrer' })
            .then((res) => res.blob())
            .then((blob) => {
                const blobUrl = URL.createObjectURL(blob);
                let link = document.querySelector("link[rel~='icon']");
                if (!link) {
                    link = document.createElement('link');
                    link.rel = 'icon';
                    document.head.appendChild(link);
                }
                link.href = blobUrl;
            })
            .catch(() => {
                console.warn('[BrandAssets] Could not load favicon from:', BRAND_FAVICON_URL);
            });
    }
}
