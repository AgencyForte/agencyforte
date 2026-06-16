import fs from 'fs';

// 1. Update index.css
const cssPath = 'src/index.css';
let css = fs.readFileSync(cssPath, 'utf8');

// Replace standard blue (#2563EB) and hover blue (#1D4ED8) with Amber (#D97706) in buttons
const oldBtn = `.btn-primary,
.btn-primary-small,
.btn-primary-full {
    background: var(--accent-blue);`;
const newBtn = `.btn-primary,
.btn-primary-small,
.btn-primary-full {
    background: var(--accent-amber);`;
css = css.replace(oldBtn, newBtn);

const oldHover = `.btn-primary:hover,
.btn-primary-small:hover,
.btn-primary-full:hover {
    background: #1D4ED8;
}`;
const newHover = `.btn-primary:hover,
.btn-primary-small:hover,
.btn-primary-full:hover {
    background: #B45309; /* Darker amber for hover */
}`;
css = css.replace(oldHover, newHover);

fs.writeFileSync(cssPath, css);


// 2. Update Onboarding.jsx
const onbPath = 'src/pages/Onboarding.jsx';
let onb = fs.readFileSync(onbPath, 'utf8');

// Replace var(--accent-blue) with var(--accent-amber)
onb = onb.replace(/var\(--accent-blue\)/g, 'var(--accent-amber)');

// Replace blue rgba background with amber rgba background
onb = onb.replace(/rgba\(37, 99, 235, 0\.05\)/g, 'rgba(217, 119, 6, 0.05)');

fs.writeFileSync(onbPath, onb);

console.log('Colors replaced successfully');
