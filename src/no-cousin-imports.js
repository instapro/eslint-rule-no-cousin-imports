const path = require("path");

function resolveAliasedPath(
  importPath,
  importerFilePath,
  aliases,
  projectRoot
) {
  if (importPath.startsWith(".")) {
    return path.resolve(path.dirname(importerFilePath), importPath);
  }

  // Check if it's an aliased path before defaulting
  for (const [aliasPattern, targetPatterns] of Object.entries(aliases)) {
    const prefixToMatch = aliasPattern.endsWith("/*")
      ? aliasPattern.slice(0, -1)
      : aliasPattern;

    if (importPath.startsWith(prefixToMatch)) {
      let remainingImportPath = importPath.substring(prefixToMatch.length);
      const targetBase = targetPatterns[0].endsWith("/*")
        ? targetPatterns[0].slice(0, -1)
        : targetPatterns[0];

      // Remove leading slash from remaining path to avoid path.resolve treating it as absolute
      if (remainingImportPath.startsWith("/")) {
        remainingImportPath = remainingImportPath.substring(1);
      }

      return remainingImportPath
        ? path.resolve(projectRoot, targetBase, remainingImportPath)
        : path.resolve(projectRoot, targetBase);
    }
  }

  return importPath;
}

function getPathSegmentsRelativeToRoot(absolutePath, projectRoot) {
  const relativePath = path.relative(projectRoot, absolutePath);
  return relativePath ? relativePath.split(path.sep) : [];
}

function isPathInRuleZone(filePath, zones, projectRoot) {
  if (zones.length === 0) return false;

  return zones.some((zone) => {
    const zonePath = path.resolve(projectRoot, zone.path);
    const relativePath = path.relative(zonePath, filePath);
    // If file is in zone, relative path won't start with ".." or be absolute
    return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  });
}

function matchesSharedPattern(segmentsToCheck, sharedPatterns) {
  if (!segmentsToCheck || segmentsToCheck.length === 0) return false;

  for (const { pattern, type, _segments } of sharedPatterns) {
    // Use pre-computed segments if available, otherwise split once
    const patternSegments = _segments || pattern.split("/");

    if (type === "folder") {
      if (patternSegments.length > segmentsToCheck.length) {
        continue;
      }

      // Check if all pattern segments match from the beginning
      const matches = patternSegments.every((segment, i) => segment === segmentsToCheck[i]);
      if (matches) return true;
      
    } else if (type === "file") {
      if (patternSegments.length > segmentsToCheck.length) {
        continue;
      }
      
      // Check from the end backwards for file patterns
      const matches = patternSegments.every((segment, i) => 
        segment === segmentsToCheck[segmentsToCheck.length - patternSegments.length + i]
      );
      if (matches) return true;
    }
  }

  return false;
}

function analyzeImportRelationship(
  importerAbsolutePath,
  importedAbsolutePath,
  projectRoot,
  sharedPatterns
) {
  const importerSegments = getPathSegmentsRelativeToRoot(
    importerAbsolutePath,
    projectRoot
  );
  const importedSegments = getPathSegmentsRelativeToRoot(
    importedAbsolutePath,
    projectRoot
  );

  const minLength = Math.min(importerSegments.length - 1, importedSegments.length - 1);
  
  // Find the last index where segments are equal
  const mismatchIndex = importerSegments
    .slice(0, minLength)
    .findIndex((segment, i) => segment !== importedSegments[i]);
  
  // If all segments match up to minLength, use minLength - 1, otherwise use the index before the mismatch
  const commonAncestorEndIndex = mismatchIndex === -1 ? minLength - 1 : mismatchIndex - 1;

  const commonAncestorPathSegments = importerSegments.slice(
    0,
    commonAncestorEndIndex + 1
  );
  const importerSegmentsAfterAncestor = importerSegments.slice(
    commonAncestorEndIndex + 1
  );
  const importedSegmentsAfterAncestor = importedSegments.slice(
    commonAncestorEndIndex + 1
  );

  const isCousin =
    importerSegmentsAfterAncestor.length > 1 &&
    importedSegmentsAfterAncestor.length > 1 &&
    importerSegmentsAfterAncestor[0] !== importedSegmentsAfterAncestor[0];

  const isImportTargetShared = matchesSharedPattern(
    importedSegmentsAfterAncestor,
    sharedPatterns
  );

  let isCommonAncestorDirectoryShared = false;
  if (commonAncestorPathSegments.length > 0) {
    const lastSegment = commonAncestorPathSegments[commonAncestorPathSegments.length - 1];
    isCommonAncestorDirectoryShared = sharedPatterns.some(
      ({ pattern, type }) => type === "folder" && !pattern.includes("/") && pattern === lastSegment
    );
  }

  return {
    isCousin,
    isImportTargetShared,
    isCommonAncestorDirectoryShared,
    commonAncestorPathSegments,
    importedSegmentsAfterAncestor,
  };
}

