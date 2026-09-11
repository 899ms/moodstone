const { includeIgnoreFile } = require("@eslint/compat");
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");
const path = require("node:path");

module.exports = defineConfig([
  includeIgnoreFile(path.resolve(__dirname, ".gitignore")),
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    rules: {
      "import/order": [
        "warn",
        {
          groups: [
            ["builtin", "external"],
            "internal",
            ["parent", "sibling", "index"],
            "type",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "sort-imports": [
        "warn",
        { ignoreDeclarationSort: true, ignoreCase: true },
      ],
    },
  },
  {
    files: ["**/*.config.js"],
    languageOptions: {
      globals: { __dirname: "readonly", __filename: "readonly" },
    },
  },
]);
