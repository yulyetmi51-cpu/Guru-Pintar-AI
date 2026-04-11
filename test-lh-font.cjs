
const HTMLToDOCX = require('html-to-docx');
const fs = require('fs');

async function test() {
    const html = `
        <p style="font-size: 12pt; line-height: 1.5;">12pt font, 1.5 line height</p>
        <p style="font-size: 24pt; line-height: 1.5;">24pt font, 1.5 line height</p>
    `;

    try {
        const docx = await HTMLToDOCX(html, null, {
            table: { row: { cantSplit: true } },
            footer: true,
            pageNumber: true,
        });

        fs.writeFileSync('test-lh-font.docx', docx);
        console.log('test-lh-font.docx created');
    } catch (e) {
        console.error(e);
    }
}

test();
