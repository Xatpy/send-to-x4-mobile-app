import "dotenv/config";
import type { ExpoConfig, ConfigContext } from "expo/config";
import appJson from "./app.json";

export default ({ config }: ConfigContext): ExpoConfig => {
    const bundleId = process.env.APP_BUNDLE_ID;
    const appGroup = process.env.APP_IOS_APP_GROUP;
    const easProjectId = process.env.EAS_PROJECT_ID;

    if (!bundleId || !appGroup || !easProjectId) {
        console.warn(
            "⚠️  Missing .env values. Copy .env.example to .env and fill in your values."
        );
    }

    return {
        ...config,
        name: appJson.expo.name,
        slug: appJson.expo.slug,
        version: appJson.expo.version,
        jsEngine: "hermes",
        orientation: "portrait",
        icon: "./assets/icon.png",
        backgroundColor: "#1a1a2e",
        userInterfaceStyle: "automatic",
        newArchEnabled: true,
        splash: {
            image: "./assets/splash-icon.png",
            resizeMode: "contain",
            backgroundColor: "#1a1a2e",
        },
        ios: {
            supportsTablet: true,
            bundleIdentifier: bundleId || "com.example.sendtox4",
            buildNumber: appJson.expo.ios.buildNumber,
            infoPlist: {
                NSAppTransportSecurity: {
                    NSAllowsLocalNetworking: true,
                },
            },
        },
        android: {
            versionCode: appJson.expo.android.versionCode,
            adaptiveIcon: {
                foregroundImage: "./assets/adaptive-icon.png",
                backgroundColor: "#1a1a2e",
            },
            package: bundleId || "com.example.sendtox4",
            edgeToEdgeEnabled: true,
            predictiveBackGestureEnabled: false,
            usesCleartextTraffic: true,
            permissions: [
                "android.permission.ACCESS_NETWORK_STATE",
                "android.permission.ACCESS_WIFI_STATE",
                "android.permission.NEARBY_WIFI_DEVICES",
                "android.permission.INTERNET",
                "android.permission.READ_EXTERNAL_STORAGE",
                "android.permission.WRITE_EXTERNAL_STORAGE",
            ],
        } as ExpoConfig["android"],
        web: {
            favicon: "./assets/favicon.png",
        },
        scheme: "sendtox4",
        plugins: [
            [
                "expo-build-properties",
                {
                    android: {
                        compileSdkVersion: 36,
                        targetSdkVersion: 36,
                    },
                },
            ],
            [
                "expo-share-intent",
                {
                    iosActivationRules: {
                        NSExtensionActivationSupportsText: true,
                        NSExtensionActivationSupportsWebURLWithMaxCount: 1,
                        NSExtensionActivationSupportsWebPageWithMaxCount: 1,
                        NSExtensionActivationSupportsImageWithMaxCount: 1,
                    },
                    iosAppGroupIdentifier: appGroup || "group.com.example.sendtox4",
                    androidIntentFilters: ["text/*", "image/*"],
                },
            ],
            [
                "expo-image-picker",
                {
                    photosPermission:
                        "Select BMP screensavers to send to your X4.",
                },
            ],
            "./plugins/with-local-network-security",
        ],
        extra: {
            eas: {
                projectId: easProjectId || "",
            },
        },
    };
};
