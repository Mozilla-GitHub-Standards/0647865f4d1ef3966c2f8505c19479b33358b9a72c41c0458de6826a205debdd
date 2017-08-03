/* eslint-env node, mocha */

// for unhandled promise rejection debugging
process.on("unhandledRejection", r => console.log(r)); // eslint-disable-line no-console

const assert = require("assert");
const utils = require("./utils");
const clipboardy = require("clipboardy");
const webdriver = require("selenium-webdriver");

const By = webdriver.By;
const until = webdriver.until;
const MAX_TIMES_TO_SHOW = 5; // this must match MAX_TIMES_TO_SHOW in bootstrap.js

// TODO create new profile per test?
// then we can test with a clean profile every time

async function regularPageAnimationTest(driver) {
  await utils.gotoURL(driver, "http://mozilla.org");
  await utils.copyUrlBar(driver);
  const { hasClass, hasColor } = await utils.testAnimation(driver);
  assert(hasClass && hasColor);
}

async function regularPagePopupTest(driver) {
  await utils.gotoURL(driver, "http://mozilla.org");
  await utils.copyUrlBar(driver);
  const panelOpened = await utils.testPanel(driver, "share-button-panel");
  assert(panelOpened);
}

async function overflowMenuTest(driver) {
  const window = driver.manage().window();
  const currentSize = await window.getSize();
  await window.setSize(640, 480);
  await utils.copyUrlBar(driver);
  assert(!(await utils.testPanel(driver, "share-button-panel")));
  await window.setSize(currentSize.width, currentSize.height);
}

async function postTestReset(driver) {
  // wait for the animation to end before running subsequent tests
  await utils.waitForAnimationEnd(driver);
  // close the popup
  await utils.closePanel(driver);
  // reset the counter pref to 0 so that the treatment is always shown
  await driver.executeAsyncScript((callback) => {
    Components.utils.import("resource://gre/modules/Preferences.jsm");
    const COUNTER_PREF = "extensions.sharebuttonstudy.counter";
    if (Preferences.has(COUNTER_PREF)) {
      Preferences.set(COUNTER_PREF, 0);
    }
    callback();
  });
}

async function setTreatment(driver, treatment) {
  return driver.executeAsyncScript((treatmentArg, callback) => {
    Components.utils.import("resource://gre/modules/Preferences.jsm");
    // using the rest parameters, treatment = args[0]
    Preferences.set("extensions.sharebuttonstudy.treatment", treatmentArg);
    callback();
  }, treatment);
}

