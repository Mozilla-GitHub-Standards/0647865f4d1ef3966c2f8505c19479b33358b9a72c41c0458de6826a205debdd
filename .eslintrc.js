module.exports = {
    "extends": [
        "airbnb-base", "plugin:mozilla/recommended"
    ],
    "plugins": [
        "import", "mozilla"
    ],
    "rules": {
        "no-plusplus": "off",
        "func-names": "off",
        "class-methods-use-this": ["on", "exceptMethods": {[
            "supportsCommand",
            "isCommandEnabled",
            "doCommand",
            "onEvent"
        ]}]
    }
};
