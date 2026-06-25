let currentShifts = [];

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

function resizeImageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 1800;
                let width = img.width;
                let height = img.height;
                if (width > height && width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                } else if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
                canvas.width = Math.round(width);
                canvas.height = Math.round(height);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
                resolve(compressedBase64);
            };
            img.onerror = (e) => reject(new Error('画像の読み込みに失敗しました'));
            img.src = event.target.result;
        };
        reader.onerror = (e) => reject(new Error('ファイルの読み込みに失敗しました'));
        reader.readAsDataURL(file);
    });
}

function setStatus(msg, type) {
    const box = document.getElementById('status');
    box.className = type || 'info';
    box.style.display = 'block';
    box.innerText = msg;
}

function clearStatus() {
    const box = document.getElementById('status');
    box.style.display = 'none';
    box.innerText = '';
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function renderTable() {
    const tbody = document.getElementById('shiftTableBody');
    const totalPaySpan = document.getElementById('totalPay');
    const shiftCount = document.getElementById('shiftCount');
    const personName = document.getElementById('personName').value.trim() || 'あなた';

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
    const rows = currentShifts.map((shift, index) => {
        const breakMins = shift.break || 0;
        const dailyPay = calculateDailyPay(shift.start, shift.end, rules, breakMins);
        totalAmount += dailyPay;
        const dateStr = shift.date || '-';
        const startStr = shift.start || '不明';
        const endStr = shift.end || '不明';
        
        // 🌟 変更：表の中に、直接数字を書き換えられる休憩時間枠を配置
        return `<tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(dateStr)}</td>
            <td>${escapeHtml(startStr)} 〜 ${escapeHtml(endStr)}</td>
            <td>
                <input type="number" class="break-input" value="${breakMins}" onchange="updateBreak(${index}, this.value)" step="15" min="0">
            </td>
            <td>${Math.floor(dailyPay).toLocaleString()}円</td>
            <td><button class="delete-btn" onclick="removeShift(${index})">削除</button></td>
        </tr>`;
    });

    tbody.innerHTML = rows.join('');
    totalPaySpan.innerText = Math.floor(totalAmount).toLocaleString();
    
    if (currentShifts.length > 0) {
        shiftCount.innerText = `${currentShifts.length} シフト分の合計（${escapeHtml(personName)}さん）`;
    } else {
        shiftCount.innerText = '';
    }
}

// 🌟 新追加：表の「休憩(分)」の数字を書き換えたら、データを更新して再計算する機能
window.updateBreak = function(index, value) {
    currentShifts[index].break = Number(value) || 0;
    renderTable();
};

const inputIds = ['t1_start','t1_end','w1','t2_start','t2_end','w2','t3_start','t3_end','w3'];
inputIds.forEach(id => {
    document.getElementById(id).addEventListener('input', renderTable);
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
    currentShifts.splice(index, 1);
    renderTable();
}

async function processImageWithAPI() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const personName = document.getElementById('personName').value.trim();
    const fileInput = document.getElementById('imageInput');
    const runBtn = document.getElementById('runBtn');

    clearStatus();

    if (!apiKey.startsWith('gsk_')) {
        setStatus('⚠️ 『gsk_』から始まる正しいGroq APIキーを入力してください。', 'error');
        return;
    }
    if (!personName) {
        setStatus('⚠️ 対象者の名前を入力してください。', 'error');
        return;
    }
    if (fileInput.files.length === 0) {
        setStatus('⚠️ シフト表の画像ファイルを選択してください。', 'error');
        return;
    }

    try {
        runBtn.disabled = true;
        runBtn.innerText = '⏳ 画像を解析中... (10〜30秒)';
        setStatus('画像をリサイズしてAIに送信しています...', 'info');

        const base64Data = await resizeImageToBase64(fileInput.files[0]);

        // 🌟 変更：AIへの指示（プロンプト）に「休憩時間」のルールを追加
        const promptText = `あなたは優秀なシフト表データ抽出AIです。
画像は1ヶ月分のアルバイトシフト表で、複数の人の名前と日々の出勤・退勤時間が書かれています。

【タスク】
シフト表から「${personName}」さんの行を探し、その人の全てのシフト（出勤時刻と退勤時刻のペア）を、日付順（左から右、上から下）に全て読み取ってください。

【出力ルール（厳守）】
- 純粋なJSON配列【のみ】を出力する
- 挨拶、説明、コードブロック記法は絶対に書かない
- 各要素は {"date": "M/D", "start": "HH:MM", "end": "HH:MM", "break": 0} の形式
- 画像内に休憩時間（「休45」や「休憩1時間」など）が書かれていれば "break" に分単位（数値のみ）で入れ、書かれていなければ 0 にする
- 空欄・休み・×・斜線などシフトが入っていない日は配列に含めない
- 時刻は24時間表記の HH:MM 形式（例: 09:30, 18:00, 23:30）
- 「${personName}」さんの行が見つからない場合は空配列 [] を返す

【出力例】
[{"date":"6/1","start":"18:30","end":"23:00","break":0},{"date":"6/3","start":"09:00","end":"17:00","break":45}]`;

        const requestBody = {
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: promptText },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                ]
            }],
            temperature: 0.0,
            max_tokens: 2048
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
            let errMsg = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                errMsg = errorData.error?.message || errMsg;
            } catch (_) { /* ignore */ }
            throw new Error(`Groq APIエラー: ${errMsg}`);
        }

        const data = await response.json();
        const rawText = data.choices?.[0]?.message?.content || '';
        console.log('💬 AIの生返答:', rawText);

        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new SyntaxError('AIがJSON配列を返しませんでした。\nF12でコンソールを開き「💬 AIの生返答:」を確認してください。');
        }

        let newShifts;
        try {
            newShifts = JSON.parse(jsonMatch[0]);
        } catch (e) {
            throw new SyntaxError('AIの返したJSONが壊れています。\nF12でコンソールを開き「💬 AIの生返答:」を確認してください。');
        }

        if (!Array.isArray(newShifts) || newShifts.length === 0) {
            setStatus(`⚠️ 「${personName}」さんのシフトが見つかりませんでした。\n名前の表記がシフト表通りか、画像が鮮明か確認してください。`, 'error');
            runBtn.innerText = '🚀 画像を解析して計算する';
            return;
        }

        currentShifts = newShifts;
        renderTable();
        
        clearStatus();
        runBtn.innerText = '✨ 計算完了！';
        setTimeout(() => { runBtn.innerText = '🚀 画像を解析して計算する'; }, 3000);

    } catch (error) {
        console.error('💥 エラー詳細:', error);
        if (error.name === 'SyntaxError') {
            setStatus('⚠️ AIの返答を読み取れませんでした。\n' + error.message, 'error');
        } else {
            setStatus('⚠️ エラーが発生しました。\n詳細: ' + error.message, 'error');
        }
        runBtn.innerText = '🚀 画像を解析して計算する';
    } finally {
        runBtn.disabled = false;
    }
}

document.getElementById('runBtn').addEventListener('click', processImageWithAPI);