describe.only("Basic Functional Tests", function() {
  // This gives Firefox time to start, and us a bit longer during some of the tests.
  this.timeout(15000);

  let driver;
  let addonId;

  before(async() => {
    driver = await utils.promiseSetupDriver();
    await setTreatment(driver, "doorHangerAddToToolbar");
    // install the addon
    addonId = await utils.installAddon(driver);
    // add the share-button to the toolbar
    await utils.addShareButton(driver);
  });

  after(async() => driver.quit());

  afterEach(async() => postTestReset(driver));

  it("should have a URL bar", async() => {
    const urlBar = await utils.promiseUrlBar(driver);
    const text = await urlBar.getAttribute("placeholder");
    assert.equal(text, "Search or enter address");
  });

  it("should have a share button", async() => {
    const button = await utils.promiseAddonButton(driver);
    const text = await button.getAttribute("tooltiptext");
    assert.equal(text, "Share this page");
  });

  it.only("should have copy paste working", async() => {
    // FIXME testText will automatically be treated as a URL
    // which means that it will be formatted and the clipboard
    // value will be different unless we pass in a URL text at
    // the start
    const testText = "about:test";

    // write dummy value just in case testText is already in clipboard
    await clipboardy.write("foobar");
    const urlBar = await utils.promiseUrlBar(driver);
    await urlBar.sendKeys(testText);

    await utils.copyUrlBar(driver);
    const clipboard = await clipboardy.read();
    console.log(clipboard);
    assert(clipboard === testText);
  });

  it(`should only trigger MAX_TIMES_TO_SHOW = ${MAX_TIMES_TO_SHOW} times`, async() => {
    // NOTE: if this test fails, make sure MAX_TIMES_TO_SHOW has the correct value.

    await utils.gotoURL(driver, "http://mozilla.org");
    for (let i = 0; i < MAX_TIMES_TO_SHOW; i++) {
      /* eslint-disable no-await-in-loop */
      await utils.copyUrlBar(driver);
      // wait for the animation to end
      await utils.waitForAnimationEnd(driver);
      // close the popup
      await utils.closePanel(driver);
      /* eslint-enable no-await-in-loop */
    }
    // try to open the panel again, this should fail
    await utils.copyUrlBar(driver);
    const panelOpened = await utils.testPanel(driver);
    const { hasClass, hasColor } = await utils.testAnimation(driver);

    assert(!panelOpened && !hasClass && !hasColor);
  });

  // These tests uninstall the addon before and install the addon after.
  // This lets us assume the addon is installed at the start of each test.
  describe("Addon uninstall tests", () => {
    before(async() => utils.uninstallAddon(driver, addonId));

    after(async() => utils.installAddon(driver));

    it("should no longer trigger animation once uninstalled", async() => {
      await utils.copyUrlBar(driver);
      const { hasClass, hasColor } = await utils.testAnimation(driver);
      assert(!hasClass && !hasColor);
    });

    it("should no longer trigger popup once uninstalled", async() => {
      await utils.copyUrlBar(driver);
      assert(!(await utils.testPanel(driver, "share-button-panel")));
    });

    it("should no longer trigger ask panel once uninstalled", async() => {
      await utils.copyUrlBar(driver);
      assert(!(await utils.testPanel(driver, "share-button-ask-panel")));
    });

    it("should not add the button to the toolbar once uninstalled", async() => {
      await utils.removeShareButton(driver);
      await utils.copyUrlBar(driver);
      const shareButton = await utils.promiseAddonButton(driver);
      assert(!shareButton);
    });
  });
});

describe("Highlight Treatment Tests", function() {
  // This gives Firefox time to start, and us a bit longer during some of the tests.
  this.timeout(15000);

  let driver;
  let addonId;

  before(async() => {
    driver = await utils.promiseSetupDriver();
    await setTreatment(driver, "highlight");
    // install the addon
    addonId = await utils.installAddon(driver);
  });

  after(async() => {
    await utils.uninstallAddon(driver, addonId);
    await driver.quit();
  });

  afterEach(async() => {
    await postTestReset(driver);
    await utils.removeShareButton(driver);
  });

  it("animation should trigger on regular page", async() => {
    await utils.addShareButton(driver);
    await regularPageAnimationTest(driver);
  });

  it("animation should not trigger on disabled page", async() => {
    await utils.addShareButton(driver);
    await utils.gotoURL(driver, "about:blank");

    await utils.copyUrlBar(driver);
    const { hasClass, hasColor } = await utils.testAnimation(driver);
    assert(!hasClass && !hasColor);
  });

  it("animation should not trigger if the share button is not added to toolbar", async() => {
    await utils.gotoURL(driver, "http://mozilla.org");

    await utils.copyUrlBar(driver);
    const { hasClass, hasColor } = await utils.testAnimation(driver);
    assert(!hasClass && !hasColor);
  });

  it("should not trigger treatments if the share button is in the overflow menu", async() => {
    await utils.addShareButton(driver);
    await overflowMenuTest(driver);
  });

  it("should send highlight and copy telemetry pings", async() => {
    await utils.addShareButton(driver);
    await utils.gotoURL(driver, "http://mozilla.org");

    await utils.copyUrlBar(driver);
    const pings = await utils.getMostRecentPingsByType(driver, "shield-study-addon");

    let highlightTelemetrySent = false;
    let copyTelemetrySent = false;
    for (const ping of pings) {
      if (ping.payload.data.attributes.treatment === "highlight") {
        highlightTelemetrySent = true;
      }
      if (ping.payload.data.attributes.event === "copy") {
        copyTelemetrySent = true;
      }
      if (highlightTelemetrySent && copyTelemetrySent) break;
    }
    assert(highlightTelemetrySent && copyTelemetrySent);
  });
});

