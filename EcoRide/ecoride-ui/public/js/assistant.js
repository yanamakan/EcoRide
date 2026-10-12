(function () {
    var form = document.getElementById('aForm');
    var input = document.getElementById('aInput');
    var messages = document.getElementById('aMessages');
    var resetBtn = document.getElementById('aReset');
    if (!form) return;

    var history = [];
    var transcript = [];
    try {
        history = JSON.parse(sessionStorage.getItem('ecoHistory') || '[]');
        transcript = JSON.parse(sessionStorage.getItem('ecoTranscript') || '[]');
    } catch (e) {}

    function save() {
        try {
            sessionStorage.setItem('ecoHistory', JSON.stringify(history));
            sessionStorage.setItem('ecoTranscript', JSON.stringify(transcript));
        } catch (e) {}
    }

        function pretty(s) {
        s = String(s).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/name$/i, '').trim().toLowerCase();
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function buildChart(rows) {
        if (!rows || rows.length < 2) return null;
        var cols = Object.keys(rows[0]);
        var isNum = function (v) { return v !== null && v !== '' && !isNaN(Number(v)); };
        var valCol = cols.find(function (c) {
            return !/(id|key)$/i.test(c) && rows.every(function (r) { return isNum(r[c]); });
        });
        var labelCol = cols.find(function (c) { return c !== valCol; });
        if (!valCol || !labelCol) return null;

        var values = rows.map(function (r) { return Number(r[valCol]); });
        var max = Math.max.apply(null, values) || 1;
        var total = values.reduce(function (a, b) { return a + b; }, 0);
        var fmt = function (n) { return n.toLocaleString('en-ZA', { maximumFractionDigits: 2 }); };

        var wrap = document.createElement('div');
        wrap.className = 'a-chart';

        var head = document.createElement('div');
        head.className = 'a-chart-head';
        var title = document.createElement('span');
        title.className = 'a-chart-title';
        title.textContent = pretty(valCol) + ' by ' + pretty(labelCol).toLowerCase();
        var sum = document.createElement('span');
        sum.className = 'a-chart-total';
        sum.textContent = 'Total ' + fmt(total);
        head.appendChild(title);
        head.appendChild(sum);
        wrap.appendChild(head);

        var fills = [];
        rows.forEach(function (r, i) {
            var v = values[i];
            var pct = total ? Math.round((v / total) * 100) : 0;
            var row = document.createElement('div');
            row.className = 'a-bar-row' + (v === max ? ' is-top' : '');
            row.title = r[labelCol] + ': ' + fmt(v) + ' (' + pct + '%)';

            var label = document.createElement('span');
            label.className = 'a-bar-label';
            var rank = document.createElement('b');
            rank.className = 'a-bar-rank';
            rank.textContent = i + 1;
            label.appendChild(rank);
            label.appendChild(document.createTextNode(r[labelCol]));

            var track = document.createElement('div');
            track.className = 'a-bar-track';
            var fill = document.createElement('div');
            fill.className = 'a-bar-fill';
            fill.style.width = '0%';
            fill.dataset.w = Math.max(3, (v / max) * 100) + '%';
            fills.push(fill);
            track.appendChild(fill);

            var val = document.createElement('span');
            val.className = 'a-bar-val';
            val.textContent = fmt(v);
            var share = document.createElement('small');
            share.textContent = pct + '%';
            val.appendChild(share);

            row.appendChild(label);
            row.appendChild(track);
            row.appendChild(val);
            wrap.appendChild(row);
        });

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                fills.forEach(function (f) { f.style.width = f.dataset.w; });
            });
        });
        return wrap;
    }

    function addMessage(text, who, linkUrl, sqlUsed, rows) {
        var el = document.createElement('div');
        el.className = 'a-msg ' + (who === 'user' ? 'a-msg-user' : 'a-msg-bot');
        el.textContent = text;
        if (linkUrl) {
            var a = document.createElement('a');
            a.href = linkUrl;
            a.textContent = 'View on dashboard →';
            a.className = 'a-msg-link';
            el.appendChild(document.createElement('br'));
            el.appendChild(a);
        }
        if (sqlUsed) {
            var t = document.createElement('a');
            t.href = '#';
            t.className = 'a-msg-link';
            t.textContent = 'Show query used';
            var pre = document.createElement('pre');
            pre.className = 'a-sql hidden';
            pre.textContent = sqlUsed;
            t.addEventListener('click', function (e) {
                e.preventDefault();
                pre.classList.toggle('hidden');
                t.textContent = pre.classList.contains('hidden') ? 'Show query used' : 'Hide query';
            });
            el.appendChild(document.createElement('br'));
            el.appendChild(t);
            el.appendChild(pre);
        }
        var chart = buildChart(rows);
        if (chart) el.appendChild(chart);
        messages.appendChild(el);
        messages.scrollTop = messages.scrollHeight;
        return el;
    }

    function ask(question) {
        addMessage(question, 'user');
        transcript.push({ text: question, who: 'user' });
        input.disabled = true;
        var thinking = addMessage('Thinking...', 'bot');

        fetch('/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: question, history: history.slice(-6) })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                thinking.remove();
                var answer = data.answer || 'Sorry, something went wrong.';
                addMessage(answer, 'bot', data.link, data.sql, data.rows);
                transcript.push({ text: answer, who: 'bot', link: data.link, sql: data.sql, rows: data.rows });
                if (!data.error) {
                    history.push({ role: 'user', content: question });
                    history.push({ role: 'assistant', content: answer });
                    if (history.length > 8) history = history.slice(-8);
                }
                save();
            })
            .catch(function () {
                thinking.remove();
                addMessage('Could not reach the server. Please try again.', 'bot');
            })
            .finally(function () {
                input.disabled = false;
                input.focus();
            });
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = input.value.trim();
        if (!q) return;
        input.value = '';
        ask(q);
    });

    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            history = []; transcript = [];
            save();
            messages.innerHTML = '';
            input.focus();
        });
    }

    // Restore earlier conversation, then handle a question passed from the widget
    transcript.forEach(function (m) { addMessage(m.text, m.who, m.link, m.sql, m.rows); });
    var q = new URLSearchParams(window.location.search).get('q');
    if (q) {
        window.history.replaceState({}, '', '/assistant');
        ask(q);
    } else {
        input.focus();
    }
})();