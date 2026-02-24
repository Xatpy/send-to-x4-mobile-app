# Send to X4

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**The bridge between the boundless web and your focused Xteink X4.**

Send to X4 is a mobile app that lets you capture articles, images, and notes from your phone and send them directly to your Xteink X4 e-reader over Wi-Fi — no cloud, no cables, no clutter.

> **⚠️ Disclaimer:** This is an independent, community-developed utility. It is **not** affiliated with or endorsed by Xteink. "Xteink" and "X4" are trademarks of their respective owners.

---

## ✨ Features

- **Share Sheet Integration** — Share any URL from your browser, social media, or news apps directly to Send to X4
- **Advanced Content Extraction** — Reader mode strips ads and clutter; a specialized engine handles complex pages like X/Twitter threads
- **EPUB Generation** — Articles are converted into clean, book-like EPUBs on your device
- **Direct Wi-Fi Transfer** — Files go straight from phone to e-reader, no cloud involved
- **Screensaver Upload** — Send images as BMP screensavers to your X4
- **Notes** — Write and send plain-text notes with custom titles
- **Article Queue** — Save articles for batch sending later, with offline pre-fetch support
- **Device File Manager** — Browse and delete files on your X4 directly from the app
- **Dual Firmware Support** — Compatible with both Stock and CrossPoint firmware

---

## 🛡️ Privacy

Send to X4 is built with a **privacy-first** architecture:

- All processing happens locally on your device
- No analytics, no tracking SDKs, no cloud storage
- Files transfer directly over your local Wi-Fi network

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- iOS: Xcode 15+ and CocoaPods
- Android: Android Studio with SDK 36+

### Installation

```bash
# Clone the repository
git clone https://github.com/Xatpy/send-to-x4-mobile-app.git
cd send-to-x4-mobile-app

# Install dependencies
npm install

# Generate native projects
npx expo prebuild

# Run on iOS
npx expo run:ios

# Run on Android
npx expo run:android
```

### Development Server

```bash
npx expo start
```

### Running Tests

```bash
# Run all tests
npm run test:all

# Individual test suites
npm run test:extractor-regressions
npm run test:extractor-integration
npm run test:epub-sanitizer
```

---

## 🏗️ Project Structure

```
send-to-x4-mobile-app/
├── App.tsx                     # App entry point, navigation setup
├── src/
│   ├── components/             # Reusable UI components
│   ├── contexts/               # React context providers (connection state)
│   ├── screens/                # App screens (Articles, Screensavers, Notes, Device, Settings)
│   ├── services/               # Core logic (extraction, EPUB, upload, queue)
│   ├── types/                  # TypeScript type definitions
│   └── utils/                  # Utilities (EPUB templates, sanitizer)
├── scripts/                    # Test scripts and build utilities
├── plugins/                    # Custom Expo config plugins
├── assets/                     # App icons and splash screen
└── docs/                       # Product documentation
```

---

## 🔧 How It Works

1. **Share or paste** a URL into the app
2. The **content extractor** fetches and parses the page using Mozilla Readability (with a specialized engine for complex sites)
3. The extracted content is **packaged into an EPUB** with clean formatting
4. The EPUB is **transferred over Wi-Fi** directly to the X4 using the device's native API (Stock or CrossPoint)

---

## 📝 EAS Project Configuration

This project uses [Expo EAS](https://expo.dev/eas) for builds. Build-time identifiers are read from environment variables via `app.config.ts`.

1. Copy `.env.example` to `.env`
2. Create a free Expo account at [expo.dev](https://expo.dev)
3. Run `eas init` to create your own project
4. Set `EAS_PROJECT_ID` in `.env`
5. Set your bundle ID values (`APP_BUNDLE_ID`, `APP_IOS_APP_GROUP`) in `.env`

---

## 🧪 EPUB Debug Utilities

The app includes hidden EPUB debug/export tooling in:

- `src/screens/ArticlesScreen.tsx`

These utilities are kept in code but disabled in normal UI. Toggle these internal flags near the top of that file:

- `EPUB_DEBUG_TOOLS_ENABLED`: shows the **EXTRACT EPUB (NO UPLOAD)** action in the Articles screen
- `EPUB_DEBUG_PATH_LOG_ENABLED`: logs the exported EPUB path to the console
- `EPUB_DEBUG_PATH_ALERT_ENABLED`: shows an alert with the exported EPUB path

Notes:

- This is intended for local debugging and EPUB validation outside the device renderer.
- Keep all flags set to `false` for production-like behavior.

---

## 🤝 Contributing

Contributions are welcome! Whether it's bug reports, feature requests, or code contributions:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/my-feature`)
3. **Commit** your changes (`git commit -m 'Add my feature'`)
4. **Push** to the branch (`git push origin feature/my-feature`)
5. **Open** a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](./LICENSE) file for details.

---

## 📬 Contact

- **Website:** [chapiware.com/send-to-x4](https://chapiware.com/send-to-x4)
- **Email:** [hi@chapiware.com](mailto:hi@chapiware.com)