describe("DoorhangerDoNothing Treatment Tests", function() {
  // This gives Firefox time to start, and us a bit longer during some of the tests.
  this.timeout(15000);

  let driver;
  let addonId;

  before(async() => {
    driver = await utils.promiseSetupDriver();
    await setTreatment(driver, "doorhangerDoNothing");
    // install the addon
    addonId = await utils.installAddon(driver);
  });

  after(async() => {
    await utils.uninstallAddon(driver, addonId);
    await driver.quit();
  });

  afterEach(async() => {
    await postTestReset(driver);
    await utils.removeShareButton(driver);
  });

  it("popup should trigger on regular page", async() => {
    await utils.addShareButton(driver);
    await regularPagePopupTest(driver);
  });

  it("popup should not trigger on disabled page", async() => {
    await utils.addShareButton(driver);
    await utils.gotoURL(driver, "about:blank");

    await utils.copyUrlBar(driver);
    const panelOpened = await utils.testPanel(driver, "share-button-panel");
    assert(!panelOpened);
    await utils.removeShareButton(driver);
  });

  it("popup should not trigger if the share button is not added to toolbar", async() => {
    await utils.gotoURL(driver, "http://mozilla.org");

    await utils.copyUrlBar(driver);
    const panelOpened = await utils.testPanel(driver, "share-button-panel");
    assert(!panelOpened);
  });

  it("should not trigger treatments if the share button is in the overflow menu", async() => {
    await utils.addShareButton(driver);
    await overflowMenuTest(driver);
  });

  it("should send doorhanger and copy telemetry pings", async() => {
    await utils.gotoURL(driver, "http://mozilla.org");

    await utils.copyUrlBar(driver);
    const pings = await utils.getMostRecentPingsByType(driver, "shield-study-addon");

    let doorhangerTelemetrySent = false;
    let copyTelemetrySent = false;
    for (const ping of pings) {
      if (ping.payload.data.attributes.treatment === "doorhanger") {
        doorhangerTelemetrySent = true;
      }
      if (ping.payload.data.attributes.event === "copy") {
        copyTelemetrySent = true;
      }
      if (doorhangerTelemetrySent && copyTelemetrySent) break;
    }
    assert(doorhangerTelemetrySent && copyTelemetrySent);
  });
});

