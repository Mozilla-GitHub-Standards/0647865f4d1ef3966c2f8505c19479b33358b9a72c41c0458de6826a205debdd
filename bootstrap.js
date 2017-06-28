const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Console.jsm");
Cu.import("resource://gre/modules/AppConstants.jsm");

const CSS_URI = Services.io.newURI("resource://share-button-study/share_button.css");
const browserWindowWeakMap = new WeakMap();

class CopyController {
  // See https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Property/controllers
  constructor(browserWindow) {
    this.browserWindow = browserWindow;
  }

  supportsCommand(cmd) { return cmd === "cmd_copy" || cmd === "share-button-study"; }

  isCommandEnabled(cmd) { return true; }

  doCommand(cmd) {
    if (cmd === "cmd_copy") {
      const shareButton = this.browserWindow.shareButton;
      if (shareButton !== null) {
        // add the event listener to remove the css class when the animation ends
        shareButton.addEventListener("animationend", this.browserWindow.animationEndListener);
        shareButton.classList.add("social-share-button-on");
      }
    }
    // Iterate over all other controllers and call doCommand on the first controller
    // that supports it
    // Skip until we reach the controller that we inserted
    let i = 0;
    const urlInput = this.browserWindow.urlInput;

    for (; i < urlInput.controllers.getControllerCount(); i++) {
      const curController = urlInput.controllers.getControllerAt(i);
      if (curController.supportsCommand("share-button-study")) {
        i += 1;
        break;
      }
    }
    for (; i < urlInput.controllers.getControllerCount(); i++) {
      const curController = urlInput.controllers.getControllerAt(i);
      if (curController.supportsCommand(cmd)) {
        curController.doCommand(cmd);
        break;
      }
    }
  }

  onEvent(e) {}
}

class BrowserWindow {
  constructor(window) {
    this.window = window;

    // bind functions that are called externally so that `this` will work
    this.animationEndListener = this.animationEndListener.bind(this);
    this.insertCopyController = this.insertCopyController.bind(this);
    this.removeCopyController = this.removeCopyController.bind(this);
    this.addCustomizeListener = this.addCustomizeListener.bind(this);
    this.removeCustomizeListener = this.removeCustomizeListener.bind(this);

    // initialize CopyController
    this.copyController = new CopyController(this);
  }

  get urlInput() {
    // Get the "DOM" elements
    const urlBar = this.window.document.getElementById("urlbar");
    // XUL elements are different than regular children
    return this.window.document.getAnonymousElementByAttribute(urlBar, "anonid", "input");
  }

  get shareButton() {
    return this.window.document.getElementById("social-share-button");
  }

  insertCopyController() {
    // refresh urlInput reference, this is potentially changed by the customize event
    this.urlInput.controllers.insertControllerAt(0, this.copyController);
  }

  removeCopyController() {
    // refresh urlInput reference, this is potentially changed by the customize event
    this.urlInput.controllers.removeController(this.copyController);
  }

  animationEndListener(e) {
    // When the animation is done, we want to remove the CSS class
    // so that we can add the class again upon the next copy and
    // replay the animation
    this.shareButton.classList.remove("social-share-button-on");
  }

  addCustomizeListener() {
    this.window.addEventListener("customizationending", this.insertCopyController);
  }

  removeCustomizeListener() {
    this.window.removeEventListener("customizationending", this.insertCopyController);
  }

  insertCSS() {
    const utils = this.window.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIDOMWindowUtils);
    utils.loadSheet(CSS_URI, utils.AGENT_SHEET);
  }

  removeCSS() {
    const utils = this.window.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIDOMWindowUtils);
    utils.removeSheet(CSS_URI, utils.AGENT_SHEET);
  }
}


function injectExtension(window) {
  const browserWindow = new BrowserWindow(window);
  browserWindowWeakMap.set(window, browserWindow);

  // The customizationending event represents exiting the "Customize..." menu from the toolbar.
  // We need to handle this event because after exiting the customization menu, the copy
  // controller is removed and we can no longer detect text being copied from the URL bar.
  // See DXR:browser/base/content/browser-customization.js
  browserWindow.addCustomizeListener();

  // Load the CSS with the shareButton animation
  browserWindow.insertCSS();

  // insert the copy controller to detect copying from URL bar
  browserWindow.insertCopyController();
}

// see https://dxr.mozilla.org/mozilla-central/rev/53477d584130945864c4491632f88da437353356/xpfe/appshell/nsIWindowMediatorListener.idl
const windowListener = {
  onWindowTitleChange(window, title) { },
  onOpenWindow(xulWindow) {
    // xulWindow is of type nsIXULWindow, we want an nsIDOMWindow
    // see https://dxr.mozilla.org/mozilla-central/rev/53477d584130945864c4491632f88da437353356/browser/base/content/test/general/browser_fullscreen-window-open.js#316
    // for how to change XUL into DOM
    const domWindow = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIDOMWindow);

    // we need to use a listener function so that it's injected
    // once the window is loaded / ready
    const onWindowOpen = (e) => {
      domWindow.removeEventListener("load", this);
      injectExtension(domWindow);
    };

    domWindow.addEventListener("load", onWindowOpen, true);
  },
  onCloseWindow(window) { },
};

this.install = function(data, reason) {};

this.startup = function(data, reason) {
  // iterate over all open windows
  const windowEnumerator = Services.wm.getEnumerator("navigator:browser");
  while (windowEnumerator.hasMoreElements()) {
    const window = windowEnumerator.getNext();
    injectExtension(window);
  }

  // add an event listener for new windows
  Services.wm.addListener(windowListener);
};

this.shutdown = function(data, reason) {
  const windowEnumerator = Services.wm.getEnumerator("navigator:browser");
  while (windowEnumerator.hasMoreElements()) {
    const window = windowEnumerator.getNext();
    const browserWindow = browserWindowWeakMap.get(window);
    // Remove the customizationending listener
    browserWindow.removeCustomizeListener();

    // Remove the CSS
    browserWindow.removeCSS();

    // Remove the copy controller
    browserWindow.removeCopyController();

    // Remove modifications to shareButton (modified in CopyController)
    if (browserWindow.shareButton !== null) {
      // if null this means the user did not copy from the URL bar
      // so we don't have anything to remove
      browserWindow.shareButton.classList.remove("social-share-button-on");
      browserWindow.shareButton.removeEventListener("animationend", browserWindow.animationEndListener);
    }
  }

  // remove event listener for new windows
  Services.wm.removeListener(windowListener);
};

this.uninstall = function(data, reason) {};
