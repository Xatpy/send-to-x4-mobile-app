const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const PLUGIN_NAME = 'with-local-network-security';
const PLUGIN_VERSION = '1.0.0';

function ensureAppNetworkAttributes(androidManifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  app.$['android:usesCleartextTraffic'] = 'true';
  app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
  return androidManifest;
}

function ensureNetworkSecurityXml(projectRoot) {
  const xmlDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');
  const xmlPath = path.join(xmlDir, 'network_security_config.xml');
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

  fs.mkdirSync(xmlDir, { recursive: true });
  fs.writeFileSync(xmlPath, xml, 'utf8');
}

const withLocalNetworkSecurity = (config) => {
  config = withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = ensureAppNetworkAttributes(modConfig.modResults);
    return modConfig;
  });

  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      ensureNetworkSecurityXml(modConfig.modRequest.projectRoot);
      return modConfig;
    },
  ]);

  return config;
};

module.exports = createRunOncePlugin(
  withLocalNetworkSecurity,
  PLUGIN_NAME,
  PLUGIN_VERSION
);
