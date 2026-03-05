/**
 * Compresses an image File/Blob to a target size.
 *
 * @param {File} file              - The original image file (JPEG or PNG)
 * @param {number} maxSizeKB       - Target maximum size in KB (default: 100)
 * @param {number} maxWidthOrHeight - Cap the longest edge in pixels (default: 1920)
 * @returns {Promise<File>}        - Compressed File with the same name and MIME type
 */
export async function compressImage(file, maxSizeKB = 100, maxWidthOrHeight = 1920) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onerror = () => reject(new Error('Failed to read image file.'));

        reader.onload = (e) => {
            const img = new Image();

            img.onerror = () => reject(new Error('Failed to load image for compression.'));

            img.onload = () => {
                // ── Scale down while preserving aspect ratio ───────────────
                let { width, height } = img;
                if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
                    if (width > height) {
                        height = Math.round((height * maxWidthOrHeight) / width);
                        width = maxWidthOrHeight;
                    } else {
                        width = Math.round((width * maxWidthOrHeight) / height);
                        height = maxWidthOrHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // ── Iteratively reduce quality until under maxSizeKB ──────
                const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                const targetBytes = maxSizeKB * 1024;

                const tryCompress = (quality) => {
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) {
                                reject(new Error('Canvas toBlob failed.'));
                                return;
                            }

                            // PNG is lossless — can't reduce quality; just return it
                            if (outputType === 'image/png' || blob.size <= targetBytes || quality <= 0.1) {
                                const compressed = new File([blob], file.name, {
                                    type: outputType,
                                    lastModified: Date.now(),
                                });
                                resolve(compressed);
                            } else {
                                // Reduce quality by 10% per iteration
                                tryCompress(Math.max(quality - 0.1, 0.1));
                            }
                        },
                        outputType,
                        quality
                    );
                };

                tryCompress(0.9);
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    });
}
