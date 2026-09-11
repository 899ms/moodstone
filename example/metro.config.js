const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const root = path.resolve(__dirname, "..");
const config = getDefaultConfig(__dirname);

// Resolve the library from its TypeScript source ("source" export condition)
// so edits in ../src show up without a build step.
config.watchFolders = [root];
config.resolver.unstable_conditionNames = [
  "source",
  ...(config.resolver.unstable_conditionNames ?? [
    "require",
    "import",
    "react-native",
  ]),
];

module.exports = config;