function generateViolationSuggestions(
  commonAncestorPathSegments,
  importedSegmentsAfterAncestor
) {
  const commonAncestorPathString =
    commonAncestorPathSegments.join(path.sep) || "(project root)";
  const commonAncestorLastSegment =
    commonAncestorPathSegments.length > 0
      ? commonAncestorPathSegments[commonAncestorPathSegments.length - 1]
      : null;

  const suggestions = [];
  const commonAncestorDisplay =
    commonAncestorPathString === "(project root)"
      ? commonAncestorPathString
      : `'${commonAncestorPathString}'`;
  const relativeToMsg = `(This pattern is matched relative to a common directory like ${commonAncestorDisplay})`;

  if (commonAncestorLastSegment) {
    suggestions.push(
      `     - To make the common ancestor directory ${commonAncestorDisplay} a shared context for its direct children, add to 'sharedPatterns':\n` +
        `       { pattern: '${commonAncestorLastSegment}', type: 'folder' } (This pattern refers to the name of the directory '${commonAncestorLastSegment}' when it acts as a common ancestor)`
    );
  }

  if (importedSegmentsAfterAncestor.length > 1) {
    const targetParentPathSegments = importedSegmentsAfterAncestor.slice(0, -1);
    const targetParentPattern = targetParentPathSegments.join("/");
    suggestions.push(
      `     - To make the target's path prefix '${targetParentPattern}' (found under common ancestors like ${commonAncestorDisplay}) shared, add to 'sharedPatterns':\n` +
        `       { pattern: '${targetParentPattern}', type: 'folder' } ${relativeToMsg}`
    );
  }

  if (importedSegmentsAfterAncestor.length > 0) {
    const targetFilePattern = importedSegmentsAfterAncestor.join("/");
    suggestions.push(
      `     - To share only the specific file path '${targetFilePattern}' (found under common ancestors like ${commonAncestorDisplay}), add to 'sharedPatterns':\n` +
        `       { pattern: '${targetFilePattern}', type: 'file' } ${relativeToMsg}`
    );
  }

  return suggestions.length > 0
    ? suggestions.join("\n")
    : "     (No specific pattern suggestions for this case; review project structure or global shared locations.)";
}

