# 🌐 Website Image Extractor

A powerful web application that extracts images from any website and optimizes them using Cloudinary. Perfect for web developers, designers, and content creators who need to analyze and optimize website images.

## ✨ Features

- **🔍 Smart Image Detection**: Finds images from multiple sources including:
  - Standard `<img>` tags
  - Lazy-loaded images (`data-src`, `data-lazy-src`, etc.)
  - Picture elements and srcset
  - Background images
  - JSON-LD structured data
  - Meta tags and link tags
  - CSS content and inline styles

- **⚡ Cloudinary Optimization**: Automatically optimizes images using Cloudinary's powerful transformation API
- **📊 Size Comparison**: Shows original vs optimized image sizes with visual comparison bars
- **🎨 Beautiful UI**: Modern, responsive design with hover effects and color-coded indicators
- **🌐 CORS Handling**: Multiple fallback methods to handle cross-origin restrictions
- **📱 Mobile Friendly**: Fully responsive design that works on all devices

## 🚀 Live Demo

Visit the live application: [Website Image Extractor](https://shirlymanor.github.io/website-image-extractor)

## 🛠️ How to Use

1. **Enter a Website URL**: Paste any website URL (e.g., `https://example.com`)
2. **Choose Extraction Method**:
   - **Advanced**: Better for lazy-loaded images (recommended)
   - **Simple**: Faster extraction for basic websites
3. **Click "Extract Images"**: The app will find and display all images
4. **View Results**: See original and optimized versions side by side with detailed information

## 📋 What You'll See

For each image, you'll get:
- **Original Image**: The image as it appears on the website
- **Optimized Image**: Cloudinary-optimized version (800px width, auto quality)
- **Image Details**: Dimensions, format, and alt text
- **Size Comparison**: Visual bars showing file size reduction
- **URLs**: Both original and Cloudinary URLs for easy copying

## 🔧 Technical Details

### Image Optimization
- **Width**: 800px (maintains aspect ratio)
- **Quality**: Auto-optimized
- **Format**: Auto-converted to WebP when supported
- **Cloudinary Account**: Uses the "shirly" account

### CORS Handling
The app uses multiple proxy services to handle CORS restrictions:
- AllOrigins API
- CORS Anywhere
- Direct fetch (when possible)

### Browser Compatibility
- Modern browsers with ES6+ support
- Chrome, Firefox, Safari, Edge
- Mobile browsers

## 📁 Files Structure

```
website-image-extractor/
├── index.html          # Main HTML file
├── styles.css          # CSS styles
├── script-static.js    # JavaScript (static version)
├── README.md          # This file
└── server.js          # Node.js server (for local development)
```

## 🚀 Deploy to GitHub Pages

1. **Create a new repository** on GitHub named `website-image-extractor`
2. **Upload the files**:
   - `index.html`
   - `styles.css`
   - `script-static.js`
   - `README.md`
3. **Enable GitHub Pages**:
   - Go to Settings → Pages
   - Select "Deploy from a branch"
   - Choose "main" branch
   - Save
4. **Your site will be live** at: `https://shirlymanor.github.io/website-image-extractor`

## 🔧 Local Development

If you want to run the full version with server-side features:

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open http://localhost:3000
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- [Cloudinary](https://cloudinary.com) for image optimization
- [Inter Font](https://rsms.me/inter/) for typography
- CORS proxy services for cross-origin support

---

**Made with ❤️ for the web development community** 