const fs = require('fs');
const path = require('path');

const appJsonPath = path.resolve(__dirname, '../app.json');
const packageJsonPath = path.resolve(__dirname, '../package.json');

// Read files
const appJson = require(appJsonPath);
const packageJson = require(packageJsonPath);

// Current version from app.json (Source of Truth)
const currentVersion = appJson.expo.version;
console.log(`Current Version: ${currentVersion}`);

// Parse version
let [major, minor, patch] = currentVersion.split('.').map(Number);

// Determine bump type
const type = process.argv[2] || 'patch';
if (!['major', 'minor', 'patch'].includes(type)) {
    console.error('Invalid bump type. Use: major, minor, or patch');
    process.exit(1);
}

// Increment version
if (type === 'major') {
    major++;
    minor = 0;
    patch = 0;
} else if (type === 'minor') {
    minor++;
    patch = 0;
} else {
    patch++;
}

const newVersion = `${major}.${minor}.${patch}`;

// Increment build numbers
// iOS buildNumber is usually a string
// Android versionCode is an integer
let buildNumber = parseInt(appJson.expo.ios.buildNumber, 10);
let versionCode = appJson.expo.android.versionCode;

if (isNaN(buildNumber)) buildNumber = 0;
if (isNaN(versionCode)) versionCode = 0;

buildNumber++;
versionCode++;

console.log(`\nNew Version:   ${newVersion}`);
console.log(`New Build #:   ${buildNumber}`);
console.log(`New VersionCode: ${versionCode}`);

// Update Objects
appJson.expo.version = newVersion;
appJson.expo.ios.buildNumber = String(buildNumber);
appJson.expo.android.versionCode = versionCode;

packageJson.version = newVersion;

// Write files
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log('\n✅ Updated app.json and package.json');
