const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node_modules', 'html-to-docx', 'dist', 'html-to-docx.umd.js');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('@w')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
