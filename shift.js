let currentShifts = [];
let imagePersonName = '';
let imagePreviewUrl = '';
let imageWorkMinutes = null;

const shiftTableBody = document.getElementById('shiftTableBody');

function timeToDecimal(timeStr) {
    if (timeStr === undefined || timeStr === null || timeStr === "") return null;
    const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours + (minutes / 60);
}

function getOverlapHours(w_start, w_end, r_start, r_end) {
    if (w_start === null || w_end === null || r_start === null || r_end === null) return 0;
    if (w_end < w_start) w_end += 24;
    if (r_end <= r_start) r_end += 24;

    let total = 0;
    const windows = [
        { s: r_start - 24, e: r_end - 24 },
        { s: r_start, e: r_end },
        { s: r_start + 24, e: r_end + 24 }
    ];

    for (let win of windows) {
        let o_start = Math.max(w_start, win.s);
        let o_end = Math.min(w_end, win.e);
        if (o_end > o_start) {
            total += (o_end - o_start);
        }
    }
    return total;
}

// 🌟 変更：休憩時間(breakMins)を受け取ってマイナスする計算
function calculateDailyPay(startInput, endInput, rules, breakMins = 0) {
    let w_start = timeToDecimal(startInput);
    let w_end = timeToDecimal(endInput);
    if (w_start === null || w_end === null) return 0;

    let shiftTiers = [];
    for (let r of rules) {
        let hrs = getOverlapHours(w_start, w_end, r.start, r.end);
        if (hrs > 0) shiftTiers.push({ wage: r.wage, hrs: hrs });
    }
    
    // 実務の経理と同じく「一番時給が安い時間帯」から優先して休憩を引く
    shiftTiers.sort((a, b) => a.wage - b.wage);

    let breakHrs = breakMins / 60;
    let pay = 0;

    for (let t of shiftTiers) {
        if (breakHrs > 0) {
            if (t.hrs >= breakHrs) {
                t.hrs -= breakHrs;
                breakHrs = 0;
            } else {
                breakHrs -= t.hrs;
                t.hrs = 0;
            }
        }
        pay += t.hrs * t.wage;
    }
    return pay;
}

function setStatus(msg, type) {
    const box = document.getElementById('status');
    box.className = type || 'info';
    box.style.display = 'block';
    box.textContent = msg;
}

