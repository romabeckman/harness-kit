const js = require("@eslint/js");

module.exports = [
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off"
    }
  }
];