import fs from 'fs';

const cssPath = 'src/index.css';
let css = fs.readFileSync(cssPath, 'utf8');

// The hacky buttons
const hackyBtn = `.btn-primary,
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

const standardBtn = `.btn-primary,
.btn-primary-small,
.btn-primary-full {
    background: var(--accent-blue);
    color: #FFF;
    border-radius: 6px;
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

css = css.replace(hackyBtn, standardBtn);

const hackyHover = `.btn-primary:hover,
.btn-primary-small:hover,
.btn-primary-full:hover {
    background: rgba(217, 119, 6, 0.15);
    box-shadow: inset 0 0 15px rgba(217, 119, 6, 0.3);
    text-shadow: 0 0 8px rgba(217, 119, 6, 0.6);
}`;

const standardHover = `.btn-primary:hover,
.btn-primary-small:hover,
.btn-primary-full:hover {
    background: #1D4ED8;
}`;

css = css.replace(hackyHover, standardHover);

fs.writeFileSync(cssPath, css);
console.log('Reverted to standard blue buttons');
