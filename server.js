const express = require('express');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname)));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Proxy endpoint to get image information
app.get('/api/image-info', async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        const response = await fetch(url, { 
            method: 'HEAD',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (response.ok) {
            const contentLength = response.headers.get('content-length');
            const contentType = response.headers.get('content-type');
            
            let size = 'Unknown';
            if (contentLength) {
                size = formatFileSize(parseInt(contentLength));
            }

            res.json({
                size: size,
                format: getImageFormat(url),
                contentType: contentType || 'Unknown',
                status: response.status
            });
        } else {
            res.status(response.status).json({
                error: `HTTP ${response.status}`,
                size: 'Unknown',
                format: getImageFormat(url),
                contentType: 'Unknown'
            });
        }
    } catch (error) {
        console.error('Error fetching image info:', error);
        res.status(500).json({
            error: error.message,
            size: 'Unknown',
            format: getImageFormat(req.query.url),
            contentType: 'Unknown'
        });
    }
});

// Enhanced proxy endpoint to fetch website content and extract images with lazy loading support
app.get('/api/extract-images', async (req, res) => {
    try {
        const { url, useBrowser = 'true' } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        let images = [];
        let fallbackUsed = false;
        
        if (useBrowser === 'true') {
            // Use Puppeteer to handle lazy loading
            const result = await extractImagesWithBrowser(url);
            if (typeof result === 'object' && result.fallbackUsed) {
                images = result.images;
                fallbackUsed = true;
            } else {
                images = result;
            }
        } else {
            // Fallback to simple fetch
            const response = await fetch(url, { 
                method: 'GET',
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });

            if (response.ok) {
                const html = await response.text();
                images = parseImagesFromHtml(html, url);
            } else {
                return res.status(response.status).json({
                    success: false,
                    error: `HTTP ${response.status}`,
                    images: [],
                    count: 0
                });
            }
        }
        
        res.json({
            success: true,
            images: images,
            count: images.length,
            fallbackUsed: fallbackUsed
        });
    } catch (error) {
        console.error('Error extracting images:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            images: [],
            count: 0
        });
    }
});

// Helper function to parse images from HTML
function parseImagesFromHtml(html, baseUrl) {
    const { JSDOM } = require('jsdom');
    
    // Configure JSDOM to be more permissive
    const dom = new JSDOM(html, {
        url: baseUrl,
        pretendToBeVisual: true,
        resources: 'usable',
        runScripts: 'outside-only'
    });
    
    const document = dom.window.document;
    const images = [];
    const seenUrls = new Set();

    // Function to add image if not already seen
    function addImage(src, element) {
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
        const width = element?.width || element?.getAttribute('width') || 'Unknown';
        const height = element?.height || element?.getAttribute('height') || 'Unknown';
        const alt = element?.alt || 'No alt text';

        images.push({
            url: src,
            width: width,
            height: height,
            alt: alt,
            format: getImageFormat(src)
        });
    }

    // 1. Standard img tags
    const imgElements = document.querySelectorAll('img');
    imgElements.forEach((img) => {
        let src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || 
                  img.getAttribute('data-original') || img.getAttribute('data-srcset') ||
                  img.getAttribute('data-image') || img.getAttribute('data-url');
        addImage(src, img);
    });

    // 2. Picture elements
    const pictureElements = document.querySelectorAll('picture source');
    pictureElements.forEach((source) => {
        let src = source.srcset || source.getAttribute('data-srcset');
        if (src) {
            // Extract first URL from srcset
            const urlMatch = src.match(/^([^\s,]+)/);
            if (urlMatch) {
                addImage(urlMatch[1], source);
            }
        }
    });

    // 3. Background images in CSS
    const allElements = document.querySelectorAll('*');
    allElements.forEach((element) => {
        const style = element.style;
        if (style.backgroundImage && style.backgroundImage !== 'none') {
            const bgMatch = style.backgroundImage.match(/url\(['"]?([^'")\s]+)['"]?\)/);
            if (bgMatch) {
                addImage(bgMatch[1], element);
            }
        }
    });

    // 4. Look for images in data attributes
    const dataImageElements = document.querySelectorAll('[data-image], [data-img], [data-src]');
    dataImageElements.forEach((element) => {
        let src = element.getAttribute('data-image') || element.getAttribute('data-img') || 
                  element.getAttribute('data-src');
        addImage(src, element);
    });

    // 5. Look for images in JSON-LD structured data
    const scriptElements = document.querySelectorAll('script[type="application/ld+json"]');
    scriptElements.forEach((script) => {
        try {
            const data = JSON.parse(script.textContent);
            if (data.image) {
                if (Array.isArray(data.image)) {
                    data.image.forEach(img => addImage(img, null));
                } else {
                    addImage(data.image, null);
                }
            }
        } catch (e) {
            // Ignore JSON parsing errors
        }
    });

    // 6. Look for images in meta tags
    const metaElements = document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]');
    metaElements.forEach((meta) => {
        const content = meta.getAttribute('content');
        addImage(content, meta);
    });

    // 7. Look for images in link tags (favicons, etc.)
    const linkElements = document.querySelectorAll('link[rel*="icon"], link[rel*="image"]');
    linkElements.forEach((link) => {
        const href = link.getAttribute('href');
        addImage(href, link);
    });

    // 8. Look for images in CSS content (simplified regex)
    const styleElements = document.querySelectorAll('style');
    styleElements.forEach((style) => {
        const cssText = style.textContent;
        const urlMatches = cssText.match(/url\([^)]+\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)[^)]*\)/gi);
        if (urlMatches) {
            urlMatches.forEach(match => {
                const urlMatch = match.match(/url\(['"]?([^'")\s]+)['"]?\)/i);
                if (urlMatch) {
                    addImage(urlMatch[1], style);
                }
            });
        }
    });

    // 9. Look for images in inline styles (simplified regex)
    allElements.forEach((element) => {
        const inlineStyle = element.getAttribute('style');
        if (inlineStyle) {
            const urlMatches = inlineStyle.match(/url\([^)]+\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)[^)]*\)/gi);
            if (urlMatches) {
                urlMatches.forEach(match => {
                    const urlMatch = match.match(/url\(['"]?([^'")\s]+)['"]?\)/i);
                    if (urlMatch) {
                        addImage(urlMatch[1], element);
                    }
                });
            }
        }
    });

    console.log(`Found ${images.length} images from ${baseUrl}`);
    return images;
}

