"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
// scripts/audit-actions.ts
var ts_morph_1 = require("ts-morph");
var globby_1 = require("globby");
var picocolors_1 = require("picocolors");
var node_fs_1 = require("node:fs");
var ACTION_TAGS = new Set([
    "Button", "DropdownMenuItem", "AlertDialogAction", "DialogTrigger", "SheetTrigger",
    "ContextMenuItem", "CommandItem", "MenuItem", "a", "button", "Link", "Form", "form"
]);
var project = new ts_morph_1.Project({
    tsConfigFilePath: "tsconfig.json",
    skipAddingFilesFromTsConfig: false,
});
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var files, report, _loop_1, _i, _a, sf, outJson, outMd, md;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, (0, globby_1.globby)(["src/**/*.{ts,tsx}"], { gitignore: true })];
            case 1:
                files = _b.sent();
                files.forEach(function (f) { return project.addSourceFileAtPathIfExists(f); });
                report = [];
                _loop_1 = function (sf) {
                    sf.forEachDescendant(function (node) {
                        var _a, _b, _c, _d, _e, _f, _g, _h;
                        if (node.getKind() !== ts_morph_1.SyntaxKind.JsxSelfClosingElement &&
                            node.getKind() !== ts_morph_1.SyntaxKind.JsxElement)
                            return;
                        var el = node.getKind() === ts_morph_1.SyntaxKind.JsxSelfClosingElement
                            ? node.asKind(ts_morph_1.SyntaxKind.JsxSelfClosingElement)
                            : node.asKind(ts_morph_1.SyntaxKind.JsxElement).getOpeningElement();
                        var tag = el.getTagNameNode().getText();
                        if (!ACTION_TAGS.has(tag))
                            return;
                        var attrs = new Map();
                        el.getAttributes().forEach(function (a) {
                            if (a.getKind() === ts_morph_1.SyntaxKind.JsxAttribute) {
                                var at = a.asKind(ts_morph_1.SyntaxKind.JsxAttribute);
                                attrs.set(at.getName(), at);
                            }
                        });
                        var hasOnClick = attrs.has("onClick");
                        var hasOnSelect = attrs.has("onSelect");
                        var hasHref = attrs.has("href");
                        var hasType = (_b = (_a = attrs.get("type")) === null || _a === void 0 ? void 0 : _a.getInitializer()) === null || _b === void 0 ? void 0 : _b.getText().replace(/['"]/g, "");
                        var isSubmit = hasType === "submit";
                        var hasDataAction = attrs.has("data-action");
                        var dataIntent = (_d = (_c = attrs.get("data-intent")) === null || _c === void 0 ? void 0 : _c.getInitializer()) === null || _d === void 0 ? void 0 : _d.getText().replace(/['"]/g, "");
                        var dataEndpoint = (_f = (_e = attrs.get("data-endpoint")) === null || _e === void 0 ? void 0 : _e.getInitializer()) === null || _f === void 0 ? void 0 : _f.getText().replace(/['"]/g, "");
                        // flag empty/noop handlers
                        var onclickInit = ((_h = (_g = attrs.get("onClick")) === null || _g === void 0 ? void 0 : _g.getInitializer()) === null || _h === void 0 ? void 0 : _h.getText()) || "";
                        var noop = /\(\)\s*=>\s*\{\s*\}/.test(onclickInit) || /noop|void 0|return;/.test(onclickInit);
                        // "actionable" if: click/select/submit/nav expected
                        var actionable = tag === "button" || tag === "Button" || tag === "DropdownMenuItem" ||
                            tag === "AlertDialogAction" || tag === "CommandItem" || tag === "a" || tag === "Link";
                        var hasHandlerOrNav = hasOnClick || hasOnSelect || hasHref || isSubmit || dataIntent === "navigate";
                        var missing = actionable && (!hasHandlerOrNav || noop);
                        if (missing || !hasDataAction || (dataIntent === "api" && !dataEndpoint)) {
                            var line = sf.getLineAndColumnAtPos(el.getStart()).line;
                            report.push({
                                file: sf.getFilePath().replace(process.cwd() + "/", ""),
                                line: line,
                                tag: tag,
                                missingHandlerOrNav: missing,
                                noopHandler: noop,
                                hasOnClick: hasOnClick,
                                hasOnSelect: hasOnSelect,
                                hasHref: hasHref,
                                isSubmit: isSubmit,
                                hasDataAction: hasDataAction,
                                dataIntent: dataIntent || null,
                                dataEndpoint: dataEndpoint || null,
                            });
                        }
                    });
                };
                for (_i = 0, _a = project.getSourceFiles(); _i < _a.length; _i++) {
                    sf = _a[_i];
                    _loop_1(sf);
                }
                outJson = "action-audit.json";
                outMd = "action-audit.md";
                node_fs_1.default.writeFileSync(outJson, JSON.stringify(report, null, 2));
                md = __spreadArray(__spreadArray([
                    "# Action Audit Report",
                    "",
                    "Total findings: **".concat(report.length, "**"),
                    "",
                    "## Summary",
                    "- Missing handlers/nav: ".concat(report.filter(function (r) { return r.missingHandlerOrNav; }).length),
                    "- No-op handlers: ".concat(report.filter(function (r) { return r.noopHandler; }).length),
                    "- Missing data-action: ".concat(report.filter(function (r) { return !r.hasDataAction; }).length),
                    "- Missing data-endpoint for API calls: ".concat(report.filter(function (r) { return r.dataIntent === "api" && !r.dataEndpoint; }).length),
                    "",
                    "## Detailed Findings",
                    "",
                    "| file | line | tag | missingHandler | noop | intent | endpoint |",
                    "| --- | ---: | --- | :---: | :---: | --- | --- |"
                ], report.map(function (r) {
                    return "| ".concat(r.file, " | ").concat(r.line, " | ").concat(r.tag, " | ").concat(r.missingHandlerOrNav ? "❌" : "—", " | ").concat(r.noopHandler ? "❌" : "—", " | ").concat(r.dataIntent || "—", " | ").concat(r.dataEndpoint || "—", " |");
                }), true), [
                    ""
                ], false).join("\n");
                node_fs_1.default.writeFileSync(outMd, md);
                console.log(picocolors_1.default.green("\u2714 Wrote ".concat(outJson, " and ").concat(outMd)));
                console.log(picocolors_1.default.yellow("Found ".concat(report.length, " issues to review")));
                if (report.length > 0) {
                    console.log(picocolors_1.default.red("\nTop issues:"));
                    report.slice(0, 5).forEach(function (r) {
                        console.log("  ".concat(picocolors_1.default.cyan(r.file), ":").concat(r.line, " - ").concat(r.tag, " ").concat(r.missingHandlerOrNav ? "(missing handler)" : "", " ").concat(r.noopHandler ? "(noop)" : ""));
                    });
                }
                return [2 /*return*/];
        }
    });
}); })();
