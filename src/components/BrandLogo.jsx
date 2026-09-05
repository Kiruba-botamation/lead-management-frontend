import React, { useState } from 'react';
import {
    BRAND_LOGO_TRANSPARENT_BACKGROUND,
    BRAND_NAME,
    getBrandLogoSrc,
} from '../utils/brandAssets';

/**
 * Renders the brand logo image.
 * Falls back to a text-initial avatar if the URL is empty or the image fails to load.
 */
const defaultClassName = [
    'w-8 h-8 p-0.5 object-contain rounded-lg shadow-lg',
    BRAND_LOGO_TRANSPARENT_BACKGROUND ? 'bg-transparent' : 'bg-white',
].join(' ');

const BrandLogo = ({ className = defaultClassName }) => {
    const src = getBrandLogoSrc();
    const [failed, setFailed] = useState(false);

    if (src && !failed) {
        return (
            <img
                src={src}
                alt={`${BRAND_NAME} Logo`}
                className={className}
                referrerPolicy="no-referrer"
                onError={() => {
                    console.error('[BrandLogo] Failed to load logo from:', src);
                    setFailed(true);
                }}
            />
        );
    }

    // Fallback: brand name initial in a styled box
    return (
        <div
            className="w-8 h-8 rounded-lg shadow-lg flex items-center justify-center bg-gray-700 text-white font-bold text-base select-none flex-shrink-0"
            title={BRAND_NAME}
        >
            {BRAND_NAME.charAt(0).toUpperCase()}
        </div>
    );
};

export default BrandLogo;