describe("DoorhangerAskToAdd Treatment Tests", function() {
  // This gives Firefox time to start, and us a bit longer during some of the tests.
  this.timeout(15000);

  let driver;
  let addonId;

  before(async() => {
    driver = await utils.promiseSetupDriver();
    await setTreatment(driver, "doorhangerAskToAdd");
    // install the addon
    addonId = await utils.installAddon(driver);
  });

  after(async() => {
    await utils.uninstallAddon(driver, addonId);
    await driver.quit();
  });

  afterEach(async() => {
    await postTestReset(driver);
    await utils.removeShareButton(driver);
  });

  it("should open an ask panel on a regular page without the share button", async() => {
    await utils.gotoURL(driver, "http://mozilla.org");

    await utils.copyUrlBar(driver);
    const panelOpened = await utils.testPanel(driver, "share-button-ask-panel");
    assert(panelOpened);
  });

  it("should open a standard panel on a regular page with the share button", async() => {
    await utils.addShareButton(driver);
    await regularPagePopupTest(driver);
  });

  it("should not open an ask panel on a regular page with the share button", async() => {
    await utils.addShareButton(driver);

    await utils.gotoURL(driver, "http://mozilla.org");

    await utils.copyUrlBar(driver);
    const askPanelOpened = await utils.testPanel(driver, "share-button-ask-panel");
    assert(!askPanelOpened);
  });

  it("should not open an ask panel on a regular page if the share button is in the overflow menu", async() => {
    await utils.addShareButton(driver);

    const window = driver.manage().window();
    const currentSize = await window.getSize();
    await window.setSize(640, 480);
    await utils.copyUrlBar(driver);
    assert(!await utils.testPanel(driver, "share-button-ask-panel"));
    await window.setSize(currentSize.width, currentSize.height);
  });

  it("should not open an ask panel on a disabled page", async() => {
    await utils.gotoURL(driver, "about:blank");

    await utils.copyUrlBar(driver);
    const panelOpened = await utils.testPanel(driver, "share-button-ask-panel");
    assert(!panelOpened);
  });

  it("should add the button to the toolbar upon clicking on ask panel", async() => {
    await utils.gotoURL(driver, "http://mozilla.org");

    await utils.copyUrlBar(driver);
    const panelOpened = await utils.testPanel(driver, "share-button-ask-panel");
    assert(panelOpened);

    const askPanel = driver.wait(until.elementLocated(
      By.id("share-button-ask-panel")), 1000);
    await askPanel.click();
    assert(await utils.promiseAddonButton(driver));
  });

  it("should send ask-to-add and copy telemetry pings", async() => {
    await utils.gotoURL(driver, "http://mozilla.org");

    await utils.copyUrlBar(driver);
    const pings = await utils.getMostRecentPingsByType(driver, "shield-study-addon");

    let askToAddTelemetrySent = false;
    let copyTelemetrySent = false;
    for (const ping of pings) {
      if (ping.payload.data.attributes.treatment === "ask-to-add") {
        askToAddTelemetrySent = true;
      }
      if (ping.payload.data.attributes.event === "copy") {
        copyTelemetrySent = true;
      }
      if (askToAddTelemetrySent && copyTelemetrySent) break;
    }
    assert(askToAddTelemetrySent && copyTelemetrySent);
  });
});

describe("DoorhangerAddToToolbar Treatment Tests", function() {
  // This gives Firefox time to start, and us a bit longer during some of the tests.
  this.timeout(15000);

  let driver;
  let addonId;

  before(async() => {
    driver = await utils.promiseSetupDriver();
    await setTreatment(driver, "doorhangerAddToToolbar");
    // install the addon
    addonId = await utils.installAddon(driver);
  });

  after(async() => {
    await utils.uninstallAddon(driver, addonId);
    await driver.quit();
  });

  afterEach(async() => {
    await postTestReset(driver);
    await utils.removeShareButton(driver);
  });

  it("should add the button to the toolbar upon copy paste on regular page", async() => {
    await utils.gotoURL(driver, "http://mozilla.org");

    await utils.copyUrlBar(driver);
    assert(await utils.promiseAddonButton(driver));
  });

  it("popup should trigger on regular page", async() => {
    await regularPagePopupTest(driver);
  });

  it("should send add-to-toolbar and copy telemetry pings", async() => {
    await utils.gotoURL(driver, "http://mozilla.org");

    await utils.copyUrlBar(driver);
    const pings = await utils.getMostRecentPingsByType(driver, "shield-study-addon");

    let addToToolbarSent = false;
    let copyTelemetrySent = false;
    for (const ping of pings) {
      if (ping.payload.data.attributes.treatment === "add-to-toolbar") {
        addToToolbarSent = true;
      }
      if (ping.payload.data.attributes.event === "copy") {
        copyTelemetrySent = true;
      }
      if (addToToolbarSent && copyTelemetrySent) break;
    }
    assert(addToToolbarSent && copyTelemetrySent);
  });
});

describe("New Window Add-on Functional Tests", function() {
  // This gives Firefox time to start, and us a bit longer during some of the tests.
  this.timeout(15000);

  let driver;

  before(async() => {
    driver = await utils.promiseSetupDriver();
    // set treatment
    await setTreatment(driver, "highlight");
    // install the addon
    await utils.installAddon(driver);
    // add the share-button to the toolbar
    await utils.addShareButton(driver);

    // open a new window and switch to it this will test
    // the new window listener since this window was opened
    // *after* the addon was installed
    await utils.openWindow(driver);
  });

  after(async() => driver.quit());

  afterEach(async() => postTestReset(driver));

  it("animation should trigger on regular page", async() => regularPageAnimationTest(driver));
});
