(function () {
    var toggle = document.getElementById('chatToggle');
    var panel = document.getElementById('chatPanel');
    var closeBtn = document.getElementById('chatClose');
    var resetBtn = document.getElementById('chatReset');
    var form = document.getElementById('chatForm');
    var input = document.getElementById('chatInput');
    var messages = document.getElementById('chatMessages');
    if (!toggle || !panel) return;

    // Conversation memory sent with every question so follow-ups
    // ("and in February?") can be understood. Cleared by "New chat".
    var history = [];
    var introHtml = messages.innerHTML;

    toggle.addEventListener('click', function () {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) input.focus();
    });
    closeBtn.addEventListener('click', function () {
        panel.classList.add('hidden');
    });
    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            history = [];
            messages.innerHTML = introHtml;
            input.focus();
        });
    }

    function addMessage(text, who, linkUrl, sqlUsed) {
        var el = document.createElement('div');
        el.className = 'chat-msg ' + (who === 'user' ? 'chat-msg-user' : 'chat-msg-bot');
        el.textContent = text;
        if (linkUrl) {
            var a = document.createElement('a');
            a.href = linkUrl;
            a.textContent = 'View on dashboard →';
            a.className = 'chat-msg-link';
            el.appendChild(document.createElement('br'));
            el.appendChild(a);
        }
        if (sqlUsed) {
            var sqlToggle = document.createElement('a');
            sqlToggle.href = '#';
            sqlToggle.className = 'chat-msg-link';
            sqlToggle.textContent = 'Show query used';
            var pre = document.createElement('pre');
            pre.className = 'chat-sql hidden';
            pre.textContent = sqlUsed;
            sqlToggle.addEventListener('click', function (e) {
                e.preventDefault();
                pre.classList.toggle('hidden');
                sqlToggle.textContent = pre.classList.contains('hidden') ? 'Show query used' : 'Hide query';
            });
            el.appendChild(document.createElement('br'));
            el.appendChild(sqlToggle);
            el.appendChild(pre);
        }
        messages.appendChild(el);
        messages.scrollTop = messages.scrollHeight;
        return el;
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var question = input.value.trim();
        if (!question) return;
        addMessage(question, 'user');
        input.value = '';
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
                addMessage(answer, 'bot', data.link, data.sql);
                if (!data.error) {
                    history.push({ role: 'user', content: question });
                    history.push({ role: 'assistant', content: answer });
                    if (history.length > 8) history = history.slice(-8);
                }
            })
            .catch(function () {
                thinking.remove();
                addMessage('Could not reach the server. Please try again.', 'bot');
            })
            .finally(function () {
                input.disabled = false;
                input.focus();
            });
    });
})();
