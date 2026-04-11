import HTMLtoDOCX from 'html-to-docx';

async function run() {
  try {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial; }
        </style>
      </head>
      <body>
        <p>Hello world</p>
      </body>
      </html>
    `;
    const buffer = await HTMLtoDOCX(html, null, { margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } });
    console.log("Success with full HTML");
  } catch (e: any) {
    console.error("Error with full HTML:", e.message);
  }

  try {
    const html2 = `
      <style>
        p { font-family: Arial; }
      </style>
      <div>
        <p>Hello world</p>
      </div>
    `;
    const buffer2 = await HTMLtoDOCX(html2, null, { margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } });
    console.log("Success with fragment");
  } catch (e: any) {
    console.error("Error with fragment:", e.message);
  }
}
run();
