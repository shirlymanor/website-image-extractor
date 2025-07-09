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
        const useAdvanced = this.useBrowserToggle.checked;
        const statusIndicator = this.extractionStatus.querySelector('.status-indicator');
        
        if (useAdvanced) {
            statusIndicator.className = 'status-indicator browser';
            statusIndicator.textContent = '🌐 Advanced extraction enabled (handles lazy loading)';
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
        const useAdvanced = this.useBrowserToggle.checked;
        
        // Try multiple approaches to handle CORS issues
        const approaches = [];
        
        if (useAdvanced) {
            // Advanced extraction methods (better for lazy loading)
            approaches.push(
                () => this.fetchWithCorsProxy(url),
                () => this.fetchWithAllOrigins(url),
                () => this.fetchWithCorsAnywhere(url),
                () => this.fetchWithJsonp(url)
            );
        } else {
            // Simple extraction methods (faster)
            approaches.push(
                () => this.fetchDirect(url),
                () => this.fetchWithCorsProxy(url),
                () => this.fetchWithAllOrigins(url)
            );
        }

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
    }

    async fetchDirect(url) {
        // Try direct fetch (some sites allow it)
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            timeout: 10000
        });
        
        if (response.ok) {
            const html = await response.text();
            return this.parseImagesFromHtml(html, url);
        }
        throw new Error(`Direct fetch failed: HTTP ${response.status}`);
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
            throw new Error(`CORS proxy failed: HTTP ${response.status}`);
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
            throw new Error(`AllOrigins proxy failed: HTTP ${response.status}`);
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
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000
        });

        if (!response.ok) {
            throw new Error(`CORS Anywhere failed: HTTP ${response.status}`);
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
        const images = [];
        const seenUrls = new Set();

        // Function to add image if not already seen
        function addImage(src, element) {
            if (!src || seenUrls.has(src)) return;

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

            seenUrls.add(src);

            // Get image dimensions if available
            const width = element?.width || element?.getAttribute('width') || 'Unknown';
            const height = element?.height || element?.getAttribute('height') || 'Unknown';
            const alt = element?.alt || 'No alt text';

            images.push({
                url: src,
                width: width,
                height: height,
                alt: alt,
                format: this.getImageFormat(src)
            });
        }

        // 1. Standard img tags (including lazy loaded ones)
        const imgElements = doc.querySelectorAll('img');
        imgElements.forEach((img) => {
            // Check multiple possible sources for lazy loading
            let src = img.src || img.getAttribute('data-src') || 
                      img.getAttribute('data-lazy-src') || img.getAttribute('data-original') ||
                      img.getAttribute('data-srcset') || img.getAttribute('data-image') ||
                      img.getAttribute('data-url') || img.getAttribute('data-lazy') ||
                      img.getAttribute('data-original-src') || img.getAttribute('data-full-src');
            
            addImage.call(this, src, img);
        });

        // 2. Picture elements with lazy loading
        const pictureElements = doc.querySelectorAll('picture source');
        pictureElements.forEach((source) => {
            let src = source.srcset || source.getAttribute('data-srcset') ||
                      source.getAttribute('data-src') || source.getAttribute('data-lazy-src');
            if (src) {
                const urlMatch = src.match(/^([^\s,]+)/);
                if (urlMatch) {
                    addImage.call(this, urlMatch[1], source);
                }
            }
        });

        // 3. Background images
        const allElements = doc.querySelectorAll('*');
        allElements.forEach((element) => {
            const style = element.style;
            if (style.backgroundImage && style.backgroundImage !== 'none') {
                const bgMatch = style.backgroundImage.match(/url\(['"]?([^'")\s]+)['"]?\)/);
                if (bgMatch) {
                    addImage.call(this, bgMatch[1], element);
                }
            }
        });

        // 4. Data attributes for lazy loading
        const dataImageElements = doc.querySelectorAll('[data-image], [data-img], [data-src], [data-lazy]');
        dataImageElements.forEach((element) => {
            let src = element.getAttribute('data-image') || element.getAttribute('data-img') || 
                      element.getAttribute('data-src') || element.getAttribute('data-lazy');
            addImage.call(this, src, element);
        });

        // 5. JSON-LD structured data
        const scriptElements = doc.querySelectorAll('script[type="application/ld+json"]');
        scriptElements.forEach((script) => {
            try {
                const data = JSON.parse(script.textContent);
                if (data.image) {
                    if (Array.isArray(data.image)) {
                        data.image.forEach(img => addImage.call(this, img, null));
                    } else {
                        addImage.call(this, data.image, null);
                    }
                }
            } catch (e) {
                // Ignore JSON parsing errors
            }
        });

        // 6. Meta tags
        const metaElements = doc.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]');
        metaElements.forEach((meta) => {
            const content = meta.getAttribute('content');
            addImage.call(this, content, meta);
        });

        // 7. Link tags
        const linkElements = doc.querySelectorAll('link[rel*="icon"], link[rel*="image"]');
        linkElements.forEach((link) => {
            const href = link.getAttribute('href');
            addImage.call(this, href, link);
        });

        // 8. CSS content
        const styleElements = doc.querySelectorAll('style');
        styleElements.forEach((style) => {
            const cssText = style.textContent;
            const urlMatches = cssText.match(/url\([^)]+\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)[^)]*\)/gi);
            if (urlMatches) {
                urlMatches.forEach(match => {
                    const urlMatch = match.match(/url\(['"]?([^'")\s]+)['"]?\)/i);
                    if (urlMatch) {
                        addImage.call(this, urlMatch[1], style);
                    }
                });
            }
        });

        // 9. Inline styles
        allElements.forEach((element) => {
            const inlineStyle = element.getAttribute('style');
            if (inlineStyle) {
                const urlMatches = inlineStyle.match(/url\([^)]+\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)[^)]*\)/gi);
                if (urlMatches) {
                    urlMatches.forEach(match => {
                        const urlMatch = match.match(/url\(['"]?([^'")\s]+)['"]?\)/i);
                        if (urlMatch) {
                            addImage.call(this, urlMatch[1], element);
                        }
                    });
                }
            }
        });

        console.log(`Found ${images.length} images from ${baseUrl}`);
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
        
        // Handle estimated sizes
        const isOriginalEstimated = originalSize.includes('(estimated)');
        const isOptimizedEstimated = optimizedSize.includes('(estimated)');
        
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
        
        // If both are estimated, add a note
        if (isOriginalEstimated && isOptimizedEstimated) {
            return Math.round(reduction);
        } else if (isOriginalEstimated || isOptimizedEstimated) {
            return Math.round(reduction);
        }
        
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
        console.log('🔍 Getting image info for:', imageUrl);
        
        try {
            // Method 1: Try direct HEAD request first
            console.log('📡 Method 1: Trying direct HEAD request...');
            const directResponse = await fetch(imageUrl, { 
                method: 'HEAD',
                mode: 'cors',
                timeout: 5000
            });
            
            if (directResponse.ok) {
                const contentLength = directResponse.headers.get('content-length');
                const contentType = directResponse.headers.get('content-type');
                
                if (contentLength) {
                    console.log('✅ Direct method succeeded:', this.formatFileSize(parseInt(contentLength)));
                    return {
                        size: this.formatFileSize(parseInt(contentLength)),
                        format: this.getImageFormat(imageUrl),
                        contentType: contentType || 'Unknown'
                    };
                }
            }
        } catch (error) {
            console.warn('❌ Direct fetch failed:', error.message);
        }

        try {
            // Method 2: Try with AllOrigins proxy
            console.log('📡 Method 2: Trying AllOrigins proxy...');
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`;
            const response = await fetch(proxyUrl, { 
                method: 'HEAD',
                timeout: 8000
            });
            
            if (response.ok) {
                const contentLength = response.headers.get('content-length');
                const contentType = response.headers.get('content-type');
                
                if (contentLength) {
                    console.log('✅ AllOrigins method succeeded:', this.formatFileSize(parseInt(contentLength)));
                    return {
                        size: this.formatFileSize(parseInt(contentLength)),
                        format: this.getImageFormat(imageUrl),
                        contentType: contentType || 'Unknown'
                    };
                }
            }
        } catch (error) {
            console.warn('❌ AllOrigins proxy failed:', error.message);
        }

        try {
            // Method 3: Try with CORS Anywhere proxy
            console.log('📡 Method 3: Trying CORS Anywhere proxy...');
            const corsProxyUrl = `https://cors-anywhere.herokuapp.com/${imageUrl}`;
            const response = await fetch(corsProxyUrl, { 
                method: 'HEAD',
                headers: {
                    'Origin': window.location.origin,
                },
                timeout: 8000
            });
            
            if (response.ok) {
                const contentLength = response.headers.get('content-length');
                const contentType = response.headers.get('content-type');
                
                if (contentLength) {
                    console.log('✅ CORS Anywhere method succeeded:', this.formatFileSize(parseInt(contentLength)));
                    return {
                        size: this.formatFileSize(parseInt(contentLength)),
                        format: this.getImageFormat(imageUrl),
                        contentType: contentType || 'Unknown'
                    };
                }
            }
        } catch (error) {
            console.warn('❌ CORS Anywhere proxy failed:', error.message);
        }

        try {
            // Method 4: Try to estimate size from image dimensions
            console.log('📡 Method 4: Trying size estimation from dimensions...');
            const dimensions = await this.getImageDimensions(imageUrl);
            if (dimensions.width !== 'Unknown' && dimensions.height !== 'Unknown') {
                // Estimate file size based on dimensions and format
                const estimatedSize = this.estimateImageSize(dimensions.width, dimensions.height, this.getImageFormat(imageUrl));
                console.log('✅ Size estimation succeeded:', estimatedSize);
                return {
                    size: estimatedSize,
                    format: this.getImageFormat(imageUrl),
                    contentType: 'Unknown (estimated)'
                };
            }
        } catch (error) {
            console.warn('❌ Size estimation failed:', error.message);
        }

        // Final fallback
        console.log('❌ All methods failed, using fallback');
        return {
            size: 'Unknown (CORS restricted)',
            format: this.getImageFormat(imageUrl),
            contentType: 'Unknown'
        };
    }

    estimateImageSize(width, height, format) {
        // Rough estimation based on image dimensions and format
        const pixels = width * height;
        let bytesPerPixel = 3; // Default for RGB
        
        switch (format.toLowerCase()) {
            case 'jpeg':
            case 'jpg':
                bytesPerPixel = 0.5; // JPEG compression
                break;
            case 'png':
                bytesPerPixel = 4; // RGBA
                break;
            case 'webp':
                bytesPerPixel = 0.4; // WebP compression
                break;
            case 'gif':
                bytesPerPixel = 1; // GIF compression
                break;
            case 'svg':
                return '~10-50 KB'; // SVG is vector-based
            default:
                bytesPerPixel = 3;
        }
        
        const estimatedBytes = pixels * bytesPerPixel;
        return this.formatFileSize(estimatedBytes) + ' (estimated)';
    }

    async getCloudinaryImageInfo(cloudinaryUrl) {
        try {
            // Method 1: Try direct HEAD request
            const response = await fetch(cloudinaryUrl, { 
                method: 'HEAD',
                timeout: 10000
            });
            
            if (response.ok) {
                const contentLength = response.headers.get('content-length');
                const contentType = response.headers.get('content-type');
                
                if (contentLength) {
                    return {
                        size: this.formatFileSize(parseInt(contentLength)),
                        format: this.getImageFormat(cloudinaryUrl),
                        contentType: contentType || 'Unknown'
                    };
                }
            }
        } catch (error) {
            console.warn('Direct Cloudinary fetch failed:', error.message);
        }

        try {
            // Method 2: Try with CORS proxy
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(cloudinaryUrl)}`;
            const response = await fetch(proxyUrl, { 
                method: 'HEAD',
                timeout: 10000
            });
            
            if (response.ok) {
                const contentLength = response.headers.get('content-length');
                const contentType = response.headers.get('content-type');
                
                if (contentLength) {
                    return {
                        size: this.formatFileSize(parseInt(contentLength)),
                        format: this.getImageFormat(cloudinaryUrl),
                        contentType: contentType || 'Unknown'
                    };
                }
            }
        } catch (error) {
            console.warn('Cloudinary proxy fetch failed:', error.message);
        }

        // Fallback: Try to estimate based on typical Cloudinary optimization
        try {
            const dimensions = await this.getImageDimensions(cloudinaryUrl);
            if (dimensions.width !== 'Unknown' && dimensions.height !== 'Unknown') {
                // Cloudinary typically optimizes well, so estimate smaller size
                const estimatedSize = this.estimateImageSize(dimensions.width, dimensions.height, 'webp') + ' (optimized)';
                return {
                    size: estimatedSize,
                    format: 'WebP (optimized)',
                    contentType: 'Unknown (estimated)'
                };
            }
        } catch (error) {
            console.warn('Cloudinary size estimation failed:', error.message);
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