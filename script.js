class ImageExtractor {
    constructor() {
        this.websiteUrl = document.getElementById('websiteUrl');
        this.extractBtn = document.getElementById('extractBtn');
        this.resultsSection = document.getElementById('resultsSection');
        this.errorSection = document.getElementById('errorSection');
        this.loadingSection = document.getElementById('loadingSection');
        this.imagesTableBody = document.getElementById('imagesTableBody');
        this.imageCount = document.getElementById('imageCount');
        this.errorText = document.getElementById('errorText');
        this.useBrowserToggle = document.getElementById('useBrowserToggle');
        this.extractionStatus = document.getElementById('extractionStatus');
        
        this.bindEvents();
        this.updateExtractionStatus();
    }

    bindEvents() {
        this.extractBtn.addEventListener('click', () => this.extractImages());
        this.websiteUrl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.extractImages();
            }
        });
        this.useBrowserToggle.addEventListener('change', () => this.updateExtractionStatus());
    }

    updateExtractionStatus() {
        const useBrowser = this.useBrowserToggle.checked;
        const statusIndicator = this.extractionStatus.querySelector('.status-indicator');
        
        if (useBrowser) {
            statusIndicator.className = 'status-indicator browser';
            statusIndicator.textContent = '🌐 Browser extraction enabled (handles lazy loading)';
        } else {
            statusIndicator.className = 'status-indicator simple';
            statusIndicator.textContent = '📄 Simple extraction (faster, may miss lazy-loaded images)';
        }
    }

    async extractImages() {
        const url = this.websiteUrl.value.trim();
        
        if (!url) {
            this.showError('Please enter a valid website URL');
            return;
        }

        if (!this.isValidUrl(url)) {
            this.showError('Please enter a valid URL starting with http:// or https://');
            return;
        }

        this.setLoading(true);
        this.hideError();
        this.hideResults();

        try {
            const images = await this.fetchImagesFromWebsite(url);
            this.displayResults(images);
        } catch (error) {
            console.error('Error extracting images:', error);
            this.showError(`Failed to extract images: ${error.message}`);
        } finally {
            this.setLoading(false);
        }
    }

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    async fetchImagesFromWebsite(url) {
        const useBrowser = this.useBrowserToggle.checked;
        
        // First, try server-side extraction (most reliable)
        try {
            const response = await fetch(`/api/extract-images?url=${encodeURIComponent(url)}&useBrowser=${useBrowser}`);
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.images && data.images.length > 0) {
                    // Check if fallback was used
                    if (data.fallbackUsed) {
                        console.log('⚠️ Browser extraction failed, using simple extraction fallback');
                        // You could show a notification to the user here
                    }
                    return data.images;
                }
            }
        } catch (error) {
            console.log('Server-side extraction failed, trying client-side methods...');
        }

        // Fallback to client-side methods only if browser extraction is disabled
        if (!useBrowser) {
            // Fallback to client-side methods
            // First, try direct fetch (some sites allow it)
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    mode: 'cors',
                    timeout: 10000
                });
                
                if (response.ok) {
                    const html = await response.text();
                    const images = this.parseImagesFromHtml(html, url);
                    if (images && images.length > 0) {
                        return images;
                    }
                }
            } catch (error) {
                console.log('Direct fetch failed, trying proxies...');
            }

            // Try multiple approaches to handle CORS issues
            const approaches = [
                () => this.fetchWithCorsProxy(url),
                () => this.fetchWithAllOrigins(url),
                () => this.fetchWithCorsAnywhere(url),
                () => this.fetchWithJsonp(url)
            ];

            const errors = [];

            for (const approach of approaches) {
                try {
                    const images = await approach();
                    if (images && images.length > 0) {
                        return images;
                    }
                } catch (error) {
                    console.warn('Approach failed:', error.message);
                    errors.push(error.message);
                    continue;
                }
            }

            const errorMessage = `Unable to fetch images from the website. All methods failed:\n${errors.join('\n')}\n\nTry using a different website or check if the website allows cross-origin requests.`;
            throw new Error(errorMessage);
        } else {
            throw new Error('Browser extraction failed. The system will automatically try simple extraction as a fallback. If you continue to have issues, try disabling browser extraction for a faster approach.');
        }
    }

    async fetchWithCorsProxy(url) {
        // Using a CORS proxy service
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'text/html',
            },
            timeout: 15000
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        return this.parseImagesFromHtml(html, url);
    }

    async fetchWithAllOrigins(url) {
        // Alternative CORS proxy
        const proxyUrl = `https://cors-anywhere.herokuapp.com/${url}`;
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'Origin': window.location.origin,
            },
            timeout: 15000
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        return this.parseImagesFromHtml(html, url);
    }

    async fetchWithCorsAnywhere(url) {
        // Another CORS proxy option
        const proxyUrl = `https://cors.bridged.cc/${url}`;
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        return this.parseImagesFromHtml(html, url);
    }

    async fetchWithJsonp(url) {
        // Fallback approach - this won't work for most sites due to CORS
        // but included as a last resort
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onerror = () => reject(new Error('Failed to load script'));
            document.head.appendChild(script);
            setTimeout(() => {
                document.head.removeChild(script);
                reject(new Error('JSONP timeout'));
            }, 5000);
        });
    }

    parseImagesFromHtml(html, baseUrl) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const imgElements = doc.querySelectorAll('img');
        
        const images = [];
        const seenUrls = new Set();

        imgElements.forEach((img) => {
            let src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
            
            if (!src) return;

            // Convert relative URLs to absolute URLs
            if (src.startsWith('//')) {
                src = 'https:' + src;
            } else if (src.startsWith('/')) {
                const urlObj = new URL(baseUrl);
                src = urlObj.origin + src;
            } else if (!src.startsWith('http')) {
                const urlObj = new URL(baseUrl);
                src = urlObj.origin + '/' + src.replace(/^\/+/, '');
            }

            // Skip if we've already seen this URL
            if (seenUrls.has(src)) return;
            seenUrls.add(src);

            // Get image dimensions if available
            const width = img.width || img.getAttribute('width') || 'Unknown';
            const height = img.height || img.getAttribute('height') || 'Unknown';
            const alt = img.alt || 'No alt text';

            images.push({
                url: src,
                width: width,
                height: height,
                alt: alt,
                format: this.getImageFormat(src)
            });
        });

        return images;
    }

    getImageFormat(url) {
        const extension = url.split('.').pop()?.toLowerCase();
        const formatMap = {
            'jpg': 'JPEG',
            'jpeg': 'JPEG',
            'png': 'PNG',
            'gif': 'GIF',
            'webp': 'WebP',
            'svg': 'SVG',
            'bmp': 'BMP',
            'ico': 'ICO'
        };
        return formatMap[extension] || 'Unknown';
    }

    generateCloudinaryUrl(originalUrl) {
        const cloudinaryBase = 'https://res.cloudinary.com/shirly/image/fetch/w_800,q_auto,f_auto/';
        return cloudinaryBase + encodeURIComponent(originalUrl);
    }

    calculateSizeReduction(originalSize, optimizedSize) {
        if (originalSize === 'Unknown' || optimizedSize === 'Unknown') {
            return null;
        }
        
        // Extract numeric values from size strings (e.g., "1.5 MB" -> 1.5)
        const originalMatch = originalSize.match(/(\d+\.?\d*)\s*(Bytes|KB|MB|GB)/i);
        const optimizedMatch = optimizedSize.match(/(\d+\.?\d*)\s*(Bytes|KB|MB|GB)/i);
        
        if (!originalMatch || !optimizedMatch) {
            return null;
        }
        
        const originalValue = parseFloat(originalMatch[1]);
        const originalUnit = originalMatch[2].toUpperCase();
        const optimizedValue = parseFloat(optimizedMatch[1]);
        const optimizedUnit = optimizedMatch[2].toUpperCase();
        
        // Convert to bytes for comparison
        const unitMultipliers = { 'BYTES': 1, 'KB': 1024, 'MB': 1024 * 1024, 'GB': 1024 * 1024 * 1024 };
        const originalBytes = originalValue * unitMultipliers[originalUnit];
        const optimizedBytes = optimizedValue * unitMultipliers[optimizedUnit];
        
        if (originalBytes === 0) return null;
        
        const reduction = ((originalBytes - optimizedBytes) / originalBytes) * 100;
        return Math.round(reduction);
    }

    getSizeReductionColor(reduction) {
        if (reduction === null) return 'neutral';
        if (reduction >= 70) return 'excellent';
        if (reduction >= 50) return 'good';
        if (reduction >= 30) return 'moderate';
        if (reduction >= 10) return 'minimal';
        return 'poor';
    }

    async getImageInfo(imageUrl) {
        try {
            // Use our server-side proxy to get image information
            const response = await fetch(`/api/image-info?url=${encodeURIComponent(imageUrl)}`);
            
            if (response.ok) {
                const data = await response.json();
                return {
                    size: data.size,
                    format: data.format,
                    contentType: data.contentType
                };
            }
        } catch (error) {
            console.warn('Failed to get original image info via server proxy:', error);
        }

        // Fallback: try client-side methods
        try {
            // Try to fetch image info using a proxy to avoid CORS issues
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`;
            const response = await fetch(proxyUrl, { 
                method: 'HEAD',
                timeout: 5000
            });
            
            if (response.ok) {
                const contentLength = response.headers.get('content-length');
                const contentType = response.headers.get('content-type');
                
                let size = 'Unknown';
                if (contentLength) {
                    size = this.formatFileSize(parseInt(contentLength));
                }

                return {
                    size: size,
                    format: this.getImageFormat(imageUrl),
                    contentType: contentType || 'Unknown'
                };
            }
        } catch (error) {
            console.warn('Failed to get original image info via external proxy:', error);
        }

        // Final fallback
        return {
            size: 'Unknown (CORS restricted)',
            format: this.getImageFormat(imageUrl),
            contentType: 'Unknown'
        };
    }

    async getCloudinaryImageInfo(cloudinaryUrl) {
        try {
            const response = await fetch(cloudinaryUrl, { 
                method: 'HEAD',
                timeout: 10000
            });
            
            if (response.ok) {
                const contentLength = response.headers.get('content-length');
                const contentType = response.headers.get('content-type');
                
                let size = 'Unknown';
                if (contentLength) {
                    size = this.formatFileSize(parseInt(contentLength));
                }

                return {
                    size: size,
                    format: this.getImageFormat(cloudinaryUrl),
                    contentType: contentType || 'Unknown'
                };
            }
        } catch (error) {
            console.warn('Failed to get Cloudinary image info:', error);
        }

        return {
            size: 'Unknown',
            format: this.getImageFormat(cloudinaryUrl),
            contentType: 'Unknown'
        };
    }

    async getImageDimensions(imageUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                resolve({
                    width: img.naturalWidth,
                    height: img.naturalHeight
                });
            };
            
            img.onerror = () => {
                resolve({
                    width: 'Unknown',
                    height: 'Unknown'
                });
            };
            
            // Set a timeout to avoid hanging
            setTimeout(() => {
                resolve({
                    width: 'Unknown',
                    height: 'Unknown'
                });
            }, 5000);
            
            img.src = imageUrl;
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async displayResults(images) {
        this.imagesTableBody.innerHTML = '';
        this.imageCount.textContent = images.length;

        if (images.length === 0) {
            this.showError('No images found on the website');
            return;
        }

        for (const image of images) {
            const row = document.createElement('tr');
            
            // Original Image
            const originalImageCell = document.createElement('td');
            originalImageCell.className = 'image-cell';
            const originalImg = document.createElement('img');
            originalImg.src = image.url;
            originalImg.alt = image.alt;
            originalImg.className = 'image-preview';
            originalImg.onerror = () => {
                originalImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjgwIiB2aWV3Qm94PSIwIDAgMTIwIDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjVGNUY1Ii8+CjxwYXRoIGQ9Ik0zMCAyMEg5MFY2MEgzMFYyMFoiIGZpbGw9IiNEN0Q3RDciLz4KPHBhdGggZD0iTTM1IDI1VjU1SDg1VjI1SDM1Wk00MCAzMEg4MFY1MEg0MFYzMFoiIGZpbGw9IiNGRkZGRkYiLz4KPC9zdmc+';
                originalImg.alt = 'Image not available';
            };
            originalImageCell.appendChild(originalImg);
            
            // Optimized Image
            const optimizedImageCell = document.createElement('td');
            optimizedImageCell.className = 'image-cell';
            const cloudinaryUrl = this.generateCloudinaryUrl(image.url);
            const optimizedImg = document.createElement('img');
            optimizedImg.src = cloudinaryUrl;
            optimizedImg.alt = `Optimized: ${image.alt}`;
            optimizedImg.className = 'image-preview optimized';
            optimizedImg.onerror = () => {
                optimizedImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjgwIiB2aWV3Qm94PSIwIDAgMTIwIDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjVGNUY1Ii8+CjxwYXRoIGQ9Ik0zMCAyMEg5MFY2MEgzMFYyMFoiIGZpbGw9IiNEN0Q3RDciLz4KPHBhdGggZD0iTTM1IDI1VjU1SDg1VjI1SDM1Wk00MCAzMEg4MFY1MEg0MFYzMFoiIGZpbGw9IiNGRkZGRkYiLz4KPC9zdmc+';
                optimizedImg.alt = 'Optimized image not available';
            };
            optimizedImageCell.appendChild(optimizedImg);
            
            // Image Details
            const detailsCell = document.createElement('td');
            detailsCell.className = 'details-cell';
            detailsCell.innerHTML = `
                <div class="details-loading">Loading image information...</div>
            `;
            
            // Size Comparison
            const comparisonCell = document.createElement('td');
            comparisonCell.className = 'comparison-cell';
            comparisonCell.innerHTML = `
                <div class="comparison-loading">Loading comparison...</div>
            `;
            
            // URLs
            const urlsCell = document.createElement('td');
            urlsCell.className = 'urls-cell';
            urlsCell.innerHTML = `
                <div class="url-section">
                    <h5>Original URL</h5>
                    <div class="url-display">${image.url}</div>
                </div>
                <div class="url-section">
                    <h5>Cloudinary URL</h5>
                    <div class="url-display cloudinary">${cloudinaryUrl}</div>
                </div>
            `;
            
            row.appendChild(originalImageCell);
            row.appendChild(optimizedImageCell);
            row.appendChild(detailsCell);
            row.appendChild(comparisonCell);
            row.appendChild(urlsCell);
            
            this.imagesTableBody.appendChild(row);
            
            // Fetch image information asynchronously
            this.updateImageDetails(detailsCell, comparisonCell, image, cloudinaryUrl);
        }

        this.showResults();
    }

    async updateImageDetails(detailsCell, comparisonCell, image, cloudinaryUrl) {
        try {
            // Get actual image dimensions
            const dimensions = await this.getImageDimensions(image.url);
            
            const [originalInfo, cloudinaryInfo] = await Promise.all([
                this.getImageInfo(image.url),
                this.getCloudinaryImageInfo(cloudinaryUrl)
            ]);

            // Calculate size reduction
            const sizeReduction = this.calculateSizeReduction(originalInfo.size, cloudinaryInfo.size);
            const reductionColor = this.getSizeReductionColor(sizeReduction);

            // Update details cell
            detailsCell.innerHTML = `
                <div class="details-section">
                    <div class="detail-item">
                        <span class="detail-label">Dimensions:</span>
                        <span class="detail-value">${dimensions.width} × ${dimensions.height}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Format:</span>
                        <span class="detail-value">${originalInfo.format}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Alt Text:</span>
                        <span class="detail-value">${image.alt || 'None'}</span>
                    </div>
                </div>
            `;

            // Update comparison cell
            comparisonCell.innerHTML = `
                <div class="comparison-section">
                    <div class="size-reduction ${reductionColor}">
                        ${sizeReduction !== null ? 
                            `<span class="reduction-percentage">${sizeReduction}% smaller</span>` : 
                            '<span class="reduction-unknown">Size reduction unknown</span>'
                        }
                    </div>
                    <div class="size-bars">
                        <div class="size-bar">
                            <div class="size-bar-original" style="width: 100%;">
                                <span class="size-label">Original: ${originalInfo.size}</span>
                            </div>
                        </div>
                        <div class="size-bar">
                            <div class="size-bar-optimized" style="width: ${sizeReduction !== null ? 100 - sizeReduction : 100}%;">
                                <span class="size-label">Optimized: ${cloudinaryInfo.size}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error updating image details:', error);
            detailsCell.innerHTML = `
                <div class="details-section">
                    <div class="detail-item">
                        <span class="detail-label">Dimensions:</span>
                        <span class="detail-value">${image.width} × ${image.height}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Format:</span>
                        <span class="detail-value">${image.format}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Alt Text:</span>
                        <span class="detail-value">${image.alt || 'None'}</span>
                    </div>
                </div>
            `;
            comparisonCell.innerHTML = `
                <div class="comparison-section">
                    <div class="size-reduction neutral">
                        <span class="reduction-unknown">Unable to fetch size data</span>
                    </div>
                </div>
            `;
        }
    }

    setLoading(loading) {
        this.extractBtn.disabled = loading;
        const btnText = this.extractBtn.querySelector('.btn-text');
        const btnSpinner = this.extractBtn.querySelector('.loading-spinner');
        
        if (loading) {
            btnText.style.display = 'none';
            btnSpinner.style.display = 'block';
            this.loadingSection.style.display = 'block';
        } else {
            btnText.style.display = 'block';
            btnSpinner.style.display = 'none';
            this.loadingSection.style.display = 'none';
        }
    }

    showResults() {
        this.resultsSection.style.display = 'block';
        this.errorSection.style.display = 'none';
    }

    hideResults() {
        this.resultsSection.style.display = 'none';
    }

    showError(message) {
        this.errorText.textContent = message;
        this.errorSection.style.display = 'block';
        this.resultsSection.style.display = 'none';
    }

    hideError() {
        this.errorSection.style.display = 'none';
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ImageExtractor();
}); 