function formatExistingSharedPatterns(sharedPatterns) {
  if (!sharedPatterns || sharedPatterns.length === 0) {
    return "     None configured.";
  }

  const folderPatterns = sharedPatterns
    .filter((p) => p.type === "folder")
    .map((p) => `'${p.pattern}'`);
  const filePatterns = sharedPatterns
    .filter((p) => p.type === "file")
    .map((p) => `'${p.pattern}'`);

  const parts = [];
  if (folderPatterns.length > 0) {
    parts.push(
      "     - Folder patterns (pattern segments must be a prefix of path segments after common ancestor; or a single-segment pattern can BE the common ancestor name itself):\n" +
        `       ${folderPatterns.join(", ")}`
    );
  }
  if (filePatterns.length > 0) {
    parts.push(
      "     - File patterns (pattern segments must match the end of path segments after common ancestor, e.g., 'dir/file.js' or 'file.js'):\n" +
        `       ${filePatterns.join(", ")}`
    );
  }

  return parts.join("\n");
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow imports between sibling directory trees ('cousin' imports) within specified zones. Exemptions apply if the target path is shared or if the common ancestor directory is shared. Folder and File patterns (which can be multi-segment) are matched relative to the common ancestor directory of an import.",
      recommended: false,
    },
    schema: [
      {
        type: "object",
        properties: {
          zones: {
            type: "array",
            description:
              "An array of paths (relative to project root) that should be considered restricted zones where the rule applies.",
            items: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
            },
            default: [],
          },
          sharedPatterns: {
            type: "array",
            description:
              "Patterns for shared folders or files, matched relative to the common ancestor directory. Folder patterns can be multi-segment (e.g., 'dirA/dirB') and match as a prefix. File patterns can also be multi-segment (e.g., 'dirA/file.js') and match the full relative path from the common ancestor. An import is exempt if (1) its target path segments after the common ancestor match a shared pattern, OR (2) if the single-segment name of the common ancestor path itself matches a shared 'folder' pattern.",
            items: {
              type: "object",
              properties: {
                pattern: { type: "string" },
                type: { type: "string", enum: ["folder", "file"] },
              },
              required: ["pattern", "type"],
            },
            default: [],
          },
          aliases: {
            type: "object",
            description:
              "A map of path aliases to their corresponding file system paths (e.g., {'@/*': ['src/*']}). Paths are relative to project root.",
            additionalProperties: {
              type: "array",
              items: { type: "string" },
            },
            default: {},
          },
          _testProjectRoot: {
            type: "string",
            description: "Internal testing parameter to override project root detection. Not for production use.",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noCousins: [
        "Import from cousin directory '{{importedRelative}}' by '{{importerRelative}}' is not allowed.",
        "\nThis import crosses module boundaries under the common ancestor: '{{commonAncestorPathString}}'.",
        "\nTo resolve this, you have a few options:",
        "1. Reorganize code (Often the preferred architectural solution): Move the shared logic to a common ancestor directory (e.g., within or above '{{commonAncestorPathString}}') or a designated global shared location.",
        "\n   Your project currently has the following shared patterns defined (patterns are matched relative to the common ancestor of an import):",
        "{{existingSharedPatternsList}}",
        "\n2. OR, explicitly allow this import pattern by updating the 'sharedPatterns' option in your ESLint configuration. Based on this specific import, you could consider:",
        "{{violationSuggestions}}",
      ].join("\n"),
    },
  },

  create: (context) => {
    const options = context.options[0] || {};
    const zones = options.zones || [];
    const sharedPatternsConfig = options.sharedPatterns || [];
    const aliasesConfig = options.aliases || {};

    const optimizedSharedPatterns = sharedPatternsConfig.map((pattern) => ({
      ...pattern,
      _segments: pattern.pattern.split("/"),
    }));

    // Handle different ESLint versions and context API changes
    // Support _testProjectRoot for testing environments where context methods may not work properly
    const projectRoot = options._testProjectRoot ||
      (typeof context.cwd === "function"
        ? context.cwd()
        : typeof context.getCwd === "function"
        ? context.getCwd()
        : context.cwd || process.cwd());

    if (zones.length === 0) return {};

    const importerAbsolutePath = context.filename;
    const isFileInRuleZone = isPathInRuleZone(importerAbsolutePath, zones, projectRoot);

    return {
      ImportDeclaration(node) {
        const importPathValue = node.source.value;

        if (node.importKind === "type") return;
        // Early exit if file is not in any rule zone
        if (!isFileInRuleZone) return;

        const resolvedImportAbsolutePath = resolveAliasedPath(
          importPathValue,
          importerAbsolutePath,
          aliasesConfig,
          projectRoot
        );

        if (
          !path.isAbsolute(resolvedImportAbsolutePath) ||
          !resolvedImportAbsolutePath.startsWith(projectRoot) ||
          path.resolve(importerAbsolutePath) ===
            path.resolve(resolvedImportAbsolutePath)
        ) {
          return;
        }

        const analysis = analyzeImportRelationship(
          importerAbsolutePath,
          resolvedImportAbsolutePath,
          projectRoot,
          optimizedSharedPatterns
        );

        if (
          analysis.isCousin &&
          !analysis.isImportTargetShared &&
          !analysis.isCommonAncestorDirectoryShared
        ) {
          const commonAncestorPathString =
            analysis.commonAncestorPathSegments.join(path.sep) ||
            "(project root)";

          const violationSuggestions = generateViolationSuggestions(
            analysis.commonAncestorPathSegments,
            analysis.importedSegmentsAfterAncestor
          );

          const existingSharedPatternsList =
            formatExistingSharedPatterns(sharedPatternsConfig);

          context.report({
            node,
            messageId: "noCousins",
            data: {
              importerRelative: path.relative(
                projectRoot,
                importerAbsolutePath
              ),
              importedRelative: path.relative(
                projectRoot,
                resolvedImportAbsolutePath
              ),
              commonAncestorPathString: commonAncestorPathString,
              existingSharedPatternsList: existingSharedPatternsList,
              violationSuggestions: violationSuggestions,
            },
          });
        }
      },
    };
  },
};

// For testing purposes only - these exports won't interfere with ESLint
if (
  typeof module !== "undefined" &&
  module.exports &&
  process.env.NODE_ENV === "test"
) {
  module.exports.internals = {
    resolveAliasedPath,
    getPathSegmentsRelativeToRoot,
    isPathInRuleZone,
    matchesSharedPattern,
    analyzeImportRelationship,
    generateViolationSuggestions,
    formatExistingSharedPatterns,
  };
}
