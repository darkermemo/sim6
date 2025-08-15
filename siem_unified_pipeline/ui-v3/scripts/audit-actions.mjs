// scripts/audit-actions.mjs
import { Project, SyntaxKind } from "ts-morph";
import { globby } from "globby";
import pc from "picocolors";
import { writeFileSync } from "node:fs";

const ACTION_TAGS = new Set([
  "Button","DropdownMenuItem","AlertDialogAction","DialogTrigger","SheetTrigger",
  "ContextMenuItem","CommandItem","MenuItem","a","button","Link","Form","form"
]);

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
  skipAddingFilesFromTsConfig: false,
});

(async () => {
  const files = await globby(["src/**/*.{ts,tsx}"], { gitignore: true });
  files.forEach(f => project.addSourceFileAtPathIfExists(f));
  const report = [];

  for (const sf of project.getSourceFiles()) {
    sf.forEachDescendant((node) => {
      if (
        node.getKind() !== SyntaxKind.JsxSelfClosingElement &&
        node.getKind() !== SyntaxKind.JsxElement
      ) return;

      const el = node.getKind() === SyntaxKind.JsxSelfClosingElement
        ? node.asKind(SyntaxKind.JsxSelfClosingElement)
        : node.asKind(SyntaxKind.JsxElement).getOpeningElement();

      const tag = el.getTagNameNode().getText();
      if (!ACTION_TAGS.has(tag)) return;

      const attrs = new Map();
      el.getAttributes().forEach(a => {
        if (a.getKind() === SyntaxKind.JsxAttribute) {
          const at = a.asKind(SyntaxKind.JsxAttribute);
          attrs.set(at.getName(), at);
        }
      });

      const hasOnClick = attrs.has("onClick");
      const hasOnSelect = attrs.has("onSelect");
      const hasHref = attrs.has("href");
      const hasType = attrs.get("type")?.getInitializer()?.getText().replace(/['"]/g,"");
      const isSubmit = hasType === "submit";
      const hasDataAction = attrs.has("data-action");
      const dataIntent = attrs.get("data-intent")?.getInitializer()?.getText().replace(/['"]/g,"");
      const dataEndpoint = attrs.get("data-endpoint")?.getInitializer()?.getText().replace(/['"]/g,"");

      // flag empty/noop handlers
      const onclickInit = attrs.get("onClick")?.getInitializer()?.getText() || "";
      const noop = /\(\)\s*=>\s*\{\s*\}/.test(onclickInit) || /noop|void 0|return;/.test(onclickInit);

      // "actionable" if: click/select/submit/nav expected
      const actionable = tag === "button" || tag === "Button" || tag === "DropdownMenuItem" ||
                         tag === "AlertDialogAction" || tag === "CommandItem" || tag === "a" || tag === "Link";

      const hasHandlerOrNav = hasOnClick || hasOnSelect || hasHref || isSubmit || dataIntent === "navigate";
      const missing = actionable && (!hasHandlerOrNav || noop);

      if (missing || !hasDataAction || (dataIntent === "api" && !dataEndpoint)) {
        const { line } = sf.getLineAndColumnAtPos(el.getStart());
        report.push({
          file: sf.getFilePath().replace(process.cwd() + "/", ""),
          line,
          tag,
          missingHandlerOrNav: missing,
          noopHandler: noop,
          hasOnClick, hasOnSelect, hasHref, isSubmit,
          hasDataAction, dataIntent: dataIntent || null,
          dataEndpoint: dataEndpoint || null,
        });
      }
    });
  }

  const outJson = "action-audit.json";
  const outMd = "action-audit.md";
  writeFileSync(outJson, JSON.stringify(report, null, 2));
  const md = [
    "# Action Audit Report",
    "",
    `Total findings: **${report.length}**`,
    "",
    "## Summary",
    `- Missing handlers/nav: ${report.filter(r => r.missingHandlerOrNav).length}`,
    `- No-op handlers: ${report.filter(r => r.noopHandler).length}`,
    `- Missing data-action: ${report.filter(r => !r.hasDataAction).length}`,
    `- Missing data-endpoint for API calls: ${report.filter(r => r.dataIntent === "api" && !r.dataEndpoint).length}`,
    "",
    "## Detailed Findings",
    "",
    "| file | line | tag | missingHandler | noop | intent | endpoint |",
    "| --- | ---: | --- | :---: | :---: | --- | --- |",
    ...report.map(r =>
      `| ${r.file} | ${r.line} | ${r.tag} | ${r.missingHandlerOrNav?"❌":"—"} | ${r.noopHandler?"❌":"—"} | ${r.dataIntent||"—"} | ${r.dataEndpoint||"—"} |`
    ),
    ""
  ].join("\n");
  writeFileSync(outMd, md);
  
  console.log(pc.green(`✔ Wrote ${outJson} and ${outMd}`));
  console.log(pc.yellow(`Found ${report.length} issues to review`));
  if (report.length > 0) {
    console.log(pc.red("\nTop issues:"));
    report.slice(0, 5).forEach(r => {
      console.log(`  ${pc.cyan(r.file)}:${r.line} - ${r.tag} ${r.missingHandlerOrNav ? "(missing handler)" : ""} ${r.noopHandler ? "(noop)" : ""}`);
    });
  }
})();
