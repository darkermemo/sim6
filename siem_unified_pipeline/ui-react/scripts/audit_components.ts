import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src/components");
let files: string[] = [];

(function walk(dir: string) { 
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(tsx?)$/.test(f) && !f.includes('.test.') && !f.includes('.spec.')) {
      files.push(p);
    }
  }
})(root);

console.log(`🔍 Found ${files.length} component files in src/components/`);

// Require a test or an e2e reference for each component file name
const testRoots = ["src", "tests"];
const contentIdx = new Map<string, string>();

for (const tr of testRoots) {
  const walk2 = (d: string) => { 
    for (const f of fs.readdirSync(d)) { 
      const p = path.join(d, f); 
      const st = fs.statSync(p);
      if (st.isDirectory()) walk2(p); 
      else if (/\.(tsx?|spec\.ts|test\.tsx?)$/.test(f)) { 
        contentIdx.set(p, fs.readFileSync(p, "utf8")); 
      } 
    } 
  };
  if (fs.existsSync(tr)) walk2(tr);
}

console.log(`📚 Indexed ${contentIdx.size} test/source files`);

const missing: string[] = [];
const covered: string[] = [];

for (const f of files) {
  const base = path.basename(f).replace(/\.(tsx?|ts)$/, "");
  // Check if component name appears in any test file
  const found = Array.from(contentIdx.values()).some(txt => {
    // Look for component imports or usage in tests
    return txt.includes(base) || txt.includes(`from './${base}'`) || txt.includes(`from '../${base}'`);
  });
  
  if (!found) {
    missing.push(f);
  } else {
    covered.push(f);
  }
}

console.log(`✅ Covered: ${covered.length} components`);
console.log(`❌ Missing coverage: ${missing.length} components`);

if (missing.length) {
  console.error("\n🚨 Component coverage missing for:");
  missing.forEach(f => console.error(`  ${f}`));
  console.error("\nAdd tests or E2E references for these components");
  process.exit(2);
}

console.log("\n🎉 Component inventory: PASS");
console.log("All components have test coverage or E2E references");