function clearStatus() {
    const box = document.getElementById('status');
    box.style.display = 'none';
    box.textContent = '';
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function isShiftDate(value) {
    const match = value.trim().normalize('NFKC').match(/^(\d{1,2})[/月](\d{1,2})日?$/);
    if (!match) return false;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const date = new Date(2000, month - 1, day);
    return month >= 1 && month <= 12 && date.getMonth() === month - 1 && date.getDate() === day;
}

function getShiftDuration(start, end) {
    if (start === null || end === null) return null;
    return Math.round(((end - start + 24) % 24) * 60);
}

function getShiftIssues(shift, start, end, duration) {
    const issues = {};
    if (shift.fromImage && !isShiftDate(shift.date)) issues.date = '日付';

    if (start === null) issues.start = '出勤';
    if (end === null) issues.end = '退勤';
    if (!Number.isInteger(shift.break) || shift.break < 0 || (duration !== null && shift.break > duration)) {
        issues.break = '休憩';
    }
    return issues;
}

function parseWorkTime(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().normalize('NFKC').match(/^(\d{1,3}):([0-5]\d)$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function formatWorkTime(minutes) {
    return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}

function updateTotals() {
    const totalPaySpan = document.getElementById('totalPay');
    const shiftCount = document.getElementById('shiftCount');
    const personName = imagePersonName || document.getElementById('personName').value.trim() || 'あなた';

    const rules = [
        {
            start: timeToDecimal(document.getElementById('t1_start').value),
            end: timeToDecimal(document.getElementById('t1_end').value),
            wage: Number(document.getElementById('w1').value) || 0
        },
        {
            start: timeToDecimal(document.getElementById('t2_start').value),
            end: timeToDecimal(document.getElementById('t2_end').value),
            wage: Number(document.getElementById('w2').value) || 0
        },
        {
            start: timeToDecimal(document.getElementById('t3_start').value),
            end: timeToDecimal(document.getElementById('t3_end').value),
            wage: Number(document.getElementById('w3').value) || 0
        }
    ];

    let totalAmount = 0;
    let totalWorked = 0;
    let importedWorked = 0;
    let reviewCount = 0;
    currentShifts.forEach((shift, index) => {
        const row = shiftTableBody.rows[index];
        const start = timeToDecimal(shift.start);
        const end = timeToDecimal(shift.end);
        const duration = getShiftDuration(start, end);
        const issues = getShiftIssues(shift, start, end, duration);
        const needsReview = Object.keys(issues).length > 0;
        const review = row.querySelector('[data-review]');

        for (const input of row.querySelectorAll('[data-field]')) {
            input.setAttribute('aria-invalid', String(Boolean(issues[input.dataset.field])));
        }
        review.hidden = !needsReview;
        review.textContent = needsReview ? `${Object.values(issues).join('・')}を確認` : '';
        const payCell = row.querySelector('[data-pay]');
        if (needsReview) {
            reviewCount++;
            payCell.textContent = '—';
            return;
        }

        const dailyPay = calculateDailyPay(shift.start, shift.end, rules, shift.break);
        totalAmount += dailyPay;
        totalWorked += duration - shift.break;
        if (shift.fromImage) importedWorked += duration - shift.break;
        payCell.textContent = `${Math.floor(dailyPay).toLocaleString()}円`;
    });

    totalPaySpan.textContent = Math.floor(totalAmount).toLocaleString();
    const includedCount = currentShifts.length - reviewCount;
    const countText = `${includedCount} シフト分の合計（${personName}さん）`;
    const reviewText = reviewCount ? ` ／ 確認が必要な ${reviewCount} 件は集計対象外` : '';
    shiftCount.textContent = currentShifts.length ? countText + reviewText : '';
    document.getElementById('workedTime').textContent = currentShifts.length ? `勤務時間 ${formatWorkTime(totalWorked)}` : '';

    const timeCheck = document.getElementById('workTimeCheck');
    const mismatch = imageWorkMinutes !== null && importedWorked !== imageWorkMinutes;
    timeCheck.hidden = !mismatch;
    timeCheck.textContent = mismatch
        ? `画像から取り込んだ勤務は${formatWorkTime(importedWorked)}、表の勤務時間は${formatWorkTime(imageWorkMinutes)}です。元画像と照らし合わせてください。`
        : '';
    document.getElementById('payLabel').textContent = mismatch || reviewCount ? '暫定支給額' : '合計支給額';
}

function renderTable() {
    const rows = currentShifts.map((shift, index) => {
        const rowNumber = index + 1;
        return `<tr>
            <td>${rowNumber}</td>
            <td>
                <input type="text" class="shift-date-input" data-field="date" value="${escapeHtml(shift.date)}"
                    placeholder="6/5" aria-label="${rowNumber}行目の日付">
            </td>
            <td>
                <div class="shift-time-inputs">
                    <input type="time" data-field="start" value="${escapeHtml(shift.start)}" aria-label="${rowNumber}行目の出勤時刻">
                    <span aria-hidden="true">〜</span>
                    <input type="time" data-field="end" value="${escapeHtml(shift.end)}" aria-label="${rowNumber}行目の退勤時刻">
                </div>
                <small class="shift-review" data-review hidden></small>
            </td>
            <td><input type="number" class="break-input" data-field="break" value="${shift.break ?? ''}"
                step="1" min="0" aria-label="${rowNumber}行目の休憩時間（分）"></td>
            <td data-pay></td>
            <td><button type="button" class="delete-btn" onclick="removeShift(${index})" aria-label="${rowNumber}行目を削除">削除</button></td>
        </tr>`;
    });

    shiftTableBody.innerHTML = rows.join('');
    document.getElementById('shiftEditHint').hidden = currentShifts.length === 0;
    updateTotals();
}

shiftTableBody.addEventListener('input', (event) => {
    const input = event.target;
    const field = input.dataset.field;
    if (!field) return;

    const shift = currentShifts[input.closest('tr').sectionRowIndex];
    shift[field] = field === 'break' ? (input.value === '' ? null : Number(input.value)) : input.value;
    updateTotals();
});

const inputIds = ['personName','t1_start','t1_end','w1','t2_start','t2_end','w2','t3_start','t3_end','w3'];
inputIds.forEach(id => {
    document.getElementById(id).addEventListener('input', updateTotals);
});

function addManualShift() {
    const dateInput = document.getElementById('manualDate').value.trim();
    const startInput = document.getElementById('manualStart').value.trim();
    const endInput = document.getElementById('manualEnd').value.trim();
    const breakInput = Number(document.getElementById('manualBreak').value) || 0;

    if (!startInput || !endInput) {
        alert('⚠️ 出勤時間と退勤時間は必ず入力してください！');
        return;
    }

    currentShifts.push({ date: dateInput, start: startInput, end: endInput, break: breakInput });
    renderTable();

    document.getElementById('manualDate').value = '';
    document.getElementById('manualStart').value = '';
    document.getElementById('manualEnd').value = '';
    document.getElementById('manualBreak').value = '0';
}

function removeShift(index) {
    const [removed] = currentShifts.splice(index, 1);
    if (removed.fromImage && !currentShifts.some(shift => shift.fromImage)) {
        imagePersonName = '';
        imageWorkMinutes = null;
        updateImagePreview(null);
    }
    renderTable();
}

function updateImagePreview(file) {
    const preview = document.getElementById('imagePreview');
    const image = document.getElementById('previewImage');
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    imagePreviewUrl = file ? URL.createObjectURL(file) : '';
    if (imagePreviewUrl) image.src = imagePreviewUrl;
    else image.removeAttribute('src');
    preview.hidden = !imagePreviewUrl;
}

function normalizeImageTime(value) {
    if (typeof value !== 'string') return '';
    const match = value.trim().normalize('NFKC').match(/^(\d{1,2}):([0-5]\d)$/);
    if (!match || Number(match[1]) > 47) return '';
    return `${String(Number(match[1]) % 24).padStart(2, '0')}:${match[2]}`;
}

function parseImageShifts(choice, selectedRow) {
    if (choice?.finish_reason === 'length') {
        throw new Error('解析結果が途中で切れました。シフト表の対象範囲を絞って再試行してください。');
    }
    const result = JSON.parse(choice?.message?.content || 'null');
    if (!Array.isArray(result?.shifts)) {
        throw new SyntaxError('シフトの一覧を取得できませんでした。');
    }
    const seenDays = new Set();
    const shifts = result.shifts.map(shift => {
        if (!shift || typeof shift !== 'object' || (Array.isArray(shift) && shift.length !== 4)) {
            throw new SyntaxError('シフトの項目を取得できませんでした。');
        }
        const [dateOrDay, start, end, breakMinutes] = Array.isArray(shift)
            ? shift
            : [selectedRow ? shift.day : shift.date, shift.start, shift.end, shift.break];
        let date = typeof dateOrDay === 'string' ? dateOrDay.trim() : '';
        if (selectedRow) {
            const day = dateOrDay;
            if (!Number.isInteger(day) || day < 1 || day > selectedRow.days || seenDays.has(day)) {
                throw new Error('解析結果の日付に重複や誤りがありました。選択範囲を確認して再試行してください。');
            }
            seenDays.add(day);
            date = `${selectedRow.month}/${day}`;
        }
        return {
            date,
            start: normalizeImageTime(start),
            end: normalizeImageTime(end),
            break: Number.isInteger(breakMinutes) && breakMinutes >= 0 ? breakMinutes : null,
            fromImage: true
        };
    });
    if (selectedRow) shifts.sort((a, b) => Number(a.date.split('/')[1]) - Number(b.date.split('/')[1]));
    return { shifts, printedMinutes: selectedRow ? null : parseWorkTime(result.workTime) };
}

async function processImageWithAPI() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const personName = document.getElementById('personName').value.trim();
    const file = shiftImageInput.files[0];
    const expectedTime = document.getElementById('expectedWorkTime').value.trim();
    const expectedMinutes = parseWorkTime(expectedTime);
    const runBtn = document.getElementById('runBtn');
    const defaultButtonText = runBtn.textContent;

    clearStatus();

    if (!apiKey.startsWith('gsk_')) {
        setStatus('⚠️ 『gsk_』から始まる正しいGroq APIキーを入力してください。', 'error');
        return;
    }
    if (!personName && !rowMode.open) {
        setStatus('⚠️ 対象者の名前を入力してください。', 'error');
        return;
    }
    if (!file) {
        setStatus('⚠️ シフト表の画像ファイルを選択してください。', 'error');
        return;
    }
    if (expectedTime && expectedMinutes === null) {
        setStatus('シフト表の勤務時間は 54:45 のような「時間:分」で入力してください。', 'error');
        return;
    }

    try {
        runBtn.disabled = true;
        runBtn.textContent = '画像を解析中…';
        setStatus('画像をリサイズしてAIに送信しています...', 'info');

        const selectedRow = getSelectedRow();
        const imageUrl = selectedRow ? selectedRow.imageUrl : await resizeShiftImage(file);

        const instructions = selectedRow ? `画像には、対象者1人の勤務セルだけが日付付きで並んでいます。各枠の上の月/日と、その直下の同じ枠内だけを読み取ってください。他の枠の時刻や休憩は流用しないでください。ラベルだけがある枠は空欄です。
出力例は {"shifts":[[6,"09:15","14:45",20]]} です。各勤務は [日,出勤,退勤,休憩分] の配列です。「日」は枠の見出しの数字（1から${selectedRow.days}）で、同じ日は1回だけ出してください。` : `画像のシフト表で対象者 ${JSON.stringify(personName)} の氏名欄を探してください。一致した氏名のセルを囲む上下の罫線を右に追い、同じ行の勤務だけを読み取ってください。日付は各列の見出しを使い、画像に傾きがあれば縦の罫線をたどってください。日付の見出しが読めない場合の日付は null、名前が確認できない場合の shifts は空配列です。
出力例は {"workTime":"113:20","shifts":[["3/6","09:15","14:45",20]]} です。各勤務は [日付,出勤,退勤,休憩分] の配列で、日付は M/D です。workTime は対象者の行末の「勤務時間」の欄に印字された合計を写し、読めない場合は null にしてください。`;

        const promptText = `${instructions}

空欄、連休、有休、休み、×、斜線のセルは除外してください。勤務がある枠の上段が出勤、次の段が退勤で、その下の括弧内の数字が休憩の分数です。
- 出勤と退勤は HH:MM の時刻。32:00 のような退勤は翌朝の08:00としてください。
- 休憩分は整数です。(15) は15、(0) は0です。休憩の記載がない場合は0です。
- 時刻や休憩欄の文字が判読できない場合は、その項目に null を入れてください。隣のセルから補ったり、よくある勤務のパターンを当てはめたりしないでください。
余分な空白や改行を省いた1行の JSON オブジェクトだけを返してください。`;

        const requestBody = {
            model: 'qwen/qwen3.8-27b',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: promptText },
                    { type: 'image_url', image_url: { url: imageUrl } }
                ]
            }],
            response_format: { type: 'json_object' },
            reasoning_effort: 'none',
            temperature: 0.0,
            max_completion_tokens: 900
        };

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            if (response.status === 429) {
                const retryAfter = Number(response.headers.get('retry-after'));
                const wait = retryAfter > 0 ? `${Math.ceil(retryAfter)}秒待って` : '少し時間をおいて';
                throw new Error(`Groq の利用上限に達しました。${wait}からもう一度解析してください。`);
            }
            let errMsg = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                errMsg = errorData.error?.message || errMsg;
            } catch (_) { /* ignore */ }
            throw new Error(`Groq APIエラー: ${errMsg}`);
        }

        const data = await response.json();
        const { shifts: newShifts, printedMinutes } = parseImageShifts(data.choices?.[0], selectedRow);

        if (newShifts.length === 0) {
            const help = selectedRow ? '青い枠が対象者の勤務欄に合っているか確認してください。' : '名前の表記と画像の鮮明さを確認してください。';
            setStatus(`シフトが見つかりませんでした。${help}`, 'error');
            return;
        }

        if (currentShifts.length && !window.confirm('現在のシフト一覧を、今回の解析結果に置き換えますか？')) {
            setStatus('現在のシフト一覧を保持しました。', 'info');
            return;
        }

        updateImagePreview(file);
        currentShifts = newShifts;
        imagePersonName = personName;
        imageWorkMinutes = expectedMinutes ?? printedMinutes;
        renderTable();
        setStatus(`${newShifts.length} 件のシフトを読み取りました。元画像と照らし合わせて一覧を確認してください。`, 'info');

    } catch (error) {
        if (error.name === 'SyntaxError') {
            setStatus('⚠️ 解析結果を読み取れませんでした。画像を確認して再試行してください。', 'error');
        } else {
            setStatus('⚠️ エラーが発生しました。\n詳細: ' + error.message, 'error');
        }
    } finally {
        runBtn.textContent = defaultButtonText;
        runBtn.disabled = false;
    }
}

document.getElementById('runBtn').addEventListener('click', processImageWithAPI);
