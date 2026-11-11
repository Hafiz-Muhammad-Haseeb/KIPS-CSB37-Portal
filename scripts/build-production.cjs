const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const parse5 = require("parse5");

const Obfuscator = require("javascript-obfuscator");
const postcss = require("postcss");
const cssnano = require("cssnano");
const { minify } = require("terser");
const { minify: minifyHtml } = require("html-minifier-terser");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "frontend");
const OUTPUT = path.join(ROOT, "production-build-protected");
const BACKUPS = path.join(ROOT, "backups");

const timestamp = new Date().toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);

const obfuscationOptions = {
  target: "browser",
  compact: true,
  identifierNamesGenerator: "hexadecimal",

  renameGlobals: false,
  renameProperties: false,
  transformObjectKeys: false,

  stringArray: true,
  stringArrayThreshold: 0.35,
  stringArrayEncoding: ["base64"],
  stringArrayRotate: true,
  stringArrayShuffle: true,

  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  selfDefending: false,

  splitStrings: false,
  numbersToExpressions: false,
  simplify: true,

  sourceMap: false,
  log: false
};

function formatBytes(value) {
  return value < 1024
    ? `${value} B`
    : `${(value / 1024).toFixed(2)} KB`;
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory, base = directory) {
  const results = [];
  const entries = await fs.readdir(directory, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(base, full);

    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic link is not permitted: ${relative}`);
    }

    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === "source-reference") {
        continue;
      }

      results.push(...await listFiles(full, base));
    } else if (entry.isFile()) {
      if (!entry.name.endsWith(".map")) {
        results.push({
          full,
          relative
        });
      }
    }
  }

  return results;
}

async function sha256(file) {
  const data = await fs.readFile(file);

  return crypto
    .createHash("sha256")
    .update(data)
    .digest("hex");
}

async function minifyCss(source) {
  const result = await postcss([
    cssnano({
      preset: "default"
    })
  ]).process(source, {
    from: undefined
  });

  return result.css;
}

async function protectJavaScript(source, filename) {
  const result = await minify(source, {
    ecma: 2020,

    compress: {
      passes: 1,
      unsafe: false,
      drop_console: false,
      drop_debugger: false
    },

    mangle: {
      toplevel: false,
      keep_fnames: true
    },

    format: {
      comments: false
    }
  });

  if (!result.code) { return ""; }

  const protectedCode = Obfuscator.obfuscate(
    result.code,
    {
      ...obfuscationOptions,
      identifiersPrefix: path.basename(filename)
        .replace(/[^a-zA-Z0-9]/g, "") + "_"
    }
  ).getObfuscatedCode();

  new vm.Script(protectedCode, {
    filename
  });

  return protectedCode;
}

async function validateHtmlAssets(html, htmlRelativePath) {
  const tagPattern =
    /<(script|img|link|source|video|audio|iframe)\b[^>]*>/gi;

  let match;

  while ((match = tagPattern.exec(html)) !== null) {
    const tag = match[0];
    const tagName = match[1].toLowerCase();
    const attribute = tagName === "link" ? "href" : "src";

    const attributeMatch = tag.match(
      new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, "i")
    );

    if (!attributeMatch) continue;

    const value = attributeMatch[1].trim();

    if (
      !value ||
      /^(https?:|\/\/|data:|blob:|mailto:|tel:|javascript:|#)/i.test(value)
    ) {
      continue;
    }

    const clean = decodeURIComponent(
      value.split(/[?#]/)[0]
    );

    const htmlOutputPath = path.join(
      OUTPUT,
      htmlRelativePath
    );

    const target = clean.startsWith("/")
      ? path.resolve(OUTPUT, clean.replace(/^\/+/, ""))
      : path.resolve(path.dirname(htmlOutputPath), clean);

    if (!target.startsWith(OUTPUT + path.sep) && target !== OUTPUT) {
      throw new Error(`Invalid asset path: ${value}`);
    }

    if (!(await exists(target))) {
      throw new Error(
        `Missing production asset referenced in ${htmlRelativePath}: ${value}`
      );
    }
  }
}

function externalizeInlineHandlers(html, handlers) {
  const document = parse5.parse(html);
  const adapter = parse5.defaultTreeAdapter;

  let count = 0;
  let bodyNode = null;
  let firstScript = null;

  function walk(node) {
    if (node.tagName === "body") {
      bodyNode = node;
    }

    if (node.tagName === "script" && !firstScript) {
      firstScript = node;
    }

    if (Array.isArray(node.attrs)) {
      const kept = [];

      for (const attr of node.attrs) {
        const name = attr.name.toLowerCase();

        if (/^on[a-z]+$/.test(name)) {
          const expression = String(attr.value || "").trim();

          if (!expression) continue;

          const eventType = name.slice(2);
          const generatedAttribute = "data-csb-handler-" + eventType;

          if (node.attrs.some(a => a.name === generatedAttribute)) {
            throw new Error("Generated handler attribute collision: " + generatedAttribute);
          }

          // Validate handler JavaScript syntax at build time.
          new vm.Script("(function(event) {\n" + expression + "\n})");

          const id = String(handlers.length);

          kept.push({
            name: generatedAttribute,
            value: id
          });

          handlers.push({
            id,
            eventType,
            expression
          });

          count++;
        } else {
          kept.push(attr);
        }
      }

      node.attrs = kept;
    }

    for (const child of node.childNodes || []) {
      walk(child);
    }
  }

  walk(document);

  if (count > 0) {
    if (!bodyNode) {
      throw new Error("HTML body element not found.");
    }

    const script = adapter.createElement(
      "script",
      "http://www.w3.org/1999/xhtml",
      [
        { name: "src", value: "js/inline-handlers.js" },
        { name: "defer", value: "" }
      ]
    );

    // Insert before other deferred application scripts.
    if (firstScript && firstScript.parentNode) {
      adapter.insertBefore(
        firstScript.parentNode,
        script,
        firstScript
      );
    } else {
      adapter.appendChild(bodyNode, script);
    }
  }

  return {
    html: parse5.serialize(document),
    count
  };
}

function createInlineHandlerModule(handlers) {
  const definitions = handlers.map(handler => {
    const expression = handler.expression.trim().replace(/;+\s*$/, "");

    return JSON.stringify(handler.id) +
      ": function(event) {\nreturn (" +
      expression +
      ");\n}";
  }).join(",\n");
  const eventTypes = [
    ...new Set(handlers.map(handler => handler.eventType))
  ];

  const bindings = eventTypes.map(eventType => {
    const attribute = "data-csb-handler-" + eventType;

    return [
      "document.querySelectorAll(" + JSON.stringify("[" + attribute + "]") + ")",
      ".forEach(function(element) {",
      "const id = element.getAttribute(" + JSON.stringify(attribute) + ");",
      "const callback = handlers[id];",
      'if (typeof callback !== "function") return;',
      "element.addEventListener(" + JSON.stringify(eventType) + ", function(event) {",
      "const result = callback.call(this, event);",
      "if (result === false) event.preventDefault();",
      "});",
      "element.removeAttribute(" + JSON.stringify(attribute) + ");",
      "});"
    ].join("");
  }).join("\n");

  return [
    "(function() {",
    '"use strict";',
    "const handlers = {",
    definitions,
    "};",
    bindings,
    "})();"
  ].join("\n");
}
let outputCreated = false;

async function main() {
  if (!(await exists(path.join(SOURCE, "index.html")))) {
    throw new Error("frontend/index.html missing.");
  }

  const sourceFiles = await listFiles(SOURCE, SOURCE);

  if (sourceFiles.length === 0) {
    throw new Error("No frontend source files found.");
  }

  await fs.mkdir(BACKUPS, {
    recursive: true
  });

  const backupDirectory = path.join(
    BACKUPS,
    `frontend-before-protection-${timestamp}`
  );

  await fs.mkdir(backupDirectory, {
    recursive: true
  });

  console.log("\n1. Creating original frontend backup...");

  const backupFrontend = path.join(
    backupDirectory,
    "frontend"
  );

  await fs.cp(SOURCE, backupFrontend, {
    recursive: true
  });

  for (const file of sourceFiles) {
    const backupFile = path.join(
      backupFrontend,
      path.relative(SOURCE, file.full)
    );

    const originalHash = await sha256(file.full);
    const backupHash = await sha256(backupFile);

    if (originalHash !== backupHash) {
      throw new Error(
        `Backup hash verification failed: ${file.relative}`
      );
    }
  }

  console.log("Original backup verified successfully.");

  if (await exists(OUTPUT)) {
    throw new Error("Refusing to overwrite existing production output: " + OUTPUT);
  }

  await fs.mkdir(OUTPUT, {
    recursive: true
  });

  outputCreated = true;

  const report = [];
  let htmlCount = 0;
  let jsCount = 0;
  let cssCount = 0;
  const externalizedHandlers = [];

  console.log("\n2. Processing frontend files...");

  for (const file of sourceFiles) {
    const extension = path.extname(file.full).toLowerCase();

    const destination = path.join(
      OUTPUT,
      file.relative
    );

    await fs.mkdir(path.dirname(destination), {
      recursive: true
    });

    const sourceContent = await fs.readFile(
      file.full,
      "utf8"
    );

    let outputContent = sourceContent;
    let action = "Copied";

    if (extension === ".js") {
      outputContent = await protectJavaScript(
        sourceContent,
        file.relative
      );

      action = "Terser + Obfuscator";
      jsCount++;
    }

    else if (extension === ".css") {
      outputContent = await minifyCss(sourceContent);

      action = "CSSNano";
      cssCount++;
    }

    else if (extension === ".html") {
      const extracted = externalizeInlineHandlers(
        sourceContent,
        externalizedHandlers
      );

      outputContent = await minifyHtml(
        extracted.html,
        {
          collapseWhitespace: true,
          conservativeCollapse: false,
          preserveLineBreaks: false,

          removeComments: true,
          removeOptionalTags: false,
          removeAttributeQuotes: false,
          removeEmptyAttributes: false,
          removeRedundantAttributes: false,

          normalizeAttributeValues: false,
          keepClosingSlash: true,
          useShortDoctype: true,

          minifyCSS: async (css) => {
            return await minifyCss(css);
          },

          minifyJS: async (javascript, inline) => {
            if (inline) {
              return javascript;
            }

            return await protectJavaScript(
              javascript,
              `${file.relative}:inline-script`
            );
          }
        }
      );

      action = "HTML Minifier + Inline JS/CSS";
      htmlCount++;
    }

    await fs.writeFile(
      destination,
      outputContent,
      "utf8"
    );

    const originalBytes = Buffer.byteLength(sourceContent);
    const outputBytes = Buffer.byteLength(outputContent);

    report.push({
      file: file.relative,
      action,
      originalBytes,
      outputBytes
    });

    console.log(
      `${action}: ${file.relative} | ` +
      `${formatBytes(originalBytes)} -> ${formatBytes(outputBytes)}`
    );
  }

if (externalizedHandlers.length > 0) {
    const handlerSource = createInlineHandlerModule(externalizedHandlers);

    const protectedHandlerSource = await protectJavaScript(
      handlerSource,
      "inline-handlers.js"
    );

    const handlerPath = path.join(
      OUTPUT,
      "js",
      "inline-handlers.js"
    );

    await fs.mkdir(path.dirname(handlerPath), {
      recursive: true
    });

    await fs.writeFile(
      handlerPath,
      protectedHandlerSource,
      "utf8"
    );

    report.push({
      file: "js/inline-handlers.js",
      action: "Externalized + Terser + Obfuscator",
      originalBytes: Buffer.byteLength(handlerSource),
      outputBytes: Buffer.byteLength(protectedHandlerSource)
    });

    jsCount++;

    console.log(
      "Externalized + Terser + Obfuscator: " +
      "js/inline-handlers.js | " +
      formatBytes(Buffer.byteLength(handlerSource)) +
      " -> " +
      formatBytes(Buffer.byteLength(protectedHandlerSource))
    );
  }
  console.log("\n3. Checking HTML asset references...");

  for (const file of sourceFiles.filter(
    item => path.extname(item.full).toLowerCase() === ".html"
  )) {
    const html = await fs.readFile(
      path.join(OUTPUT, file.relative),
      "utf8"
    );

    await validateHtmlAssets(html, file.relative);
  }

  const reportPath = path.join(
    backupDirectory,
    "build-report.json"
  );

  await fs.writeFile(
    reportPath,
    JSON.stringify({
      createdAt: new Date().toISOString(),
      source: "frontend",
      output: "production-build",
      sourceReferenceExcluded: true,
      sourceMapsIncluded: false,
      htmlCount,
      cssCount,
      jsCount,
      files: report
    }, null, 2),
    "utf8"
  );

  console.log("\n========== PRODUCTION BUILD SUCCESS ==========");
  console.log(`HTML files: ${htmlCount}`);
  console.log(`CSS files: ${cssCount}`);
  console.log(`JavaScript files: ${jsCount}`);
  console.log(`Total processed files: ${report.length}`);
  console.log(`Output: ${OUTPUT}`);
  console.log(`Original backup: ${backupFrontend}`);
  console.log(`Build report: ${reportPath}`);
  console.log("\nOriginal frontend files were not modified.");
}

main().catch(async error => {
  console.error("\nPRODUCTION BUILD FAILED:");
  console.error(error.stack || error.message);

  if (outputCreated && await exists(OUTPUT)) {
    await fs.rm(OUTPUT, {
      recursive: true,
      force: true
    });

    console.error("Incomplete production-build folder removed.");
  }

  process.exitCode = 1;
});
