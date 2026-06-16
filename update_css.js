import fs from 'fs';

const cssPath = 'src/index.css';
let css = fs.readFileSync(cssPath, 'utf8');

// Replace accent variables
css = css.replace('--accent-green: #10B981;', '--accent-amber: #D97706; /* Tactical Amber */');
css = css.replace('--grad-accent: linear-gradient(135deg, #10B981 0%, #059669 100%);', '--grad-accent: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);');

// Replace all usages of --accent-green with --accent-amber
css = css.replace(/--accent-green/g, '--accent-amber');

// Re-write the primary buttons to be wireframe terminal inputs
const oldBtn = `.btn-primary,
.btn-primary-small,
.btn-primary-full {
    background: var(--accent-amber);
    color: #FFF;
    border-radius: 4px;
    text-decoration: none;
    font-weight: 600;
    font-family: var(--font-body);
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: none;
}`;

const newBtn = `.btn-primary,
.btn-primary-small,
.btn-primary-full {
    background: rgba(217, 119, 6, 0.05);
    color: var(--accent-amber);
    border: 1px solid var(--accent-amber);
    border-radius: 2px;
    text-decoration: none;
    font-weight: 600;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    box-shadow: inset 0 0 0 transparent;
}
.btn-primary::before, .btn-primary-small::before, .btn-primary-full::before { content: "["; margin-right: 4px; opacity: 0.5; }
.btn-primary::after, .btn-primary-small::after, .btn-primary-full::after { content: "]"; margin-left: 4px; opacity: 0.5; }`;

css = css.replace(oldBtn, newBtn);

const oldHover = `.btn-primary:hover,
.btn-primary-small:hover,
.btn-primary-full:hover {
    background: #059669;
}`;

const newHover = `.btn-primary:hover,
.btn-primary-small:hover,
.btn-primary-full:hover {
    background: rgba(217, 119, 6, 0.15);
    box-shadow: inset 0 0 15px rgba(217, 119, 6, 0.3);
    text-shadow: 0 0 8px rgba(217, 119, 6, 0.6);
}`;

css = css.replace(oldHover, newHover);

fs.writeFileSync(cssPath, css);
console.log('CSS Updated successfully');
