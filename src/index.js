// Enable/disable the page number settings
/*document.querySelector('#page-numbers').addEventListener('change', event => {
    [...document.querySelectorAll('[id^="page-number-"]')].forEach(el => {
        el.disabled = !event.target.checked;
    });
});*/

// List the file name and enable the generate button
document.querySelector('#upload').addEventListener('change', event => {
    const [file] = event.target.files;
    document.querySelector('#file-name').innerHTML = file.name;
    document.querySelector('#generate').disabled = false;
});

// Generate the booklet when the button is clicked
document.querySelector('#generate').addEventListener('click', event => {
    const [file] = document.querySelector('#upload').files;
    const reader = new FileReader();
    reader.addEventListener('load', async event => {
        const doc = new Uint8Array(event.target.result);
        const pdf = coherentpdf.fromMemory(doc, '');
        const signatures = bookletize(pdf);
        const output = coherentpdf.mergeSimple(signatures);
        if (document.querySelector('#zip-download').checked) {
            var zip = new JSZip();
            zip.file('output.pdf', new Blob([coherentpdf.toMemory(output, false, false)], {type: "application/pdf"}));
            for (let i = 0; i < signatures.length; i++) {
                zip.file(`output-${i < 9 ? `0${i + 1}` : i + 1}.pdf`, new Blob([coherentpdf.toMemory(signatures[i], false, false)], {type: "application/pdf"}));
            }
            const blob = await zip.generateAsync({type: "blob"});
            saveAs(blob, "output.zip");
        } else {
            saveAs(new Blob([coherentpdf.toMemory(output, false, false)], {type: "application/pdf"}), "output.pdf");
        }
    });
    reader.readAsArrayBuffer(file);
});

function bookletize (pdf) {
    let pageCount = coherentpdf.rangeLength(coherentpdf.all(pdf));

    // Apply page range
    const pageRangeInput = document.querySelector('#page-range').value;
    const ranges = pageRangeInput.split(',').map(range => range.trim()).map(range => {
        if (/\-/.test(range)) {
            let ends = range.split('-').map(e => e.trim());
            return coherentpdf.range(Number(ends[0]), ends[1] === 'end' ? pageCount : Number(ends[1]));
        } else {
            const page = range === 'end' ? pageCount : Number(range);
            return coherentpdf.range(page, page);
        }
    });
    const trimmedPages = ranges.flat();
    const trimmed = coherentpdf.selectPages(pdf, trimmedPages);
    pageCount = coherentpdf.rangeLength(coherentpdf.all(trimmed));
    
    // Add blank pages to force a multiple of 4
    if (pageCount % 4 > 0) {
        const pagesToAdd = 4 - (pageCount % 4);
        for (let i = 0; i < pagesToAdd; i++) {
            if (document.querySelector('#force-last-page').checked) {
                coherentpdf.padBefore(trimmed, [pageCount]);
            } else {
                coherentpdf.padAfter(trimmed, [pageCount]);
            }
        }
    }
    pageCount = coherentpdf.rangeLength(coherentpdf.all(trimmed));
    
    // Reorder pages based on signature size
    const sheetsPerSignatureInput = document.querySelector('#signature-count').value;
    const sheetsPerSignature = sheetsPerSignatureInput === 'all' ? pageCount / 4 : Number(sheetsPerSignatureInput);
    const pagesPerSignature = sheetsPerSignature * 4;
    const signatureCount = Math.ceil(pageCount / pagesPerSignature);
    const newOrder = [];
    for (let s = 0; s < signatureCount; s++) {
        const adjustForEnd = s === signatureCount - 1 ? signatureCount * pagesPerSignature - pageCount : 0;
        for (let p = 0; p < pagesPerSignature; p++) {
            if (pagesPerSignature * s + p > pageCount) break;
            const targetSum = 1 + pagesPerSignature * (2 * s + 1) - adjustForEnd;
            if (p === 0) {
                newOrder.push(pagesPerSignature * (s + 1) - adjustForEnd);
            } else if (p === 1 || Math.abs(newOrder[newOrder.length - 1] - newOrder[newOrder.length - 2]) === 1) {
                newOrder.push(targetSum - newOrder[newOrder.length - 1]);
            } else {
                newOrder.push(newOrder[newOrder.length - 1] < pagesPerSignature * (s + 1) - pagesPerSignature / 2 ? newOrder[newOrder.length - 1] + 1 : newOrder[newOrder.length - 1] - 1);
            }
        }
    }
    const reordered = coherentpdf.selectPages(trimmed, newOrder);
    
    // Add page numbers
    /*if (document.querySelector('#page-numbers').checked) {
        const pageNumberRangeInput = document.querySelector('#page-number-range').value;
        const pageNumberRange = pageNumberRangeInput.split('-').map(range => range.trim()).map(range => range === 'end' ? pageCount : Number(range));
        if (pageNumberRange.length === 1) pageNumberRange.push(pageNumberRange[0]);
        const initialPage = Number(document.querySelector('#page-number-start').value);
        for (let i = 0; i < 1 + pageNumberRange[1] - pageNumberRange[0]; i++) {
            coherentpdf.addTextSimple(reordered, coherentpdf.range(i + initialPage, i + initialPage), (i + initialPage).toString(), coherentpdf.bottom, 8, 0, coherentpdf.timesBold, 12);
        }
    }*/

    // Split into separate signatures
    const signatures = [];
    for (let i = 0; i < signatureCount; i++) {
        signatures.push(coherentpdf.selectPages(reordered, coherentpdf.range(1 + i * pagesPerSignature, Math.min(pagesPerSignature * (i + 1), pageCount))));
    }

    // Create individual booklets to return
    signatures.forEach(signature => {
        coherentpdf.twoUp(signature);
        coherentpdf.rotate(signature, coherentpdf.all(signature), 90);
        if (document.querySelector('#portrait-output').checked) {
            coherentpdf.rotate(signature, coherentpdf.even(coherentpdf.all(signature)), 180);
            coherentpdf.rotate(signature, coherentpdf.odd(coherentpdf.all(signature)), 360);
        }
    });
    return signatures;
}