
const HTMLToDOCX = require('html-to-docx');
const fs = require('fs');

async function test() {
    const html = `
        <p style="line-height: 1.5;">Line height 1.5</p>
        <p style="line-height: 2;">Line height 2</p>
        <p style="line-height: 24pt;">Line height 24pt</p>
    `;

    try {
        const docx = await HTMLToDOCX(html, null, {
            table: { row: { cantSplit: true } },
            footer: true,
            pageNumber: true,
        });

        fs.writeFileSync('test-lh.docx', docx);
        console.log('test-lh.docx created');
    } catch (e) {
        console.error(e);
    }
}

test();
