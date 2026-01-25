const NodeEnvironment = require('jest-environment-node').TestEnvironment;

class CustomTestEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
  }

  async setup() {
    await super.setup();
    // Provide a mock localStorage for Node.js v25+
    if (!this.global.localStorage) {
      const store = new Map();
      this.global.localStorage = {
        getItem: (key) => store.get(key) || null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear(),
        get length() { return store.size; },
        key: (index) => Array.from(store.keys())[index] || null,
      };
    }
  }
}

module.exports = CustomTestEnvironment;
