#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
const { JSDOM } = require("jsdom");
const moveFile = require("move-file").sync;
const mime = require("mime-types");
const mkdirp = require("mkdirp").sync;

const projectFilename =
  process.argv.find((arg) => arg.endsWith(".kdenlive")) || null;

const dryRun = process.argv.includes("--dryRun");

if (!projectFilename || !projectFilename.endsWith(".kdenlive")) {
  console.error("A .kdenlive project file should be specified");
  process.exit(-1);
}

const projectFilePath = path.resolve(process.cwd(), projectFilename);

const fileExists = fs.existsSync(projectFilePath);

if (!fileExists) {
  console.error("The project doesn't exist");
  process.exit(-1);
}

let content = fs.readFileSync(projectFilePath, "utf8");

const projectFolder = path.dirname(projectFilePath);

const dom = new JSDOM(content, { contentType: "text/xml" });
const document = dom.window.document;

const producers = document.querySelectorAll("producer");

const NOT_WANTED_SERVICES = ["color"];

for (const producer of producers) {
  const mltService = producer.querySelector(`property[name="mlt_service"]`)
    .textContent;

  if (NOT_WANTED_SERVICES.includes(mltService)) {
    continue;
  }

  const resource = producer.querySelector(`property[name="resource"]`);
  const warpResource = producer.querySelector(`property[name="warp_resource"]`);

  if (warpResource) {
    processResourceElement(warpResource);
  }

  if (!resource) {
    continue;
  }

  const {
    resourcePath,
    resourceFolderPath,
    newResourcePath,
    newResourcePathAbsolute,
  } = processResourceElement(resource);

  if (!dryRun) {
    mkdirp(resourceFolderPath);
  }

  if (resourcePath !== newResourcePathAbsolute) {
    console.log("Move", resourcePath, "to", newResourcePathAbsolute);

    if (!dryRun && fs.existsSync(resourcePath)) {
      moveFile(resourcePath, newResourcePath);
    }
  }
}

const xmlOutput = `<?xml version='1.0' encoding='utf-8'?>
${document.documentElement.outerHTML}
`;

if (!dryRun) {
  fs.writeFileSync(projectFilePath, xmlOutput, "utf8");
} else {
  console.log(xmlOutput);
}

function processResourceElement(element) {
  let resourcePath = element.textContent;
  const [modification = ""] = /([0-9]*,[0-9]*):/g.exec(resourcePath) || [];

  if (modification) {
    resourcePath = resourcePath.replace(modification, "");
  }

  if (!path.isAbsolute(resourcePath)) {
    resourcePath = path.resolve(projectFolder, resourcePath);
  }

  const resourceName = path.basename(resourcePath);

  let resourceFolderName = "other";

  switch (mime.lookup(resourceName).toString().split("/")[0]) {
    case "video":
      resourceFolderName = "clips";
      break;
    case "image":
      resourceFolderName = "images";
      break;
    case "audio":
      resourceFolderName = "audio";
      break;
    default:
      resourceFolderName = "other";
  }

  const resourceFolderPath = path.resolve(projectFolder, resourceFolderName);

  const newResourcePath =
    "./" +
    path.relative(
      projectFolder,
      path.resolve(resourceFolderPath, resourceName)
    );

  element.innerHTML = `${modification}${newResourcePath}`;

  return {
    modification,
    resourcePath,
    newResourcePath,
    newResourcePathAbsolute: path.resolve(
      projectFolder,
      resourceFolderPath,
      resourceName
    ),
    resourceFolderPath,
  };
}