// Function to extract images using Puppeteer (handles lazy loading)
async function extractImagesWithBrowser(url) {
    let browser;
    try {
        console.log(`🌐 Launching browser to extract images from: ${url}`);
        
        // Try to use system Chrome first, then fallback to downloaded version
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        };

        // Try to find system Chrome on macOS
        const possibleChromePaths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser'
        ];

        for (const chromePath of possibleChromePaths) {
            try {
                const fs = require('fs');
                if (fs.existsSync(chromePath)) {
                    console.log(`✅ Found Chrome at: ${chromePath}`);
                    launchOptions.executablePath = chromePath;
                    break;
                }
            } catch (e) {
                // Continue to next path
            }
        }

        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();
        
        // Set viewport to trigger lazy loading
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Navigate to the page
        await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });

        // Wait a bit more for any delayed lazy loading
        await page.waitForTimeout(3000);

        // Scroll down to trigger lazy loading
        await page.evaluate(() => {
            return new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    
                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        // Wait for images to load after scrolling
        await page.waitForTimeout(2000);

        // Extract images using enhanced selectors
        const images = await page.evaluate((baseUrl) => {
            const imageData = [];
            const seenUrls = new Set();

            function addImage(src, element) {
                if (!src || seenUrls.has(src)) return;
                seenUrls.add(src);

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

                const width = element?.width || element?.getAttribute('width') || 'Unknown';
                const height = element?.height || element?.getAttribute('height') || 'Unknown';
                const alt = element?.alt || 'No alt text';

                imageData.push({
                    url: src,
                    width: width,
                    height: height,
                    alt: alt,
                    format: getImageFormat(src)
                });
            }

            function getImageFormat(url) {
                const extension = url.split('.').pop()?.toLowerCase();
                const formatMap = {
                    'jpg': 'JPEG', 'jpeg': 'JPEG', 'png': 'PNG', 'gif': 'GIF',
                    'webp': 'WebP', 'svg': 'SVG', 'bmp': 'BMP', 'ico': 'ICO'
                };
                return formatMap[extension] || 'Unknown';
            }

            // 1. Standard img tags (including lazy loaded ones)
            const imgElements = document.querySelectorAll('img');
            imgElements.forEach((img) => {
                // Check multiple possible sources for lazy loading
                let src = img.src || img.getAttribute('data-src') || 
                          img.getAttribute('data-lazy-src') || img.getAttribute('data-original') ||
                          img.getAttribute('data-srcset') || img.getAttribute('data-image') ||
                          img.getAttribute('data-url') || img.getAttribute('data-lazy') ||
                          img.getAttribute('data-original-src') || img.getAttribute('data-full-src');
                
                addImage(src, img);
            });

            // 2. Picture elements with lazy loading
            const pictureElements = document.querySelectorAll('picture source');
            pictureElements.forEach((source) => {
                let src = source.srcset || source.getAttribute('data-srcset') ||
                          source.getAttribute('data-src') || source.getAttribute('data-lazy-src');
                if (src) {
                    const urlMatch = src.match(/^([^\s,]+)/);
                    if (urlMatch) {
                        addImage(urlMatch[1], source);
                    }
                }
            });

            // 3. Background images (including lazy loaded ones)
            const allElements = document.querySelectorAll('*');
            allElements.forEach((element) => {
                const style = window.getComputedStyle(element);
                if (style.backgroundImage && style.backgroundImage !== 'none') {
                    const bgMatch = style.backgroundImage.match(/url\(['"]?([^'")\s]+)['"]?\)/);
                    if (bgMatch) {
                        addImage(bgMatch[1], element);
                    }
                }
            });

            // 4. Data attributes for lazy loading
            const dataImageElements = document.querySelectorAll('[data-image], [data-img], [data-src], [data-lazy]');
            dataImageElements.forEach((element) => {
                let src = element.getAttribute('data-image') || element.getAttribute('data-img') || 
                          element.getAttribute('data-src') || element.getAttribute('data-lazy');
                addImage(src, element);
            });

            // 5. JSON-LD structured data
            const scriptElements = document.querySelectorAll('script[type="application/ld+json"]');
            scriptElements.forEach((script) => {
                try {
                    const data = JSON.parse(script.textContent);
                    if (data.image) {
                        if (Array.isArray(data.image)) {
                            data.image.forEach(img => addImage(img, null));
                        } else {
                            addImage(data.image, null);
                        }
                    }
                } catch (e) {
                    // Ignore JSON parsing errors
                }
            });

            // 6. Meta tags
            const metaElements = document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]');
            metaElements.forEach((meta) => {
                const content = meta.getAttribute('content');
                addImage(content, meta);
            });

            // 7. Link tags
            const linkElements = document.querySelectorAll('link[rel*="icon"], link[rel*="image"]');
            linkElements.forEach((link) => {
                const href = link.getAttribute('href');
                addImage(href, link);
            });

            // 8. CSS content
            const styleElements = document.querySelectorAll('style');
            styleElements.forEach((style) => {
                const cssText = style.textContent;
                const urlMatches = cssText.match(/url\([^)]+\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)[^)]*\)/gi);
                if (urlMatches) {
                    urlMatches.forEach(match => {
                        const urlMatch = match.match(/url\(['"]?([^'")\s]+)['"]?\)/i);
                        if (urlMatch) {
                            addImage(urlMatch[1], style);
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
                                addImage(urlMatch[1], element);
                            }
                        });
                    }
                }
            });

            return imageData;
        }, url);

        console.log(`✅ Found ${images.length} images using browser extraction`);
        return images;

    } catch (error) {
        console.error('Browser extraction error:', error);
        
        // If browser extraction fails, try simple extraction as fallback
        console.log('🔄 Browser extraction failed, trying simple extraction as fallback...');
        try {
            const response = await fetch(url, { 
                method: 'GET',
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });

            if (response.ok) {
                const html = await response.text();
                const images = parseImagesFromHtml(html, url);
                console.log(`✅ Found ${images.length} images using simple extraction fallback`);
                return { images, fallbackUsed: true };
            }
        } catch (fallbackError) {
            console.error('Simple extraction fallback also failed:', fallbackError);
        }
        
        throw new Error(`Browser extraction failed: ${error.message}. Please try disabling browser extraction for a simpler approach.`);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to get image format from URL
function getImageFormat(url) {
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Serving files from: ${__dirname}`);
    console.log(`🌐 Open your browser and navigate to: http://localhost:${PORT}`);
});

module.exports = app; 