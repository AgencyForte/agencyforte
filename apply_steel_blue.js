import fs from 'fs';

// 1. Update index.css
const cssPath = 'src/index.css';
let css = fs.readFileSync(cssPath, 'utf8');

// Replace --accent-amber with --accent-steel
css = css.replace(/--accent-amber/g, '--accent-steel');
css = css.replace(/#D97706/g, '#475569'); // Steel Blue
css = css.replace(/#F59E0B/g, '#64748B'); // Lighter Steel for gradients
css = css.replace(/#B45309/g, '#334155'); // Darker Steel for hover state

fs.writeFileSync(cssPath, css);


// 2. Update Onboarding.jsx
const onbPath = 'src/pages/Onboarding.jsx';
let onb = fs.readFileSync(onbPath, 'utf8');

onb = onb.replace(/var\(--accent-amber\)/g, 'var(--accent-steel)');
// Replace amber rgba background with steel rgba background (slightly higher opacity needed since it's darker)
onb = onb.replace(/rgba\(217, 119, 6, 0\.05\)/g, 'rgba(71, 85, 105, 0.15)');

fs.writeFileSync(onbPath, onb);

console.log('Steel Blue applied successfully');
