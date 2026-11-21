const fs = require('fs');
const path = require('path');

function patchFontkit() {
  try {
    const fkDistDir = path.join(__dirname, '..', 'node_modules', 'fontkit', 'dist');
    if (!fs.existsSync(fkDistDir)) {
      return;
    }
    const files = fs.readdirSync(fkDistDir).filter(
      (f) => f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.mjs')
    );
    for (const file of files) {
      const fullPath = path.join(fkDistDir, file);
      try {
        let content = fs.readFileSync(fullPath, 'utf8');
        if (
          content.includes('getAnchor(anchor) {') &&
          !content.includes('if (!anchor) return { x: 0, y: 0 };')
        ) {
          content = content.replace(
            /getAnchor\(anchor\)\s*\{/g,
            'getAnchor(anchor) { if (!anchor) return { x: 0, y: 0 };'
          );
          fs.writeFileSync(fullPath, content, 'utf8');
          console.log(`[patch-fontkit] Successfully patched ${file}`);
        }
      } catch (err) {
        console.warn(`[patch-fontkit] Could not patch ${file}:`, err.message);
      }
    }
  } catch (e) {
    console.warn('[patch-fontkit] Error:', e.message);
  }
}

patchFontkit();
