# Contributing to Send to X4

Thanks for your interest in contributing! Whether it's a bug report, feature idea, or code contribution, every bit helps.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20.x
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- iOS: Xcode 15+ with CocoaPods
- Android: Android Studio with SDK 36+

### Setup

```bash
git clone https://github.com/Xatpy/send-to-x4-mobile-app.git
cd send-to-x4-mobile-app
nvm use
npm install
cp .env.example .env
npx expo prebuild --clean
```

### EAS Configuration

Build-time identifiers are loaded from `.env` by `app.config.ts`. To build your own version:

1. Create a free account at [expo.dev](https://expo.dev)
2. Run `eas init` to create your own project
3. Set `EAS_PROJECT_ID` in `.env`
4. Set your own `APP_BUNDLE_ID` and `APP_IOS_APP_GROUP` values in `.env`

The checked-in `ios/` and `android/` folders should be treated as generated output. After changing identifiers, regenerate them with `npx expo prebuild --clean`.

## Running & Testing

```bash
# Start the dev server
npx expo start

# Run on a device/simulator
npx expo run:ios
npx expo run:android

# Run tests
npm run test:all

# Run the type checker
npm run typecheck
```

## Submitting Changes

1. **Fork** the repository
2. **Create** a feature branch from `main` (`git checkout -b feature/my-feature`)
3. **Make** your changes
4. **Run tests** to make sure nothing is broken (`npm run test:all`)
5. **Commit** with a clear message (`git commit -m 'Add my feature'`)
6. **Push** to your fork (`git push origin feature/my-feature`)
7. **Open** a Pull Request against `main`

## Reporting Bugs

Open an issue with:
- A clear title and description
- Steps to reproduce the bug
- Expected vs. actual behavior
- Device, OS version, and firmware (Stock / CrossPoint)

## Feature Requests

Open an issue describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Code Style

- TypeScript throughout — avoid `any` when possible
- Functional React components with hooks
- Keep services in `src/services/`, screens in `src/screens/`, shared components in `src/components/`

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
