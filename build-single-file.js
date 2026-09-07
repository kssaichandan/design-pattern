/**
 * build-single-file.js
 * --------------------------------------------------------------
 * The project is written as separate files so the class structure
 * is easy to read. This script flattens them into ONE html file
 * you can email, upload, or open from a USB stick.
 *
 *     node build-single-file.js
 *
 * Output: dist/rideflow.html  (and dist/artifact-body.html, the
 * same page without the <html>/<head> wrapper, for publishing.)
 */

const fs = require("fs");
const path = require("path");

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const html = read("index.html");
const css = read("css/styles.css");

// Pull the script tags out in the order index.html lists them.
const scriptSrcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const js = scriptSrcs.map((src) => "/* ===== " + src + " ===== */\n" + read(src)).join("\n\n");

const body = html
  .slice(html.indexOf("<body>") + 6, html.lastIndexOf("</body>"))
  .replace(/<script src="[^"]+"><\/script>\s*/g, "");

const fontLink =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700' +
  "&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap\">";

const page =
  "<title>RideFlow Pattern Lab</title>\n" +
  fontLink + "\n" +
  "<style>\n" + css + "\n</style>\n" +
  body + "\n" +
  "<script>\n" + js + "\n<" + "/script>\n";

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/artifact-body.html"), page, "utf8");

fs.writeFileSync(
  path.join(root, "dist/rideflow.html"),
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    page.replace(fontLink + "\n", fontLink + "\n</head>\n<body>\n") +
    "</body>\n</html>\n",
  "utf8"
);

console.log("dist/rideflow.html       " + (fs.statSync(path.join(root, "dist/rideflow.html")).size / 1024).toFixed(1) + " KB");
console.log("dist/artifact-body.html  " + (fs.statSync(path.join(root, "dist/artifact-body.html")).size / 1024).toFixed(1) + " KB");
console.log("inlined " + scriptSrcs.length + " scripts");
