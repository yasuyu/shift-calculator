const shiftImageInput = document.getElementById('imageInput');
const rowMode = document.getElementById('rowMode');
const rowCanvas = document.getElementById('rowCanvas');
const rowGuide = document.getElementById('rowGuide');
const rowMonth = document.getElementById('rowMonth');
const rowReset = document.getElementById('rowReset');
const rowZoom = document.getElementById('rowZoom');

const cornerLabels = ['左上', '右上', '右下', '左下'];
let rowImage = null;
let rowCorners = [];

async function loadShiftImage(file) {
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        return image;
    } catch {
        throw new Error('画像を開けませんでした。PNG または JPEG で試してください。');
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function resizeShiftImage(file) {
    const image = await loadShiftImage(file);
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
}

function drawRowSelection() {
    const context = rowCanvas.getContext('2d');
    context.clearRect(0, 0, rowCanvas.width, rowCanvas.height);
    if (!rowImage) return;

    const scale = rowCanvas.width / rowImage.naturalWidth;
    context.save();
    context.scale(scale, scale);
    context.drawImage(rowImage, 0, 0);
    if (rowCorners.length) {
        context.beginPath();
        context.moveTo(rowCorners[0].x, rowCorners[0].y);
        for (const point of rowCorners.slice(1)) context.lineTo(point.x, point.y);
        if (rowCorners.length === 4) {
            context.closePath();
            context.fillStyle = 'rgba(37, 99, 235, 0.22)';
            context.fill();
        }
        context.strokeStyle = '#2563eb';
        context.lineWidth = 3 / scale;
        context.stroke();

        for (const point of rowCorners) {
            context.beginPath();
            context.arc(point.x, point.y, 5 / scale, 0, 2 * Math.PI);
            context.fillStyle = '#2563eb';
            context.fill();
        }
    }
    context.restore();
}

shiftImageInput.addEventListener('change', async () => {
    const file = shiftImageInput.files[0];
    rowImage = null;
    rowCorners = [];
    rowMode.hidden = !file;
    rowCanvas.hidden = true;
    rowReset.disabled = true;
    if (!file) return;

    rowGuide.textContent = '画像を読み込み中…';
    try {
        const image = await loadShiftImage(file);
        if (shiftImageInput.files[0] !== file) return;
        rowImage = image;
        const scale = Math.min(1, 1600 / image.naturalWidth);
        rowCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        rowCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        rowCanvas.hidden = false;
        drawRowSelection();
        rowGuide.textContent = '左上をクリックしてください。';
    } catch (error) {
        if (shiftImageInput.files[0] === file) rowGuide.textContent = error.message;
    }
});

rowCanvas.addEventListener('click', (event) => {
    if (!rowImage || rowCorners.length === 4) return;
    const bounds = rowCanvas.getBoundingClientRect();
    rowCorners.push({
        x: (event.clientX - bounds.left) / bounds.width * rowImage.naturalWidth,
        y: (event.clientY - bounds.top) / bounds.height * rowImage.naturalHeight
    });
    rowReset.disabled = false;
    rowGuide.textContent = rowCorners.length === 4
        ? '範囲を選択しました。青い枠が1行分であることを確認してください。'
        : `${cornerLabels[rowCorners.length]}をクリックしてください。`;
    drawRowSelection();
});

rowReset.addEventListener('click', () => {
    rowCorners = [];
    rowReset.disabled = true;
    rowGuide.textContent = '左上をクリックしてください。';
    drawRowSelection();
});

rowZoom.addEventListener('change', () => {
    rowCanvas.style.width = `${rowZoom.value}%`;
});

function makeDateCellImage(image, corners, month, days) {
    const [topLeft, topRight, bottomRight, bottomLeft] = corners;
    const left = (topLeft.x + bottomLeft.x) / 2;
    const right = (topRight.x + bottomRight.x) / 2;
    const sourceWidth = (right - left) / days;
    if (topLeft.x >= topRight.x || bottomLeft.x >= bottomRight.x ||
        topLeft.y >= bottomLeft.y || topRight.y >= bottomRight.y || sourceWidth < 8) {
        throw new Error('左上・右上・右下・左下の順で、月初から月末までの1行を選び直してください。');
    }

    const columns = 7;
    const cellWidth = 144;
    const cellHeight = 146;
    const canvas = document.createElement('canvas');
    canvas.width = columns * cellWidth;
    canvas.height = Math.ceil(days / columns) * cellHeight;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = 'bold 24px sans-serif';
    context.textAlign = 'center';

    for (let day = 1; day <= days; day++) {
        const index = day - 1;
        const middle = (index + 0.5) / days;
        const top = topLeft.y + (topRight.y - topLeft.y) * middle;
        const bottom = bottomLeft.y + (bottomRight.y - bottomLeft.y) * middle;
        const sourceHeight = bottom - top;
        const x = index % columns * cellWidth;
        const y = Math.floor(index / columns) * cellHeight;

        context.strokeStyle = '#94a3b8';
        context.strokeRect(x + 0.5, y + 0.5, cellWidth - 1, cellHeight - 1);
        context.fillStyle = '#1e3a8a';
        context.fillText(`${month}/${day}`, x + cellWidth / 2, y + 27);
        context.drawImage(image,
            left + sourceWidth * (index + 0.07), top + sourceHeight * 0.06,
            sourceWidth * 0.86, sourceHeight * 0.88,
            x + 8, y + 34, cellWidth - 16, cellHeight - 42);
    }
    return canvas.toDataURL('image/jpeg', 0.94);
}

function getSelectedRow() {
    if (!rowMode.open) return null;
    const match = rowMonth.value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!match) throw new Error('シフト表の年月を選択してください。');
    if (!rowImage || rowCorners.length !== 4) {
        throw new Error('プレビューで対象者の勤務欄の四隅を指定してください。');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { month, days, imageUrl: makeDateCellImage(rowImage, rowCorners, month, days) };
}
