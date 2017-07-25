/* to use:

- Recall this file has chrome privileges
- Cu.import in this file will work for any 'general firefox things' (Services,etc)
  but NOT for addon-specific libs
*/

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(config|EXPORTED_SYMBOLS)" }]*/
const EXPORTED_SYMBOLS = ["config"];

// var slug = "shield-example-addon"; // should match chrome.manifest;

const config = {
  study: {
    studyName: "share-button-study", // no spaces, for all the reasons
    variation: {
      name: "ALL",
    }, // optional, use to override/decide
    weightedVariations: [
      { name: "control", weight: 1 },
      { name: "DOORHANGER", weight: 2 },
      { name: "HIGHLIGHT", weight: 0.5 },
    ],
    /** **endings**
      * - keys indicate the 'endStudy' even that opens these.
      * - urls should be static (data) or external, because they have to
      *   survive uninstall
      * - If there is no key for an endStudy reason, no url will open.
      * - usually surveys, orientations, explanations
      */
    endings: {
      /** standard endings */
      "user-disable": {
        baseUrl: "data:,You uninstalled",
      },
      ineligible: {
        baseUrl: "http://www.example.com/?reason=ineligible",
      },
      expired: {
        baseUrl: "http://www.example.com/?reason=expired",
      },
    },
    telemetry: {
      send: true, // assumed false. Actually send pings?
      removeTestingFlag: false,  // Marks pings as testing, set true for actual release
      // TODO "onInvalid": "throw"  // invalid packet for schema?  throw||log
    },
    studyUtilsPath: `./StudyUtils.jsm`,
  },
  async isEligible() {
    // get whatever prefs, addons, telemetry, anything!
    // Cu.import can see 'firefox things', but not package things.
    return true;
  },
  // addon-specific modules to load/unload during `startup`, `shutdown`
  modules: [
    // can use ${slug} here for example
  ],
  // sets the logging for BOTH the bootstrap file AND shield-study-utils
  log: {
    // Fatal: 70, Error: 60, Warn: 50, Info: 40, Config: 30, Debug: 20, Trace: 10, All: -1,
    bootstrap:  {
      level: "Debug",
    },
    studyUtils:  {
      level: "Trace",
    },
  },
};
