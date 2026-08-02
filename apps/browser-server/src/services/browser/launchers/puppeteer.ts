import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// puppeteer-extra's stealth plugin bundles ~17 evasions (webdriver, chrome.runtime,
// navigator.plugins/languages, WebGL vendor, iframe.contentWindow, codecs, …) —
// far more thorough than hand-rolled patches. Registered once at module load,
// here rather than in `startBrowser`, so that every launcher gets the same
// evasions whether it launches a browser or connects to a remote one.
puppeteer.use(StealthPlugin());

export { puppeteer };
