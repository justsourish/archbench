// ============================================================
// Architecture Workbench (ArchBench)
//
// Not just "what exists" — shows "how it works."
// Layered architecture + interactive flow playback.
// ============================================================

import { AI_PROMPTS } from "./js/constants.js";
import { showToast, copyToClipboard, downloadFile, renderMarkdownToHtml } from "./js/utils.js";
import { parseMarkdownToProject, exportProjectToMarkdown, validateProjectData } from "./js/parser.js";
import { calculateArchitectureQualityScore, calculateDatabaseDependencyScore } from "./js/metrics.js";
import { generateArchitectureHealthReport } from "./js/reports/health-engine.js";
import { generateExecutionLogJSON, generateExecutionLogMarkdown, generateKnowledgePackJSON, generateKnowledgePackMarkdown } from "./js/reports/generators.js";
import { toggleLiveWatch } from "./js/live-watch.js";
import { initTerminalOnce } from "./js/terminal.js";

    // ─── Layer Zones & Boundaries (Project-specific layout state) ────────────────

    let LAYERS = [];
    let TRUST_BOUNDARY = null;
    let trustEl = null;

    const DEFAULT_LAYERS = [
        { id: "entry",    label: "Entry Points — User-Facing Applications",  y: 150,  h: 420,  cls: "entry" },
        { id: "services", label: "Core Services — Processing & Verification", y: 640,  h: 480,  cls: "services" },
        { id: "infra",    label: "Infrastructure — Data, Analytics & Identity", y: 1190, h: 450,  cls: "infra" },
        { id: "future",   label: "Roadmap — Future Vision",                    y: 1710, h: 380,  cls: "future" },
    ];

    const DEFAULT_TRUST_BOUNDARY = {
        x: 1000, y: 670,
        w: 1120, h: 950,
        label: "TRUST BOUNDARY (SECURE BACKEND)",
        note: "Decryption, persistence & intelligence execute inside this zone"
    };

    // ─── Project Loading (Dynamic configuration from window.ARCHBENCH_PROJECT_MD or window.ARCHBENCH_PROJECT) ───
    export let project = { title: "Untitled Project", version: "1.0", nodes: [], connections: [], flows: [] };
    if (window.ARCHBENCH_PROJECT_MD) {
        try {
            project = parseMarkdownToProject(window.ARCHBENCH_PROJECT_MD);
            project.id = "trace-sample";
        } catch (e) {
            console.error("Failed to parse window.ARCHBENCH_PROJECT_MD:", e);
        }
    } else if (window.ARCHBENCH_PROJECT) {
        project = window.ARCHBENCH_PROJECT;
    }
    export let currentProject = null;
    export let NODES = [];
    export let CONNECTIONS = [];
    export let FLOWS = [];

    // ─── DOM References ─────────────────────────────────────────

    const viewport    = document.getElementById("viewport");
    const canvas      = document.getElementById("canvas");
    const svgLayer    = document.getElementById("connections-svg");
    const zoomLabel   = document.getElementById("zoom-label");
    const helpHint    = document.getElementById("help-hint");
    const flowBarBtns = document.getElementById("flow-bar-buttons");
    const flowPanel   = document.getElementById("flow-playback");
    const fpHeader    = document.getElementById("fp-header");
    const fpTitle     = document.getElementById("fp-title");
    const fpSubtitle  = document.getElementById("fp-subtitle");
    const fpProgress  = document.getElementById("fp-progress-fill");
    const fpBadge     = document.getElementById("fp-step-badge");
    const fpLabel     = document.getElementById("fp-step-label");
    const fpDetail    = document.getElementById("fp-step-detail");
    const fpData      = document.getElementById("fp-step-data");
    const fpCounter   = document.getElementById("fp-step-counter");
    const fpPrev      = document.getElementById("fp-prev");
    const fpNext      = document.getElementById("fp-next");
    const fpPlay      = document.getElementById("fp-play");
    const fpClose     = document.getElementById("fp-close");
    const fpMinimize  = document.getElementById("fp-minimize");
    const fpDock      = document.getElementById("fp-dock");

    // Project System DOM Bindings
    const btnProjectSelector = document.getElementById("btn-project-selector");
    const projectDropdown    = document.getElementById("project-dropdown");
    const projectList        = document.getElementById("project-list");
    const currentProjectTitle = document.getElementById("current-project-title");
    
    const dropdownBtnCreate  = document.getElementById("dropdown-btn-create");
    const dropdownBtnEdit    = document.getElementById("dropdown-btn-edit");
    const dropdownBtnImport  = document.getElementById("dropdown-btn-import");
    const dropdownBtnExport  = document.getElementById("dropdown-btn-export");
    
    const projectFileInput   = document.getElementById("project-file-input");
    
    const projectModal       = document.getElementById("project-modal");
    const projectModalTitle  = document.getElementById("project-modal-title");
    const projectModalClose  = document.getElementById("project-modal-close");
    const projectTitleInput  = document.getElementById("project-title-input");
    const projectVersionInput = document.getElementById("project-version-input");
    const projectJsonInput   = document.getElementById("project-json-input");
    const projectModalCancel = document.getElementById("project-modal-cancel");
    const projectModalSave   = document.getElementById("project-modal-save");

    // ─── State ──────────────────────────────────────────────────

    let scale = 0.45, panX = 0, panY = 0;
    let isPanning = false, spacePressed = false;
    let panStartX, panStartY, panStartPanX, panStartPanY;

    const nodeEls  = {};
    const nodeData = {};

    // Flow state
    export let activeFlow    = null;
    export let activeStep    = -1;
    let isAutoPlaying = false;
    let autoTimer     = null;

    // Panel Float/Drag/Dock State
    let panelPosition = null; // { x, y }
    let isPanelDragging = false;
    let dragStartX, dragStartY, dragStartLeft, dragStartTop;
    let currentDockState = "right"; // float, left, right
    let isMinimized = false;



    // ─── Build Nodes ────────────────────────────────────────────

    function buildNode(n) {
        const el = document.createElement("div");
        el.className = "graph-node";
        if (n.nodeType === "boundary")  el.classList.add("node-boundary");
        if (n.nodeType === "datamodel") el.classList.add("node-datamodel");
        el.id = `node-${n.id}`;
        el.style.left = n.x + "px";
        el.style.top  = n.y + "px";
        el.style.setProperty("--node-color", n.color);

        let html = `<div class="node-header">
            <span class="node-icon">${n.icon}</span>
            <span class="node-title">${n.title}</span>
            <span class="node-cat">${n.category}</span>
        </div><div class="node-body">`;

        if (n.desc) html += `<div class="node-desc">${n.desc}</div>`;

        (n.sections || []).forEach(sec => {
            if (sec.label) html += `<div class="node-section">${sec.label}</div>`;
            html += `<div class="node-items">`;
            sec.items.forEach(item => {
                let cls = "node-item", label = item;
                if (item.startsWith("~")) { cls += " struck"; label = item.slice(1); }
                if (item.startsWith("*")) { cls += " glow";   label = item.slice(1); }
                html += `<div class="${cls}"><span class="item-dot"></span>${label}</div>`;
            });
            html += `</div>`;
        });

        if (n.flow) {
            html += `<div class="node-flow">`;
            n.flow.forEach(s => {
                if (s === "→") { html += `<span class="nf-arrow">→</span>`; }
                else {
                    let cls = "nf-step", lbl = s;
                    if (s.endsWith("*")) { cls += " accent"; lbl = s.slice(0,-1); }
                    html += `<span class="${cls}">${lbl}</span>`;
                }
            });
            html += `</div>`;
        }

        if (n.callout) html += `<div class="node-callout ${n.callout.type}">${n.callout.text}</div>`;

        html += `</div>`;
        html += `<div class="port port-top"></div><div class="port port-bottom"></div>`;
        html += `<div class="port port-left"></div><div class="port port-right"></div>`;

        // Step badge (hidden by default)
        html += `<div class="step-badge" id="badge-${n.id}"></div>`;

        el.innerHTML = html;
        canvas.appendChild(el);
        nodeEls[n.id] = el;
        makeDraggable(el, n);
    }


    // ─── Measure Nodes ──────────────────────────────────────────

    function measureNodes() {
        Object.keys(nodeEls).forEach(id => {
            const el = nodeEls[id];
            nodeData[id] = {
                x: parseInt(el.style.left), y: parseInt(el.style.top),
                w: el.offsetWidth, h: el.offsetHeight
            };
        });
    }

    // ─── Draw Connections ───────────────────────────────────────

    function bestPort(fd, td) {
        const dx = (td.x + td.w/2) - (fd.x + fd.w/2);
        const dy = (td.y + td.h/2) - (fd.y + fd.h/2);
        let s, e;
        if (Math.abs(dx) * 0.65 > Math.abs(dy)) {
            if (dx > 0) { s = {x: fd.x+fd.w, y: fd.y+fd.h/2}; e = {x: td.x, y: td.y+td.h/2}; }
            else        { s = {x: fd.x, y: fd.y+fd.h/2};       e = {x: td.x+td.w, y: td.y+td.h/2}; }
        } else {
            if (dy > 0) { s = {x: fd.x+fd.w/2, y: fd.y+fd.h}; e = {x: td.x+td.w/2, y: td.y}; }
            else        { s = {x: fd.x+fd.w/2, y: fd.y};       e = {x: td.x+td.w/2, y: td.y+td.h}; }
        }
        return {s, e};
    }

    function makeBezier(s, e) {
        const dx = e.x-s.x, dy = e.y-s.y;
        const t = Math.min(Math.abs(dx), Math.abs(dy), 160)*0.55 + 50;
        let c1, c2;
        if (Math.abs(dx)*0.65 > Math.abs(dy)) {
            c1 = {x: s.x+t, y: s.y}; c2 = {x: e.x-t, y: e.y};
        } else {
            c1 = {x: s.x, y: s.y+t}; c2 = {x: e.x, y: e.y-t};
        }
        return { d: `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`, c1, c2 };
    }

    function drawConnections() {
        svgLayer.innerHTML = "";
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        svgLayer.appendChild(defs);

        CONNECTIONS.forEach(([fid, tid, label, type], idx) => {
            const fn = NODES.find(n=>n.id===fid), tn = NODES.find(n=>n.id===tid);
            const fd = nodeData[fid], td = nodeData[tid];
            if (!fd || !td || !fn || !tn) return;

            const {s, e} = bestPort(fd, td);
            const {d: pathD, c2} = makeBezier(s, e);

            // Gradient
            const gid = `cg${idx}`;
            const g = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
            g.id = gid;
            g.setAttribute("gradientUnits","userSpaceOnUse");
            g.setAttribute("x1",s.x); g.setAttribute("y1",s.y);
            g.setAttribute("x2",e.x); g.setAttribute("y2",e.y);
            const s1 = document.createElementNS("http://www.w3.org/2000/svg","stop");
            s1.setAttribute("offset","0%"); s1.setAttribute("stop-color",fn.color);
            const s2 = document.createElementNS("http://www.w3.org/2000/svg","stop");
            s2.setAttribute("offset","100%"); s2.setAttribute("stop-color",tn.color);
            g.appendChild(s1); g.appendChild(s2); defs.appendChild(g);

            // Path
            const p = document.createElementNS("http://www.w3.org/2000/svg","path");
            p.setAttribute("d", pathD);
            p.setAttribute("stroke", `url(#${gid})`);
            p.className.baseVal = "conn-line";
            p.dataset.from = fid; p.dataset.to = tid; p.dataset.idx = idx;
            if (type === "data")   p.setAttribute("stroke-dasharray","6 4");
            if (type === "future") { p.setAttribute("stroke-dasharray","3 6"); p.style.opacity = "0.12"; }
            svgLayer.appendChild(p);

            // Arrow
            const aLen = 8;
            const angle = Math.atan2(e.y-c2.y, e.x-c2.x);
            const arrow = document.createElementNS("http://www.w3.org/2000/svg","path");
            arrow.setAttribute("d",
                `M ${e.x - aLen*Math.cos(angle-0.4)} ${e.y - aLen*Math.sin(angle-0.4)} L ${e.x} ${e.y} L ${e.x - aLen*Math.cos(angle+0.4)} ${e.y - aLen*Math.sin(angle+0.4)}`
            );
            arrow.setAttribute("stroke", tn.color);
            arrow.className.baseVal = "conn-arrow";
            arrow.dataset.from = fid; arrow.dataset.to = tid; arrow.dataset.idx = idx;
            svgLayer.appendChild(arrow);

            // Label
            if (label) {
                const t = document.createElementNS("http://www.w3.org/2000/svg","text");
                t.setAttribute("x", (s.x+e.x)/2);
                t.setAttribute("y", (s.y+e.y)/2 - 7);
                t.setAttribute("text-anchor","middle");
                t.className.baseVal = "conn-label";
                t.dataset.from = fid; t.dataset.to = tid; t.dataset.idx = idx;
                t.textContent = label;
                svgLayer.appendChild(t);
            }

            // Flow dot
            const dot = document.createElementNS("http://www.w3.org/2000/svg","circle");
            dot.className.baseVal = "conn-dot";
            dot.setAttribute("fill", tn.color);
            dot.dataset.from = fid; dot.dataset.to = tid; dot.dataset.idx = idx;
            const anim = document.createElementNS("http://www.w3.org/2000/svg","animateMotion");
            anim.setAttribute("dur", (3+Math.random()*2.5)+"s");
            anim.setAttribute("repeatCount","indefinite");
            anim.setAttribute("path", pathD);
            dot.appendChild(anim);
            svgLayer.appendChild(dot);
        });
    }

    // ─── Dragging ───────────────────────────────────────────────

    function makeDraggable(el, ni) {
        let dragging = false, sx, sy, ox, oy;

        el.addEventListener("mousedown", e => {
            if (e.button !== 0 || activeFlow) return;
            e.stopPropagation();
            dragging = true; el.classList.add("dragging");
            sx = e.clientX; sy = e.clientY;
            ox = parseInt(el.style.left)||0; oy = parseInt(el.style.top)||0;

            const onMove = e => {
                if (!dragging) return;
                const nx = ox + (e.clientX-sx)/scale;
                const ny = oy + (e.clientY-sy)/scale;
                el.style.left = nx+"px"; el.style.top = ny+"px";
                nodeData[ni.id] = {x:nx, y:ny, w:el.offsetWidth, h:el.offsetHeight};
                drawConnections();
                applyFlowToConnections();
                updateMinimap();
            };
            const onUp = () => {
                dragging = false; el.classList.remove("dragging");
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });

        el.addEventListener("mouseenter", () => {
            if (activeFlow) return;
            el.classList.add("highlighted");
            highlightConns(ni.id, true);
        });
        el.addEventListener("mouseleave", () => {
            if (activeFlow) return;
            el.classList.remove("highlighted");
            highlightConns(ni.id, false);
        });
    }

    function highlightConns(nid, on) {
        svgLayer.querySelectorAll(".conn-line,.conn-arrow,.conn-label,.conn-dot").forEach(el => {
            if (el.dataset.from===nid || el.dataset.to===nid) el.classList.toggle("highlighted",on);
        });
        CONNECTIONS.forEach(([f,t]) => {
            if (f===nid && nodeEls[t]) nodeEls[t].classList.toggle("highlighted",on);
            if (t===nid && nodeEls[f]) nodeEls[f].classList.toggle("highlighted",on);
        });
    }

    // ─── Pan & Zoom ─────────────────────────────────────────────

    function applyTransform() {
        canvas.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
        zoomLabel.textContent = Math.round(scale*100)+"%";
        const gs = 20*scale, ms = 100*scale;
        viewport.style.backgroundSize = `${gs}px ${gs}px,${gs}px ${gs}px,${ms}px ${ms}px,${ms}px ${ms}px`;
        viewport.style.backgroundPosition = `${panX}px ${panY}px,${panX}px ${panY}px,${panX}px ${panY}px,${panX}px ${panY}px`;
        updateMinimap();
    }

    viewport.addEventListener("mousedown", e => {
        if (e.button===2||e.button===1||spacePressed||(e.button===0&&e.target===viewport)) {
            e.preventDefault(); isPanning = true;
            panStartX=e.clientX; panStartY=e.clientY; panStartPanX=panX; panStartPanY=panY;
            viewport.style.cursor="grabbing";
        }
    });
    document.addEventListener("mousemove", e => {
        if (!isPanning) return;
        panX=panStartPanX+(e.clientX-panStartX); panY=panStartPanY+(e.clientY-panStartY);
        applyTransform();
    });
    document.addEventListener("mouseup", () => { isPanning=false; viewport.style.cursor="grab"; });
    viewport.addEventListener("contextmenu", e=>e.preventDefault());

    document.addEventListener("keydown", e => {
        if (e.code==="Space"&&!e.repeat) { spacePressed=true; viewport.style.cursor="grab"; }
        if (e.key==="f"&&document.activeElement===document.body) fitToView(true);
        if (e.key==="Escape"&&activeFlow) exitFlow();
        if (e.key==="ArrowRight"&&activeFlow) nextStep();
        if (e.key==="ArrowLeft"&&activeFlow) prevStep();
    });
    document.addEventListener("keyup", e => {
        if (e.code==="Space") { spacePressed=false; viewport.style.cursor="grab"; }
    });

    viewport.addEventListener("wheel", e => {
        e.preventDefault();
        const r=viewport.getBoundingClientRect();
        const mx=e.clientX-r.left, my=e.clientY-r.top;
        const f=e.deltaY<0?1.1:0.9;
        const ns=Math.min(Math.max(scale*f,0.1),2.5);
        panX=mx-(mx-panX)*(ns/scale); panY=my-(my-panY)*(ns/scale); scale=ns;
        applyTransform();
    },{passive:false});

    // Touch
    let lastDist=0,lastCenter=null;
    viewport.addEventListener("touchstart",e=>{
        if(e.touches.length===2){lastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);lastCenter={x:(e.touches[0].clientX+e.touches[1].clientX)/2,y:(e.touches[0].clientY+e.touches[1].clientY)/2};}
        else if(e.touches.length===1&&e.target===viewport){isPanning=true;panStartX=e.touches[0].clientX;panStartY=e.touches[0].clientY;panStartPanX=panX;panStartPanY=panY;}
    },{passive:false});
    viewport.addEventListener("touchmove",e=>{
        if(e.touches.length===2){e.preventDefault();const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);const c={x:(e.touches[0].clientX+e.touches[1].clientX)/2,y:(e.touches[0].clientY+e.touches[1].clientY)/2};if(lastDist>0){const ns=Math.min(Math.max(scale*d/lastDist,0.1),2.5);const r=viewport.getBoundingClientRect();const mx=c.x-r.left,my=c.y-r.top;panX=mx-(mx-panX)*(ns/scale);panY=my-(my-panY)*(ns/scale);scale=ns;applyTransform();}if(lastCenter){panX+=c.x-lastCenter.x;panY+=c.y-lastCenter.y;applyTransform();}lastDist=d;lastCenter=c;}
        else if(e.touches.length===1&&isPanning){panX=panStartPanX+(e.touches[0].clientX-panStartX);panY=panStartPanY+(e.touches[0].clientY-panStartY);applyTransform();}
    },{passive:false});
    viewport.addEventListener("touchend",()=>{isPanning=false;lastDist=0;lastCenter=null;});

    // ─── Toolbar ────────────────────────────────────────────────

    function zoomAt(f){const r=viewport.getBoundingClientRect();const cx=r.width/2,cy=r.height/2;const ns=Math.min(Math.max(scale*f,0.1),2.5);panX=cx-(cx-panX)*(ns/scale);panY=cy-(cy-panY)*(ns/scale);scale=ns;applyTransform();}
    document.getElementById("btn-zoom-in").addEventListener("click",()=>zoomAt(1.25));
    document.getElementById("btn-zoom-out").addEventListener("click",()=>zoomAt(0.75));
    document.getElementById("btn-reset").addEventListener("click",()=>{scale=0.45;panX=0;panY=0;applyTransform();setTimeout(()=>fitToView(true),50);});
    document.getElementById("btn-fit").addEventListener("click",()=>fitToView(true));

    function fitToView(anim) {
        let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
        Object.values(nodeData).forEach(d=>{if(d.x<mnX)mnX=d.x;if(d.y<mnY)mnY=d.y;if(d.x+d.w>mxX)mxX=d.x+d.w;if(d.y+d.h>mxY)mxY=d.y+d.h;});
        if(!isFinite(mnX))return;
        const p=140,cw=mxX-mnX+p*2,ch=mxY-mnY+p*2;
        const vr=viewport.getBoundingClientRect();
        const fs=Math.min(vr.width/cw,vr.height/ch,1.2);
        if(anim){canvas.style.transition="transform 0.5s cubic-bezier(0.4,0,0.2,1)";setTimeout(()=>{canvas.style.transition="";},550);}
        scale=fs;panX=(vr.width-cw*fs)/2-(mnX-p)*fs;panY=(vr.height-ch*fs)/2-(mnY-p)*fs;
        applyTransform();
    }

    function panToNode(nid, anim) {
        const d = nodeData[nid];
        if (!d) return;
        const vr = viewport.getBoundingClientRect();
        const targetPanX = vr.width/2 - (d.x + d.w/2) * scale;
        const targetPanY = vr.height/2 - (d.y + d.h/2) * scale;
        if (anim) {
            canvas.style.transition = "transform 0.6s cubic-bezier(0.4,0,0.2,1)";
            setTimeout(() => { canvas.style.transition = ""; }, 650);
        }
        panX = targetPanX; panY = targetPanY;
        applyTransform();
    }

    // ─── Minimap ────────────────────────────────────────────────

    const mmC = document.getElementById("minimap-canvas");
    const mmX = mmC.getContext("2d");
    const mmV = document.getElementById("minimap-viewport");

    function updateMinimap(){
        const mw=mmC.width,mh=mmC.height;
        let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
        Object.values(nodeData).forEach(d=>{if(d.x<mnX)mnX=d.x;if(d.y<mnY)mnY=d.y;if(d.x+d.w>mxX)mxX=d.x+d.w;if(d.y+d.h>mxY)mxY=d.y+d.h;});
        if(!isFinite(mnX))return;
        const p=120;mnX-=p;mnY-=p;mxX+=p;mxY+=p;
        const rw=mxX-mnX,rh=mxY-mnY;const ms=Math.min(mw/rw,mh/rh);
        mmX.clearRect(0,0,mw,mh);
        // Connections
        mmX.globalAlpha=0.1;mmX.strokeStyle="#fff";mmX.lineWidth=0.6;
        CONNECTIONS.forEach(([f,t])=>{const fd=nodeData[f],td=nodeData[t];if(!fd||!td)return;mmX.beginPath();mmX.moveTo((fd.x+fd.w/2-mnX)*ms,(fd.y+fd.h/2-mnY)*ms);mmX.lineTo((td.x+td.w/2-mnX)*ms,(td.y+td.h/2-mnY)*ms);mmX.stroke();});
        // Nodes
        Object.entries(nodeData).forEach(([id,d])=>{const n=NODES.find(n=>n.id===id);mmX.fillStyle=n?n.color:"rgba(100,120,255,0.5)";mmX.globalAlpha=0.4;mmX.fillRect((d.x-mnX)*ms,(d.y-mnY)*ms,Math.max(d.w*ms,3),Math.max(d.h*ms,2));});
        mmX.globalAlpha=1;
        // Viewport
        const vr=viewport.getBoundingClientRect();
        const vx=(-panX/scale-mnX)*ms,vy=(-panY/scale-mnY)*ms;
        const vw=(vr.width/scale)*ms,vh=(vr.height/scale)*ms;
        mmV.style.left=Math.max(0,vx)+"px";mmV.style.top=Math.max(0,vy)+"px";
        mmV.style.width=Math.min(vw,mw)+"px";mmV.style.height=Math.min(vh,mh)+"px";
    }


    // ─────────────────────────────────────────────────────────────
    // ─── FLOW SIMULATOR ─────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────



    function startFlow(flowId) {
        unifiedBatchLog = null;
        const flow = FLOWS.find(f => f.id === flowId);
        if (!flow) return;

        // Stop any auto play
        stopAutoPlay();

        // Set active flow
        activeFlow = flow;
        activeStep = 0;

        // Update flow bar button states
        document.querySelectorAll(".flow-btn").forEach(b => {
            b.classList.toggle("active", b.dataset.flow === flowId);
        });

        // Expand sidebar and switch to simulator tab
        flowPanel.classList.remove("collapsed", "hidden");
        switchTab("simulator");

        // Hide help hint and legend during flow
        if (helpHint) helpHint.style.display = "none";

        // Render first step
        renderFlowStep();
    }

    function exitFlow() {
        stopAutoPlay();
        activeFlow = null;
        activeStep = -1;

        // Reset button states
        document.querySelectorAll(".flow-btn").forEach(b => b.classList.remove("active"));

        // Clear all flow states from nodes
        Object.values(nodeEls).forEach(el => {
            el.classList.remove("flow-dimmed", "flow-active", "flow-current", "flow-completed");
        });

        // Clear step badges
        NODES.forEach(n => {
            const badge = document.getElementById(`badge-${n.id}`);
            if (badge) { badge.classList.remove("visible","current"); badge.textContent = ""; }
        });

        // Reset trust boundary
        if (trustEl) trustEl.classList.remove("flow-highlight");

        // Reset connection states
        clearFlowConnections();

        // Redraw connections clean
        drawConnections();

        // Reset panel to Simulator tab if not batch log reviewing
        if (!unifiedBatchLog && typeof switchTab === "function") switchTab("simulator");
    }

    function nextStep() {
        if (!activeFlow) return;
        if (activeStep < activeFlow.steps.length - 1) {
            activeStep++;
            renderFlowStep();
        } else if (isAutoPlaying) {
            stopAutoPlay();
        }
    }

    function prevStep() {
        if (!activeFlow || activeStep <= 0) return;
        activeStep--;
        renderFlowStep();
    }

    function toggleAutoPlay() {
        if (isAutoPlaying) {
            stopAutoPlay();
        } else {
            isAutoPlaying = true;
            fpPlay.classList.add("playing");
            fpPlay.querySelector(".play-icon").style.display = "none";
            fpPlay.querySelector(".pause-icon").style.display = "block";
            autoAdvance();
        }
    }

    function stopAutoPlay() {
        isAutoPlaying = false;
        if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
        fpPlay.classList.remove("playing");
        fpPlay.querySelector(".play-icon").style.display = "block";
        fpPlay.querySelector(".pause-icon").style.display = "none";
    }

    function autoAdvance() {
        if (!isAutoPlaying || !activeFlow) return;
        autoTimer = setTimeout(() => {
            if (activeStep < activeFlow.steps.length - 1) {
                activeStep++;
                renderFlowStep();
                autoAdvance();
            } else {
                stopAutoPlay();
            }
        }, 2800);
    }

    function renderFlowStep() {
        if (!activeFlow) return;
        const flow = activeFlow;
        const step = flow.steps[activeStep];
        const totalSteps = flow.steps.length;

        // ── Update playback panel ──
        fpBadge.textContent = activeStep + 1;
        fpBadge.style.background = `linear-gradient(135deg, ${flow.color}, color-mix(in srgb, ${flow.color} 70%, white))`;
        fpLabel.textContent = step.label;
        fpDetail.textContent = step.detail;
        fpCounter.textContent = `${activeStep + 1} / ${totalSteps}`;
        fpProgress.style.width = ((activeStep + 1) / totalSteps * 100) + "%";

        if (step.data) {
            fpData.textContent = step.data;
            fpData.classList.add("visible");
        } else {
            fpData.classList.remove("visible");
        }

        // Button states
        fpPrev.disabled = activeStep === 0;
        fpNext.disabled = activeStep === totalSteps - 1;

        // ── Collect nodes in this flow ──
        const flowNodeIds = [...new Set(flow.steps.map(s => s.node))];

        // ── Apply node states ──
        NODES.forEach(n => {
            const el = nodeEls[n.id];
            const badge = document.getElementById(`badge-${n.id}`);
            const isInFlow = flowNodeIds.includes(n.id);

            // Reset
            el.classList.remove("flow-dimmed", "flow-active", "flow-current", "flow-completed");
            badge.classList.remove("visible", "current");
            badge.textContent = "";

            if (!isInFlow) {
                el.classList.add("flow-dimmed");
                return;
            }

            // Find this node's step indices in the flow
            const nodeSteps = [];
            flow.steps.forEach((s, i) => { if (s.node === n.id) nodeSteps.push(i); });

            // Find the relevant step for this node relative to current
            const activeNodeStep = nodeSteps.filter(i => i <= activeStep);
            const futureNodeStep = nodeSteps.filter(i => i > activeStep);

            if (activeNodeStep.length > 0) {
                const lastActiveIdx = activeNodeStep[activeNodeStep.length - 1];
                if (lastActiveIdx === activeStep) {
                    el.classList.add("flow-current");
                    badge.textContent = lastActiveIdx + 1;
                    badge.style.background = `linear-gradient(135deg, ${n.color}, color-mix(in srgb, ${n.color} 60%, white))`;
                    badge.classList.add("visible", "current");
                } else {
                    el.classList.add("flow-active", "flow-completed");
                    badge.textContent = lastActiveIdx + 1;
                    badge.style.background = n.color;
                    badge.classList.add("visible");
                }
            } else {
                // Future step — show as active but not yet reached
                el.classList.add("flow-active");
                el.style.opacity = "0.4";
                setTimeout(() => { if (el.classList.contains("flow-active")) el.style.opacity = ""; }, 10);
            }
        });

        // ── Apply connection states ──
        applyFlowToConnections();

        // ── Trust boundary highlight ──
        if (trustEl) trustEl.classList.toggle("flow-highlight", !!step.trustHighlight);

        // ── Pan camera to current node ──
        panToNode(step.node, true);

        // ── Update active execution log in background ──
        if (typeof updateExecutionLogUI === "function") updateExecutionLogUI();
    }

    function applyFlowToConnections() {
        if (!activeFlow) return;
        const flow = activeFlow;

        // Build list of active edges: consecutive steps form edges
        const activeEdges = [];
        const prevEdges = [];
        for (let i = 0; i < activeStep; i++) {
            prevEdges.push([flow.steps[i].node, flow.steps[i+1].node]);
        }
        if (activeStep > 0) {
            activeEdges.push([flow.steps[activeStep-1].node, flow.steps[activeStep].node]);
        }

        svgLayer.querySelectorAll(".conn-line,.conn-arrow,.conn-label,.conn-dot").forEach(el => {
            const f = el.dataset.from, t = el.dataset.to;

            // Check if this connection matches any flow edge (in either direction)
            const isActive = activeEdges.some(([a,b]) => (f===a&&t===b)||(f===b&&t===a));
            const isPrev   = prevEdges.some(([a,b]) => (f===a&&t===b)||(f===b&&t===a));

            el.classList.remove("flow-dimmed","flow-active","flow-active-prev");

            if (isActive) {
                el.classList.add("flow-active");
            } else if (isPrev) {
                el.classList.add("flow-active-prev");
            } else {
                el.classList.add("flow-dimmed");
            }
        });
    }

    function clearFlowConnections() {
        svgLayer.querySelectorAll(".conn-line,.conn-arrow,.conn-label,.conn-dot").forEach(el => {
            el.classList.remove("flow-dimmed","flow-active","flow-active-prev");
        });
    }

    // Flow control event listeners
    fpClose.addEventListener("click", exitFlow);
    fpPrev.addEventListener("click", prevStep);
    fpNext.addEventListener("click", nextStep);
    fpPlay.addEventListener("click", toggleAutoPlay);

    // Draggable header logic
    fpHeader.addEventListener("mousedown", startDragPanel);
    fpHeader.addEventListener("touchstart", startDragPanel, { passive: false });

    function startDragPanel(e) {
        // Ignore if clicking on interactive control buttons
        if (e.target.closest(".fp-header-actions") || e.target.closest("button")) return;
        if (currentDockState !== "float") return; // cannot drag if docked

        e.preventDefault();
        isPanelDragging = true;
        flowPanel.classList.add("is-dragging");

        const clientX = e.type.startsWith("touch") ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.startsWith("touch") ? e.touches[0].clientY : e.clientY;

        dragStartX = clientX;
        dragStartY = clientY;

        const rect = flowPanel.getBoundingClientRect();
        dragStartLeft = rect.left;
        dragStartTop = rect.top;

        const onDragMove = ev => {
            if (!isPanelDragging) return;
            const currentX = ev.type.startsWith("touch") ? ev.touches[0].clientX : ev.clientX;
            const currentY = ev.type.startsWith("touch") ? ev.touches[0].clientY : ev.clientY;

            const dx = currentX - dragStartX;
            const dy = currentY - dragStartY;

            const targetX = dragStartLeft + dx;
            const targetY = dragStartTop + dy;

            const w = flowPanel.offsetWidth;
            const h = flowPanel.offsetHeight;

            // Restrict panel coordinates completely within the visible viewport bounds
            panelPosition = {
                x: Math.max(0, Math.min(window.innerWidth - w, targetX)),
                y: Math.max(0, Math.min(window.innerHeight - h, targetY))
            };

            flowPanel.style.left = panelPosition.x + "px";
            flowPanel.style.top = panelPosition.y + "px";
        };

        const onDragEnd = () => {
            isPanelDragging = false;
            flowPanel.classList.remove("is-dragging");
            document.removeEventListener("mousemove", onDragMove);
            document.removeEventListener("mouseup", onDragEnd);
            document.removeEventListener("touchmove", onDragMove);
            document.removeEventListener("touchend", onDragEnd);
        };

        document.addEventListener("mousemove", onDragMove);
        document.addEventListener("mouseup", onDragEnd);
        document.addEventListener("touchmove", onDragMove, { passive: false });
        document.addEventListener("touchend", onDragEnd);
    }

    // Minimize Control panel
    fpMinimize.addEventListener("click", () => {
        isMinimized = !isMinimized;
        flowPanel.classList.toggle("collapsed", isMinimized);

        const minIcon = fpMinimize.querySelector(".minimize-icon");
        const restoreIcon = fpMinimize.querySelector(".restore-icon");

        if (isMinimized) {
            if (minIcon) minIcon.style.display = "none";
            if (restoreIcon) restoreIcon.style.display = "block";
            fpMinimize.setAttribute("title", "Expand Sidebar");
        } else {
            if (minIcon) minIcon.style.display = "block";
            if (restoreIcon) restoreIcon.style.display = "none";
            fpMinimize.setAttribute("title", "Collapse Sidebar");
        }

        setTimeout(() => { updateMinimap(); }, 350);
    });

    // Cycle Sidebar Dock position: Right -> Left
    fpDock.addEventListener("click", () => {
        if (currentDockState === "right") {
            currentDockState = "left";
            flowPanel.classList.add("dock-left");
            flowPanel.classList.remove("dock-right");
        } else {
            currentDockState = "right";
            flowPanel.classList.add("dock-right");
            flowPanel.classList.remove("dock-left");
        }
        setTimeout(() => { updateMinimap(); }, 350);
    });

    // Adjust floating panel position when browser scales or resizes
    window.addEventListener("resize", () => {
        if (activeFlow && currentDockState === "float" && panelPosition) {
            const w = flowPanel.offsetWidth;
            const h = flowPanel.offsetHeight;
            panelPosition.x = Math.max(0, Math.min(window.innerWidth - w, panelPosition.x));
            panelPosition.y = Math.max(0, Math.min(window.innerHeight - h, panelPosition.y));
            flowPanel.style.left = panelPosition.x + "px";
            flowPanel.style.top = panelPosition.y + "px";
        }
    });

    // ─── ARCHITECTURE IDE LOGS & AI EXPORTS ──────────────────────

    const btnIde = document.getElementById("btn-ide");
    const btnTermToggle = document.getElementById("btn-term-toggle");
    const tabBtnSimulator = document.getElementById("tab-btn-simulator");
    const tabBtnLog = document.getElementById("tab-btn-log");
    const tabBtnAi = document.getElementById("tab-btn-ai");
    const tabBtnPack = document.getElementById("tab-btn-pack");
    const tabBtnBatch = document.getElementById("tab-btn-batch");
    const tabBtnHealth = document.getElementById("tab-btn-health");
    const tabBtnHistory = document.getElementById("tab-btn-history");
    const tabBtnTerminal = document.getElementById("tab-btn-terminal");

    const panelSimulator = document.getElementById("panel-simulator");
    const panelLog = document.getElementById("panel-log");
    const panelAi = document.getElementById("panel-ai");
    const panelPack = document.getElementById("panel-pack");
    const panelBatch = document.getElementById("panel-batch");
    const panelHealth = document.getElementById("panel-health");
    const panelHistory = document.getElementById("panel-history");
    const panelTerminal = document.getElementById("panel-terminal");
    const terminalContainer = document.getElementById("terminal-container");

    const batchChecklist = document.getElementById("batch-checklist");
    const btnStartBatch = document.getElementById("btn-start-batch");
    const btnStopBatch = document.getElementById("btn-stop-batch");
    const healthReportContent = document.getElementById("health-report-content");
    const historyReportContent = document.getElementById("history-report-content");

    const logCodePreview = document.getElementById("log-code-preview");
    
    // AI Chat Panel selectors
    const btnAiSettings = document.getElementById("btn-ai-settings");
    const btnClearChat = document.getElementById("btn-clear-chat");
    const aiChatHistory = document.getElementById("ai-chat-history");
    const aiQuickTemplates = document.getElementById("ai-quick-templates");
    const aiChatInput = document.getElementById("ai-chat-input");
    const btnAiSend = document.getElementById("btn-ai-send");
    const aiSettingsDrawer = document.getElementById("ai-settings-drawer");
    const btnCloseSettings = document.getElementById("btn-close-settings");
    const aiProviderSelect = document.getElementById("ai-provider-select");
    const btnSaveSettings = document.getElementById("btn-save-settings");
    const aiInjectContext = document.getElementById("ai-inject-context");

    // Provider config divs
    const sectionGemini = document.getElementById("section-gemini");
    const sectionOpenai = document.getElementById("section-openai");
    const sectionOllama = document.getElementById("section-ollama");

    // Config inputs
    const inputGeminiKey = document.getElementById("ai-gemini-key");
    const inputGeminiModel = document.getElementById("ai-gemini-model");
    const inputGeminiUrl = document.getElementById("ai-gemini-url");
    const inputOpenaiKey = document.getElementById("ai-openai-key");
    const inputOpenaiModel = document.getElementById("ai-openai-model");
    const inputOpenaiUrl = document.getElementById("ai-openai-url");
    const inputOllamaUrl = document.getElementById("ai-ollama-url");
    const inputOllamaModel = document.getElementById("ai-ollama-model");

    const btnCopyLogJson = document.getElementById("btn-copy-log-json");
    const btnCopyLogMd = document.getElementById("btn-copy-log-md");
    const btnDownloadLog = document.getElementById("btn-download-log");
    const btnCopyPack = document.getElementById("btn-copy-pack");
    const btnDownloadPackJson = document.getElementById("btn-download-pack-json");
    const btnDownloadPackMd = document.getElementById("btn-download-pack-md");

    // AI_PROMPTS moved to js/constants.js

    let selectedAiKey = "review";

    // generateExecutionLogJSON, generateExecutionLogMarkdown, generateKnowledgePackJSON, and generateKnowledgePackMarkdown moved to js/reports/generators.js

    // Utility functions showToast, copyToClipboard, and downloadFile moved to js/utils.js

    function updateExecutionLogUI() {
        if (unifiedBatchLog) {
            logCodePreview.textContent = JSON.stringify(unifiedBatchLog, null, 4);
            return;
        }
        if (!activeFlow) {
            logCodePreview.textContent = "Select and run a simulation scenario to record system execution logs.";
            return;
        }
        const log = generateExecutionLogJSON(activeFlow, activeStep);
        logCodePreview.textContent = JSON.stringify(log, null, 4);
    }

    // ─── AI CHAT REDESIGN IMPLEMENTATION ──────────────────────────
    
    // renderMarkdownToHtml moved to js/utils.js

    // Load settings from localStorage
    function loadAISettings() {
        if (!aiProviderSelect) return;
        const provider = localStorage.getItem("archbench_ai_provider") || "gemini";
        aiProviderSelect.value = provider;

        // Gemini
        if (inputGeminiKey) inputGeminiKey.value = localStorage.getItem("archbench_gemini_key") || "";
        if (inputGeminiModel) inputGeminiModel.value = localStorage.getItem("archbench_gemini_model") || "gemini-2.5-flash";
        if (inputGeminiUrl) inputGeminiUrl.value = localStorage.getItem("archbench_gemini_url") || "https://generativelanguage.googleapis.com";

        // OpenAI
        if (inputOpenaiKey) inputOpenaiKey.value = localStorage.getItem("archbench_openai_key") || "";
        if (inputOpenaiModel) inputOpenaiModel.value = localStorage.getItem("archbench_openai_model") || "gpt-4o";
        if (inputOpenaiUrl) inputOpenaiUrl.value = localStorage.getItem("archbench_openai_url") || "https://api.openai.com/v1";

        // Ollama
        if (inputOllamaUrl) inputOllamaUrl.value = localStorage.getItem("archbench_ollama_url") || "http://localhost:11434";
        if (inputOllamaModel) inputOllamaModel.value = localStorage.getItem("archbench_ollama_model") || "qwen2.5:coder";

        const inject = localStorage.getItem("archbench_ai_inject_context");
        if (inject !== null && aiInjectContext) {
            aiInjectContext.checked = inject === "true";
        }

        updateProviderSectionsVisibility();
    }

    // Save settings to localStorage
    function saveAISettings() {
        if (!aiProviderSelect) return;
        localStorage.setItem("archbench_ai_provider", aiProviderSelect.value);
        
        // Gemini
        if (inputGeminiKey) localStorage.setItem("archbench_gemini_key", inputGeminiKey.value.trim());
        if (inputGeminiModel) localStorage.setItem("archbench_gemini_model", inputGeminiModel.value.trim() || "gemini-2.5-flash");
        if (inputGeminiUrl) localStorage.setItem("archbench_gemini_url", inputGeminiUrl.value.trim() || "https://generativelanguage.googleapis.com");

        // OpenAI
        if (inputOpenaiKey) localStorage.setItem("archbench_openai_key", inputOpenaiKey.value.trim());
        if (inputOpenaiModel) localStorage.setItem("archbench_openai_model", inputOpenaiModel.value.trim() || "gpt-4o");
        if (inputOpenaiUrl) localStorage.setItem("archbench_openai_url", inputOpenaiUrl.value.trim() || "https://api.openai.com/v1");

        // Ollama
        if (inputOllamaUrl) localStorage.setItem("archbench_ollama_url", inputOllamaUrl.value.trim() || "http://localhost:11434");
        if (inputOllamaModel) localStorage.setItem("archbench_ollama_model", inputOllamaModel.value.trim() || "qwen2.5:coder");

        if (aiInjectContext) {
            localStorage.setItem("archbench_ai_inject_context", aiInjectContext.checked);
        }

        showToast("AI configuration saved successfully!");
        if (aiSettingsDrawer) {
            aiSettingsDrawer.classList.remove("open");
        }
        
        // Re-render chat welcoming flow if key just changed
        initChatHistory();
    }

    function updateProviderSectionsVisibility() {
        if (!aiProviderSelect) return;
        const val = aiProviderSelect.value;
        if (sectionGemini) sectionGemini.style.display = val === "gemini" ? "flex" : "none";
        if (sectionOpenai) sectionOpenai.style.display = val === "openai" ? "flex" : "none";
        if (sectionOllama) sectionOllama.style.display = val === "ollama" ? "flex" : "none";
    }

    // Chat History Management
    let chatHistoryLog = [];

    function appendMessage(role, content, isHtml = false) {
        if (!aiChatHistory) return null;
        const msgDiv = document.createElement("div");
        msgDiv.className = `ai-msg ${role}`;
        
        if (role === "system") {
            msgDiv.textContent = content;
        } else if (isHtml) {
            msgDiv.innerHTML = content;
        } else {
            msgDiv.innerHTML = renderMarkdownToHtml(content);
        }

        aiChatHistory.appendChild(msgDiv);
        aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
        
        // Keep in memory
        chatHistoryLog.push({ role, content, isHtml });
        return msgDiv;
    }

    function appendTypingIndicator() {
        if (!aiChatHistory) return null;
        const indicatorDiv = document.createElement("div");
        indicatorDiv.className = "ai-msg ai typing";
        indicatorDiv.innerHTML = `
            <div class="ai-typing-indicator">
                <span class="ai-typing-dot"></span>
                <span class="ai-typing-dot"></span>
                <span class="ai-typing-dot"></span>
            </div>
        `;
        aiChatHistory.appendChild(indicatorDiv);
        aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
        return indicatorDiv;
    }

    function hasActiveApiKeyConfigured() {
        const provider = localStorage.getItem("archbench_ai_provider") || "gemini";
        if (provider === "gemini") {
            return !!(localStorage.getItem("archbench_gemini_key") || "").trim();
        } else if (provider === "openai") {
            return !!(localStorage.getItem("archbench_openai_key") || "").trim();
        }
        return true; // Ollama does not require local keys
    }

    function initChatHistory() {
        if (!aiChatHistory) return;
        aiChatHistory.innerHTML = "";
        chatHistoryLog = [];
        
        if (!hasActiveApiKeyConfigured()) {
            const setupCard = document.createElement("div");
            setupCard.className = "ai-setup-card";
            setupCard.innerHTML = `
                <div class="ai-setup-icon">🔑</div>
                <div class="ai-setup-title">Setup API Key Required</div>
                <div class="ai-setup-text">Real-time system analysis requires an active LLM API Key. Google Gemini and OpenAI are supported client-side. Keys are stored safely in local storage.</div>
                <button class="ai-setup-btn" id="btn-chat-trigger-settings">⚙️ Configure LLM Settings</button>
            `;
            aiChatHistory.appendChild(setupCard);
            
            const triggerSettingsBtn = setupCard.querySelector("#btn-chat-trigger-settings");
            if (triggerSettingsBtn) {
                triggerSettingsBtn.addEventListener("click", () => {
                    if (aiSettingsDrawer) aiSettingsDrawer.classList.add("open");
                });
            }
        } else {
            appendMessage("system", "Welcome to the AI System Architect! Configure your LLM under Settings, click a template shortcut below, or ask a question about your architecture.");
        }
    }

    // Populate the template chips at the bottom of the chat panel
    function populateAIChips() {
        if (!aiQuickTemplates) return;
        aiQuickTemplates.innerHTML = "";
        Object.entries(AI_PROMPTS).forEach(([key, info]) => {
            const chip = document.createElement("button");
            chip.className = "ai-chip";
            chip.textContent = info.title;
            chip.addEventListener("click", () => {
                const mdContext = generateKnowledgePackMarkdown();
                const compiledPrompt = info.prompt(mdContext);
                sendChatMessage(compiledPrompt, `Shortcut: ${info.title}`);
            });
            aiQuickTemplates.appendChild(chip);
        });
    }

    // Call API endpoints
    async function sendChatMessage(promptText, displayQuery = null) {
        if (!hasActiveApiKeyConfigured()) {
            appendMessage("error", "⚠️ API Key is missing. Please click 'Settings' at the top of the AI panel to configure your Google Gemini or OpenAI credentials.");
            return;
        }

        const queryToDisplay = displayQuery || (promptText.length > 80 ? promptText.substring(0, 80) + "..." : promptText);
        
        // Add user bubble
        appendMessage("user", queryToDisplay);

        // Add typing indicator
        const typingIndicator = appendTypingIndicator();

        const provider = aiProviderSelect.value;
        let responseText = "";
        let errorOccurred = false;

        try {
            if (provider === "gemini") {
                const apiKey = inputGeminiKey.value.trim();
                const model = inputGeminiModel.value.trim() || "gemini-2.5-flash";
                let baseUrl = inputGeminiUrl.value.trim() || "https://generativelanguage.googleapis.com";
                
                if (!apiKey) {
                    throw new Error("Gemini API Key is missing. Click 'Settings' to configure it.");
                }

                // Normalise baseUrl trailing slash
                if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

                const endpoint = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;

                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [{ text: promptText }]
                            }
                        ]
                    })
                });

                if (!response.ok) {
                    const errorJson = await response.json().catch(() => ({}));
                    throw new Error(errorJson.error?.message || `HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!responseText) {
                    throw new Error("Empty response received from Gemini API.");
                }

            } else if (provider === "openai") {
                const apiKey = inputOpenaiKey.value.trim();
                const model = inputOpenaiModel.value.trim() || "gpt-4o";
                let baseUrl = inputOpenaiUrl.value.trim() || "https://api.openai.com/v1";

                if (!apiKey) {
                    throw new Error("OpenAI API Key is missing. Click 'Settings' to configure it.");
                }

                if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
                const endpoint = `${baseUrl}/chat/completions`;

                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: "user", content: promptText }
                        ],
                        temperature: 0.2
                    })
                });

                if (!response.ok) {
                    const errorJson = await response.json().catch(() => ({}));
                    throw new Error(errorJson.error?.message || `HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                responseText = data.choices?.[0]?.message?.content;
                if (!responseText) {
                    throw new Error("Empty response received from OpenAI API.");
                }

            } else if (provider === "ollama") {
                let baseUrl = inputOllamaUrl.value.trim() || "http://localhost:11434";
                const model = inputOllamaModel.value.trim() || "qwen2.5:coder";

                if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
                const endpoint = `${baseUrl}/api/chat`;

                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: "user", content: promptText }
                        ],
                        stream: false
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}. Ensure Ollama is running and OLLAMA_ORIGINS="*" serve is active.`);
                }

                const data = await response.json();
                responseText = data.message?.content;
                if (!responseText) {
                    throw new Error("Empty response received from Ollama API.");
                }
            }
        } catch (err) {
            console.error("AI Error:", err);
            responseText = `⚠️ Error: ${err.message}`;
            errorOccurred = true;
        } finally {
            // Remove typing indicator bubble
            if (typingIndicator) typingIndicator.remove();
        }

        // Add assistant response
        if (errorOccurred) {
            appendMessage("error", responseText);
        } else {
            appendMessage("ai", responseText);
        }
    }

    // Keep legacy support for initial onboarding triggers
    function populateAIGrid() {
        populateAIChips();
    }

    const tabBtns = [tabBtnSimulator, tabBtnLog, tabBtnAi, tabBtnPack, tabBtnBatch, tabBtnHealth, tabBtnHistory, tabBtnTerminal];
    const panels = [panelSimulator, panelLog, panelAi, panelPack, panelBatch, panelHealth, panelHistory, panelTerminal];

    let activeTabId = ""; // track active tab

    export function switchTab(targetId) {
        if (!flowPanel) return;

        if (targetId === activeTabId && !flowPanel.classList.contains("collapsed")) {
            // Clicking already active tab collapses the sidebar panel
            flowPanel.classList.add("collapsed");
            setTimeout(() => { updateMinimap(); }, 350);
            return;
        }

        // Expand the sidebar panel
        flowPanel.classList.remove("collapsed", "hidden");
        activeTabId = targetId;

        tabBtns.forEach(btn => {
            if (btn) btn.classList.toggle("active", btn.id === `tab-btn-${targetId}`);
        });
        panels.forEach(panel => {
            if (panel) panel.classList.toggle("active", panel.id === `panel-${targetId}`);
        });

        // Trigger updates when specific tabs load
        if (targetId === "log") {
            updateExecutionLogUI();
        } else if (targetId === "ai") {
            if (chatHistoryLog.length === 0) {
                initChatHistory();
            }
            loadAISettings();
            populateAIChips();
        } else if (targetId === "health") {
            updateArchitectureHealthUI();
        } else if (targetId === "history") {
            updateArchitectureHistoryUI();
        } else if (targetId === "terminal") {
            initTerminalOnce();
        }

        // Adjust title and subtitle text dynamically to match active tab
        if (fpTitle && fpSubtitle) {
            if (targetId === "ai") {
                fpTitle.textContent = "AI System Architect";
                fpSubtitle.textContent = "Conversational copilot & reviews";
            } else if (targetId === "simulator") {
                fpTitle.textContent = activeFlow ? activeFlow.title : "Trace Flow Simulator";
                fpSubtitle.textContent = activeFlow ? activeFlow.subtitle : "Step-by-step trace playback";
            } else if (targetId === "batch") {
                fpTitle.textContent = "Flow Checklist";
                fpSubtitle.textContent = "Batch audits & health compilations";
            } else if (targetId === "log") {
                fpTitle.textContent = "Execution Log";
                fpSubtitle.textContent = "Audit results & dynamic outputs";
            } else if (targetId === "health") {
                fpTitle.textContent = "Architecture Health";
                fpSubtitle.textContent = "Structural analysis & telemetry indices";
            } else if (targetId === "history") {
                fpTitle.textContent = "Audit History";
                fpSubtitle.textContent = "IndexedDB historical snapshots";
            } else if (targetId === "pack") {
                fpTitle.textContent = "Knowledge Pack";
                fpSubtitle.textContent = "Markdown system description exports";
            } else if (targetId === "terminal") {
                fpTitle.textContent = "Project Shell Terminal";
                fpSubtitle.textContent = "Workspace command line tool";
            }
        }
        
        setTimeout(() => { updateMinimap(); }, 350);
    }

    if (tabBtnSimulator) tabBtnSimulator.addEventListener("click", () => switchTab("simulator"));
    if (tabBtnLog) tabBtnLog.addEventListener("click", () => switchTab("log"));
    if (tabBtnAi) tabBtnAi.addEventListener("click", () => switchTab("ai"));
    if (tabBtnPack) tabBtnPack.addEventListener("click", () => switchTab("pack"));
    if (tabBtnBatch) tabBtnBatch.addEventListener("click", () => switchTab("batch"));
    if (tabBtnHealth) tabBtnHealth.addEventListener("click", () => switchTab("health"));
    if (tabBtnHistory) tabBtnHistory.addEventListener("click", () => switchTab("history"));
    if (tabBtnTerminal) tabBtnTerminal.addEventListener("click", () => switchTab("terminal"));

    if (btnTermToggle) {
        btnTermToggle.addEventListener("click", () => {
            stopAutoPlay();
            flowPanel.classList.remove("collapsed", "hidden");
            // Switch to terminal tab (expand if collapsed)
            if (activeTabId === "terminal" && flowPanel.classList.contains("collapsed")) {
                flowPanel.classList.remove("collapsed");
            } else {
                switchTab("terminal");
            }
        });
    }

    // Topbar IDE action launcher (AI Architect tab trigger)
    if (btnIde) {
        btnIde.addEventListener("click", () => {
            stopAutoPlay();
            flowPanel.classList.remove("collapsed", "hidden");
            // Switch to AI tab (expand if collapsed)
            if (activeTabId === "ai" && flowPanel.classList.contains("collapsed")) {
                flowPanel.classList.remove("collapsed");
            } else {
                switchTab("ai");
            }
        });
    }

    // Wire up exports actions
    btnCopyLogJson.addEventListener("click", () => {
        if (unifiedBatchLog) {
            const combined = {
                unifiedAuditLog: unifiedBatchLog,
                architectureHealthReport: generateArchitectureHealthReport(unifiedBatchLog)
            };
            const json = JSON.stringify(combined, null, 2);
            copyToClipboard(json, "Unified batch execution log and Architecture Health Report copied!");
            return;
        }
        if (!activeFlow) {
            showToast("No active simulation to copy!");
            return;
        }
        const json = JSON.stringify(generateExecutionLogJSON(activeFlow, activeStep), null, 2);
        copyToClipboard(json, "JSON execution log copied!");
    });

    btnCopyLogMd.addEventListener("click", () => {
        if (unifiedBatchLog) {
            const md = generateBatchLogMarkdown(unifiedBatchLog);
            copyToClipboard(md, "Unified batch Markdown execution log and Health Report copied!");
            return;
        }
        if (!activeFlow) {
            showToast("No active simulation to copy!");
            return;
        }
        const md = generateExecutionLogMarkdown(activeFlow, activeStep);
        copyToClipboard(md, "Markdown execution log copied!");
    });

    btnDownloadLog.addEventListener("click", () => {
        if (unifiedBatchLog) {
            const combined = {
                unifiedAuditLog: unifiedBatchLog,
                architectureHealthReport: generateArchitectureHealthReport(unifiedBatchLog)
            };
            const json = JSON.stringify(combined, null, 2);
            const filename = `archbench_unified_batch_simulation_log_${Date.now()}.json`;
            downloadFile(json, filename, "application/json");
            return;
        }
        if (!activeFlow) {
            showToast("No active simulation to download!");
            return;
        }
        const json = JSON.stringify(generateExecutionLogJSON(activeFlow, activeStep), null, 2);
        const filename = `archbench_simulation_log_${activeFlow.id}_${Date.now()}.json`;
        downloadFile(json, filename, "application/json");
    });

    // AI Chat & Settings Event Listeners
    if (btnAiSettings) {
        btnAiSettings.addEventListener("click", () => {
            if (aiSettingsDrawer) aiSettingsDrawer.classList.add("open");
        });
    }
    if (btnCloseSettings) {
        btnCloseSettings.addEventListener("click", () => {
            if (aiSettingsDrawer) aiSettingsDrawer.classList.remove("open");
        });
    }
    if (btnSaveSettings) {
        btnSaveSettings.addEventListener("click", () => {
            saveAISettings();
        });
    }
    if (aiProviderSelect) {
        aiProviderSelect.addEventListener("change", () => {
            updateProviderSectionsVisibility();
        });
    }
    if (btnClearChat) {
        btnClearChat.addEventListener("click", () => {
            if (confirm("Clear chat history?")) {
                initChatHistory();
            }
        });
    }

    if (aiChatInput) {
        // Auto-growing textarea for chat input
        aiChatInput.addEventListener("input", () => {
            aiChatInput.style.height = "auto";
            aiChatInput.style.height = Math.min(100, aiChatInput.scrollHeight) + "px";
        });

        // Key press handlers (Enter to send, Shift+Enter for new line)
        aiChatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (btnAiSend) btnAiSend.click();
            }
        });
    }

    if (btnAiSend) {
        btnAiSend.addEventListener("click", () => {
            try {
                if (!aiChatInput) return;
                const text = aiChatInput.value.trim();
                if (!text) return;
                
                let finalPrompt = text;
                if (aiInjectContext && aiInjectContext.checked) {
                    const mdContext = generateKnowledgePackMarkdown();
                    finalPrompt = `User question: ${text}\n\n=== CURRENT ARCHITECTURE SPECIFICATION ===\n${mdContext}`;
                }
                
                aiChatInput.value = "";
                aiChatInput.style.height = "34px";
                sendChatMessage(finalPrompt, text);
            } catch (err) {
                console.error("AI Send click error:", err);
                appendMessage("error", `⚠️ UI Event Error: ${err.message}`);
            }
        });
    }

    btnCopyPack.addEventListener("click", () => {
        const pack = JSON.stringify(generateKnowledgePackJSON(), null, 2);
        copyToClipboard(pack, "Ecosystem Knowledge Pack (JSON) copied!");
    });

    btnDownloadPackJson.addEventListener("click", () => {
        const pack = JSON.stringify(generateKnowledgePackJSON(), null, 2);
        downloadFile(pack, `archbench_knowledge_pack_${Date.now()}.json`, "application/json");
    });

    btnDownloadPackMd.addEventListener("click", () => {
        const md = generateKnowledgePackMarkdown();
        downloadFile(md, `archbench_architecture_context_${Date.now()}.md`, "text/markdown");
    });

    // ─── Flow Checklist / Batch Run System ──────────────────────
    export let unifiedBatchLog = null;
    let isBatchRunning = false;
    let batchQueue = [];
    let batchQueueIndex = 0;
    let batchTimer = null;

    function populateBatchChecklist() {
        if (!batchChecklist) return;
        batchChecklist.innerHTML = "";
        FLOWS.forEach(flow => {
            const item = document.createElement("label");
            item.className = "batch-checkbox-item";
            item.dataset.flow = flow.id;
            item.innerHTML = `
                <input type="checkbox" value="${flow.id}" checked>
                <span class="flow-btn-dot" style="background:${flow.color}; width: 8px; height: 8px; display: inline-block; border-radius: 50%; margin-right: 4px;"></span>
                <span>${flow.title}</span>
            `;
            batchChecklist.appendChild(item);
        });
    }

    function startBatchRun() {
        const checkedBoxes = batchChecklist.querySelectorAll("input[type='checkbox']:checked");
        const selectedFlowIds = Array.from(checkedBoxes).map(cb => cb.value);

        if (selectedFlowIds.length === 0) {
            showToast("Please select at least one flow!");
            return;
        }

        stopAutoPlay();
        isBatchRunning = true;
        batchQueue = selectedFlowIds;
        batchQueueIndex = 0;
        unifiedBatchLog = {
            title: "Unified Architecture Simulation Audit",
            version: project.version || "1.0",
            timestamp: new Date().toISOString(),
            flowsSimulated: selectedFlowIds.map(fid => {
                const f = FLOWS.find(flow => flow.id === fid);
                return f ? f.title : fid;
            }),
            steps: []
        };

        btnStartBatch.style.display = "none";
        btnStopBatch.style.display = "block";
        document.getElementById("batch-status-msg").textContent = "Preparing batch run...";

        // Disable checkboxes during run
        batchChecklist.querySelectorAll("input[type='checkbox']").forEach(cb => {
            cb.disabled = true;
        });

        // Reset all list items styling
        batchChecklist.querySelectorAll(".batch-checkbox-item").forEach(item => {
            item.classList.remove("active", "completed");
        });

        runNextFlowInBatch();
    }

    function runNextFlowInBatch() {
        if (!isBatchRunning) return;

        if (batchQueueIndex >= batchQueue.length) {
            finishBatchRun();
            return;
        }

        const flowId = batchQueue[batchQueueIndex];
        const flow = FLOWS.find(f => f.id === flowId);
        if (!flow) {
            batchQueueIndex++;
            runNextFlowInBatch();
            return;
        }

        // Highlight active flow checklist item
        const itemEl = batchChecklist.querySelector(`.batch-checkbox-item[data-flow="${flowId}"]`);
        if (itemEl) {
            itemEl.classList.add("active");
            itemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Start flow on graph
        activeFlow = flow;
        activeStep = 0;
        
        // Show panel & switch to simulator tab
        flowPanel.classList.remove("collapsed", "hidden");
        switchTab("simulator");
        if (helpHint) helpHint.style.display = "none";

        document.getElementById("batch-status-msg").textContent = `Simulating: ${flow.title}...`;

        renderFlowStep();
        advanceBatchStep();
    }

    function advanceBatchStep() {
        if (!isBatchRunning || !activeFlow) return;

        // Record step
        const s = activeFlow.steps[activeStep];
        const nodeObj = NODES.find(n => n.id === s.node);
        unifiedBatchLog.steps.push({
            seq: unifiedBatchLog.steps.length + 1,
            flow: activeFlow.title,
            flowStep: activeStep + 1,
            node: nodeObj ? nodeObj.title : s.node,
            action: s.label,
            details: s.detail,
            data: s.data || "N/A"
        });

        batchTimer = setTimeout(() => {
            if (activeStep < activeFlow.steps.length - 1) {
                activeStep++;
                renderFlowStep();
                advanceBatchStep();
            } else {
                // Completed this flow!
                const itemEl = batchChecklist.querySelector(`.batch-checkbox-item[data-flow="${activeFlow.id}"]`);
                if (itemEl) {
                    itemEl.classList.remove("active");
                    itemEl.classList.add("completed");
                }

                batchQueueIndex++;
                runNextFlowInBatch();
            }
        }, 1500);
    }

    function stopBatchRun() {
        isBatchRunning = false;
        if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }

        batchChecklist.querySelectorAll("input[type='checkbox']").forEach(cb => {
            cb.disabled = false;
        });

        btnStartBatch.style.display = "block";
        btnStopBatch.style.display = "none";
        document.getElementById("batch-status-msg").textContent = "Batch audit stopped.";

        unifiedBatchLog = null;
        exitFlow();
        updateArchitectureHealthUI();
    }

    function finishBatchRun() {
        isBatchRunning = false;
        if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }

        batchChecklist.querySelectorAll("input[type='checkbox']").forEach(cb => {
            cb.disabled = false;
        });

        btnStartBatch.style.display = "block";
        btnStopBatch.style.display = "none";
        document.getElementById("batch-status-msg").textContent = "Batch simulation complete! Log compiled.";

        exitFlow();

        saveAuditRun(unifiedBatchLog).then(() => {
            updateArchitectureHealthUI();
            switchTab("health");
            showToast("Batch audit complete! Health Report generated & saved to local history.");
        }).catch(err => {
            console.error("History persistence error:", err);
            updateArchitectureHealthUI();
            switchTab("health");
            showToast("Batch audit complete! Health Report generated.");
        });
    }

    function generateBatchLogMarkdown(batchLog) {
        if (!batchLog) return "No active batch log.";
        let md = `# Unified Architecture Simulation Audit & Health Report\n\n`;
        md += `* **Timestamp:** ${batchLog.timestamp}\n`;
        md += `* **Ecosystem Version:** ${batchLog.version}\n`;
        md += `* **Flows Audited:** ${batchLog.flowsSimulated.join(", ")}\n\n`;

        const report = generateArchitectureHealthReport(batchLog);
        if (report) {
            md += `## 1. Architecture Health Report\n\n`;

            md += `### Ecosystem Summary\n\n`;
            md += `* Flows Executed: **${report.summary.flowsExecuted}**\n`;
            md += `* Total Steps: **${report.summary.totalSteps}**\n`;
            md += `* Unique Nodes Activated: **${report.summary.uniqueNodesActivated}**\n`;
            md += `* Connections Traversed: **${report.summary.connectionsTraversed}**\n\n`;

            md += `### Most Active Nodes\n\n`;
            md += `* **Most Used Node:** ${report.mostActiveNode.title} (${report.mostActiveNode.count} activations)\n\n`;
            md += `| Rank | System Node | Activations |\n`;
            md += `|---|---|---|\n`;
            report.ranking.forEach((n, idx) => {
                md += `| ${idx + 1} | **${n.title}** | ${n.count} |\n`;
            });

            md += `\n### Least Active Nodes\n\n`;
            report.leastActiveNodes.forEach(n => {
                md += `* **${n.title}**: ${n.count} activations\n`;
            });

            md += `\n### Critical Dependencies\n\n`;
            report.criticalDeps.forEach(dep => {
                md += `* **${dep.title}** appeared in **${dep.percentage}%** of flows\n`;
            });

            md += `\n### Flow Complexity Analysis\n\n`;
            md += `| Flow Scenario | Steps | Nodes | Complexity |\n`;
            md += `|---|---|---|---|\n`;
            report.flowComplexity.forEach(fc => {
                md += `| ${fc.flow} | ${fc.stepCount} | ${fc.nodeCount} | **${fc.complexity}** |\n`;
            });

            md += `\n### Trust Boundary Analysis\n\n`;
            md += `* Secure Backend zone entered by **${report.trustBoundary.flowsCrossingBoundary} / ${report.summary.flowsExecuted}** flows.\n`;
            md += `* Total Boundary Entries: **${report.trustBoundary.boundaryEntries}**\n`;
            md += `* Total Boundary Exits: **${report.trustBoundary.boundaryExits}**\n\n`;

            md += `### Database Impact Analysis\n\n`;
            md += `* Total Database Operations: **${report.databaseImpact.dbTouchCount}** (Reads: **${report.databaseImpact.dbReads}**, Writes: **${report.databaseImpact.dbWrites}**)\n\n`;
            md += `| Flow Scenario | Database Queries |\n`;
            md += `|---|---|\n`;
            report.databaseImpact.dbFlowActivity.forEach(act => {
                md += `| ${act.flow} | ${act.count} |\n`;
            });

            md += `\n### Analytics Coverage\n\n`;
            md += `* **${report.analyticsCoverage.flowsFeedingAnalytics} of ${report.summary.flowsExecuted}** flows feed Analytics Engine.\n`;
            if (report.analyticsCoverage.bypassingFlows.length > 0) {
                md += `* **Bypassed by:** ${report.analyticsCoverage.bypassingFlows.join(", ")}\n`;
            }

            md += `\n### Architecture Observations\n\n`;
            report.observations.forEach(obs => {
                md += `* ${obs}\n`;
            });

            md += `\n### Architecture Risk Indicators\n\n`;
            if (report.risks.length > 0) {
                report.risks.forEach(risk => {
                    md += `* **[${risk.severity.toUpperCase()}] ${risk.title}**: ${risk.desc}\n`;
                });
            } else {
                md += `* No risks detected.\n`;
            }
            md += `\n---\n\n`;
        }

        md += `## 2. Unified Audit Trail\n\n`;
        md += `| Seq | Flow Scenario | System Node | Action / Label | Data / Payload |\n`;
        md += `|---|---|---|---|---|\n`;
        batchLog.steps.forEach(s => {
            md += `| ${s.seq} | **${s.flow}** | **${s.node}** | ${s.action} | \`${s.data}\` |\n`;
        });
        md += `\n\n### Detailed Step Audit Trail\n\n`;
        batchLog.steps.forEach(s => {
            md += `#### Step ${s.seq}: [${s.flow}] ${s.node}\n`;
            md += `* **Action:** ${s.action}\n`;
            md += `* **Description:** ${s.details}\n`;
            md += `* **Data Transferred:** \`${s.data}\`\n\n`;
        });
        return md;
    }

    // generateArchitectureHealthReport moved to js/reports/health-engine.js

    function updateArchitectureHealthUI() {
        if (!healthReportContent) return;

        if (!unifiedBatchLog) {
            healthReportContent.innerHTML = `
                <p style="font-size:11px; color:var(--text-secondary); line-height:1.5; font-style: italic;">
                    Run a sequential simulation audit through the Flow Checklist tab to compile and view the Architecture Health Report.
                </p>
            `;
            return;
        }

        const report = generateArchitectureHealthReport(unifiedBatchLog);
        if (!report) return;

        let html = `
        <style>
            .health-report-container {
                display: flex;
                flex-direction: column;
                gap: 16px;
                color: var(--text-primary);
                font-size: 11px;
                line-height: 1.4;
            }
            .health-section-title {
                font-size: 12px;
                font-weight: 700;
                color: #fff;
                border-left: 3px solid hsl(220, 85%, 60%);
                padding-left: 8px;
                margin-top: 8px;
                margin-bottom: 8px;
            }
            .health-grid-2x3 {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
            }
            .health-metric-card {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 8px;
                padding: 10px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
            }
            .health-metric-val {
                font-size: 18px;
                font-weight: 800;
                color: hsl(220, 95%, 70%);
                line-height: 1.2;
            }
            .health-metric-label {
                font-size: 9px;
                color: var(--text-secondary);
                margin-top: 2px;
            }
            .health-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 0;
                margin: 0;
            }
            .health-list-item {
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.04);
                border-radius: 6px;
                padding: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .health-badge {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
            }
            .badge-simple {
                background: rgba(46, 204, 113, 0.15);
                color: #2ecc71;
                border: 1px solid rgba(46, 204, 113, 0.3);
            }
            .badge-moderate {
                background: rgba(52, 152, 219, 0.15);
                color: #3498db;
                border: 1px solid rgba(52, 152, 219, 0.3);
            }
            .badge-complex {
                background: rgba(155, 89, 182, 0.15);
                color: #9b59b6;
                border: 1px solid rgba(155, 89, 182, 0.3);
            }
            .badge-critical {
                background: rgba(231, 76, 60, 0.15);
                color: #e74c3c;
                border: 1px solid rgba(231, 76, 60, 0.3);
            }
            .badge-warning {
                background: rgba(241, 196, 15, 0.15);
                color: #f1c40f;
                border: 1px solid rgba(241, 196, 15, 0.3);
            }
            .badge-info {
                background: rgba(52, 152, 219, 0.15);
                color: #3498db;
                border: 1px solid rgba(52, 152, 219, 0.3);
            }
            .health-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 4px;
                font-size: 11px;
            }
            .health-table th, .health-table td {
                padding: 6px;
                text-align: left;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }
            .health-table th {
                font-weight: 600;
                color: var(--text-secondary);
            }
            .health-observation-item {
                display: flex;
                gap: 8px;
                align-items: flex-start;
                background: rgba(255, 255, 255, 0.02);
                border-radius: 6px;
                padding: 8px;
                border-left: 3px solid hsl(145, 65%, 52%);
            }
            .health-risk-item {
                display: flex;
                flex-direction: column;
                gap: 4px;
                background: rgba(255, 255, 255, 0.02);
                border-radius: 6px;
                padding: 8px;
                border: 1px solid rgba(255, 255, 255, 0.04);
            }
            .health-risk-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .health-risk-title {
                font-weight: 700;
                color: #fff;
            }
            .health-risk-desc {
                font-size: 10px;
                color: var(--text-secondary);
                line-height: 1.3;
            }
        </style>
        <div class="health-report-container">
            <!-- 1. Ecosystem Summary -->
            <div>
                <div class="health-section-title">1. Ecosystem Summary</div>
                <div class="health-grid-2x3">
                    <div class="health-metric-card">
                        <div class="health-metric-val">${report.summary.flowsExecuted}</div>
                        <div class="health-metric-label">Flows Executed</div>
                    </div>
                    <div class="health-metric-card">
                        <div class="health-metric-val">${report.summary.totalSteps}</div>
                        <div class="health-metric-label">Total Steps</div>
                    </div>
                    <div class="health-metric-card">
                        <div class="health-metric-val">${report.summary.uniqueNodesActivated}</div>
                        <div class="health-metric-label">Unique Nodes</div>
                    </div>
                    <div class="health-metric-card">
                        <div class="health-metric-val">${report.summary.connectionsTraversed}</div>
                        <div class="health-metric-label">Connections</div>
                    </div>
                    <div class="health-metric-card" style="grid-column: span 2;">
                        <div class="health-metric-val" style="font-size: 11px; font-family: monospace; color: var(--text-primary);">
                            ${new Date(report.summary.timestamp).toLocaleString()}
                        </div>
                        <div class="health-metric-label">Execution Timestamp</div>
                    </div>
                </div>
            </div>

            <!-- 2. Most Active Nodes -->
            <div>
                <div class="health-section-title">2. Most Active Nodes</div>
                <div class="health-metric-card" style="margin-bottom: 8px; border-color: rgba(180, 130, 255, 0.3); background: rgba(180, 130, 255, 0.03);">
                    <div class="health-metric-label" style="text-transform: uppercase; font-weight: 700; color: hsl(280, 85%, 75%);">⭐ Most Used Node</div>
                    <div class="health-metric-val" style="color: #fff; font-size: 14px; margin-top: 2px;">${report.mostActiveNode.title}</div>
                    <div class="health-metric-label">${report.mostActiveNode.count} activations</div>
                </div>
                <div class="health-list">
        `;

        report.ranking.forEach((n, idx) => {
            const pct = Math.round((n.count / report.summary.totalSteps) * 100);
            html += `
                <div class="health-list-item" style="flex-direction: column; align-items: stretch; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; font-weight: 500;">
                        <span>#${idx + 1} ${n.title}</span>
                        <span style="color: hsl(220, 95%, 70%);">${n.count} acts (${pct}%)</span>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); height: 4px; border-radius: 2px; overflow: hidden;">
                        <div style="background: hsl(220, 85%, 60%); width: ${pct}%; height: 100%;"></div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>

            <!-- 3. Least Active Nodes -->
            <div>
                <div class="health-section-title">3. Least Active Nodes</div>
                <div class="health-list">
        `;

        if (report.leastActiveNodes.length === 0) {
            html += `<p style="font-style:italic; color:var(--text-muted);">All nodes were actively used.</p>`;
        } else {
            report.leastActiveNodes.forEach(n => {
                const label = n.count === 0 ? "Dead / Unused" : "Rarely Used";
                const badgeClass = n.count === 0 ? "badge-critical" : "badge-warning";
                html += `
                    <div class="health-list-item">
                        <span>${n.title}</span>
                        <div style="display:flex; gap: 8px; align-items:center;">
                            <span class="health-badge ${badgeClass}">${label}</span>
                            <span style="font-family: monospace; color: var(--text-secondary);">${n.count} acts</span>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>

            <!-- 4. Critical Dependencies -->
            <div>
                <div class="health-section-title">4. Critical Dependencies</div>
                <div class="health-list">
        `;

        if (report.criticalDeps.length === 0) {
            html += `<p style="font-style:italic; color:var(--text-muted);">No critical dependencies found.</p>`;
        } else {
            report.criticalDeps.forEach(dep => {
                html += `
                    <div class="health-list-item">
                        <span style="font-weight: 600;">🔑 ${dep.title}</span>
                        <div style="display:flex; gap: 8px; align-items:center;">
                            <span class="health-badge badge-info">Critical Platform Dependency</span>
                            <span style="color: hsl(220, 95%, 70%); font-weight:700;">${dep.percentage}% of flows</span>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>

            <!-- 5. Flow Complexity Analysis -->
            <div>
                <div class="health-section-title">5. Flow Complexity Analysis</div>
                <table class="health-table">
                    <thead>
                        <tr>
                            <th>Flow Scenario</th>
                            <th style="text-align: center;">Steps</th>
                            <th style="text-align: center;">Nodes</th>
                            <th style="text-align: center;">Deps</th>
                            <th style="text-align: right;">Rating</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        report.flowComplexity.forEach(fc => {
            const badgeClass = fc.complexity === "Simple" ? "badge-simple" : (fc.complexity === "Moderate" ? "badge-moderate" : "badge-complex");
            html += `
                <tr>
                    <td style="font-weight: 500;">${fc.flow}</td>
                    <td style="text-align: center; font-family: monospace;">${fc.stepCount}</td>
                    <td style="text-align: center; font-family: monospace;">${fc.nodeCount}</td>
                    <td style="text-align: center; font-family: monospace;">${fc.dependencyCount}</td>
                    <td style="text-align: right;">
                        <span class="health-badge ${badgeClass}">${fc.complexity}</span>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>

            <!-- 6. Trust Boundary Analysis -->
            <div>
                <div class="health-section-title">6. Trust Boundary Analysis</div>
                <div class="health-metric-card" style="margin-bottom: 8px; border-color: rgba(46, 204, 113, 0.3); background: rgba(46, 204, 113, 0.03);">
                    <div class="health-metric-label" style="text-transform: uppercase; font-weight: 700; color: #2ecc71;">🛡️ Trust zone consistent</div>
                    <div class="health-metric-val" style="color: #fff; font-size: 14px; margin-top: 2px;">
                        ${report.trustBoundary.flowsCrossingBoundary} / ${report.summary.flowsExecuted} Flows
                    </div>
                    <div class="health-metric-label">entered secure zone</div>
                </div>
                <div class="health-list">
                    <div class="health-list-item">
                        <span>Zone Boundaries Crossed</span>
                        <div style="display: flex; gap: 12px; font-weight: 600;">
                            <span style="color:#2ecc71;">📥 ${report.trustBoundary.boundaryEntries} Entries</span>
                            <span style="color:hsl(32,85%,58%);">📤 ${report.trustBoundary.boundaryExits} Exits</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 7. Database Impact Analysis -->
            <div>
                <div class="health-section-title">7. Database Impact Analysis</div>
                <div class="health-metric-card" style="margin-bottom: 8px; border-color: rgba(80, 220, 180, 0.3); background: rgba(80, 220, 180, 0.03);">
                    <div class="health-metric-label" style="text-transform: uppercase; font-weight: 700; color: #50dcb4;">🗄️ Database Operations</div>
                    <div class="health-metric-val" style="color: #fff; font-size: 14px; margin-top: 2px;">
                        ${report.databaseImpact.dbTouchCount} Total Operations
                    </div>
                    <div class="health-metric-label" style="color: var(--text-secondary);">
                        Reads: <b style="color:#fff;">${report.databaseImpact.dbReads}</b> | Writes: <b style="color:#fff;">${report.databaseImpact.dbWrites}</b>
                    </div>
                </div>
                <div class="health-list">
        `;

        report.databaseImpact.dbFlowActivity.forEach(act => {
            if (act.count > 0) {
                html += `
                    <div class="health-list-item">
                        <span>${act.flow}</span>
                        <span style="font-family: monospace; font-weight: 600; color:#50dcb4;">${act.count} DB ops</span>
                    </div>
                `;
            }
        });

        html += `
                </div>
            </div>

            <!-- 8. Analytics Coverage -->
            <div>
                <div class="health-section-title">8. Analytics Coverage</div>
                <div class="health-metric-card" style="margin-bottom: 8px; border-color: rgba(241, 196, 15, 0.3); background: rgba(241, 196, 15, 0.03);">
                    <div class="health-metric-label" style="text-transform: uppercase; font-weight: 700; color: #f1c40f;">📊 Telemetry Feeds</div>
                    <div class="health-metric-val" style="color: #fff; font-size: 14px; margin-top: 2px;">
                        ${report.analyticsCoverage.flowsFeedingAnalytics} / ${report.summary.flowsExecuted} Flows
                    </div>
                    <div class="health-metric-label">generate event telemetry</div>
                </div>
        `;

        if (report.analyticsCoverage.bypassingFlows.length > 0) {
            html += `
                <div style="background: rgba(231, 76, 60, 0.05); border: 1px solid rgba(231, 76, 60, 0.15); border-radius: 6px; padding: 8px; font-size: 10px; color: #e74c3c;">
                    <b style="display:block; margin-bottom: 4px;">⚠️ Flows Bypassing Telemetry:</b>
                    <ul style="padding-left: 14px; margin: 0;">
            `;
            report.analyticsCoverage.bypassingFlows.forEach(bf => {
                html += `<li>${bf}</li>`;
            });
            html += `
                    </ul>
                </div>
            `;
        } else {
            html += `
                <div style="background: rgba(46, 204, 113, 0.05); border: 1px solid rgba(46, 204, 113, 0.15); border-radius: 6px; padding: 8px; font-size: 10px; color: #2ecc71; font-weight:600; text-align:center;">
                    ✅ 100% telemetry coverage achieved.
                </div>
            `;
        }

        html += `
            </div>

            <!-- 9. Architecture Observations -->
            <div>
                <div class="health-section-title">9. Architecture Observations</div>
                <div class="health-list" style="gap: 8px;">
        `;

        report.observations.forEach(obs => {
            html += `
                <div class="health-observation-item">
                    <span style="font-size: 12px;">💡</span>
                    <span>${obs}</span>
                </div>
            `;
        });

        html += `
                </div>
            </div>

            <!-- 10. Architecture Risk Indicators -->
            <div>
                <div class="health-section-title">10. Architecture Risk Indicators</div>
                <div class="health-list" style="gap: 8px;">
        `;

        if (report.risks.length === 0) {
            html += `
                <div style="background: rgba(46, 204, 113, 0.05); border: 1px solid rgba(46, 204, 113, 0.15); border-radius: 6px; padding: 10px; font-size: 10px; color: #2ecc71; font-weight:600; text-align:center;">
                    🎉 No risk indicators triggered for the current batch run.
                </div>
            `;
        } else {
            report.risks.forEach(risk => {
                const badgeClass = risk.severity === "critical" ? "badge-critical" : "badge-warning";
                html += `
                    <div class="health-risk-item">
                        <div class="health-risk-header">
                            <span class="health-risk-title">${risk.title}</span>
                            <span class="health-badge ${badgeClass}">${risk.severity}</span>
                        </div>
                        <div class="health-risk-desc">${risk.desc}</div>
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>
        </div>
        `;

    }

    // ─── Architecture History & IndexedDB ───────────────────────
    let db = null;
    export let localHistoryCache = { auditRuns: [], architectureSnapshots: [], healthHistory: [] };
    let selectedRunsForComparison = [];

    function initDB() {
        return new Promise((resolve, reject) => {
            if (db) {
                resolve(db);
                return;
            }
            const request = indexedDB.open("ArchitectureWorkbench", 1);
            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains("auditRuns")) {
                    const store = database.createObjectStore("auditRuns", { keyPath: "id" });
                    store.createIndex("timestamp", "timestamp", { unique: false });
                    store.createIndex("architectureVersion", "architectureVersion", { unique: false });
                }
                if (!database.objectStoreNames.contains("architectureSnapshots")) {
                    database.createObjectStore("architectureSnapshots", { keyPath: "id" });
                }
                if (!database.objectStoreNames.contains("healthHistory")) {
                    database.createObjectStore("healthHistory", { keyPath: "id" });
                }
            };
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            request.onerror = (e) => {
                console.error("IndexedDB error:", e);
                reject(e);
            };
        });
    }

    function reloadHistoryCache() {
        return initDB().then(database => {
            return new Promise((resolve, reject) => {
                const tx = database.transaction(["auditRuns", "architectureSnapshots", "healthHistory"], "readonly");
                const runsStore = tx.objectStore("auditRuns");
                const snapsStore = tx.objectStore("architectureSnapshots");
                const healthStore = tx.objectStore("healthHistory");

                const runsReq = runsStore.getAll();
                const snapsReq = snapsStore.getAll();
                const healthReq = healthStore.getAll();

                tx.oncomplete = () => {
                    localHistoryCache.auditRuns = runsReq.result || [];
                    localHistoryCache.auditRuns.sort((a, b) => a.timestamp - b.timestamp);

                    localHistoryCache.architectureSnapshots = snapsReq.result || [];
                    localHistoryCache.architectureSnapshots.sort((a, b) => a.timestamp - b.timestamp);

                    localHistoryCache.healthHistory = healthReq.result || [];
                    localHistoryCache.healthHistory.sort((a, b) => a.timestamp - b.timestamp);

                    resolve(localHistoryCache);
                };
                tx.onerror = (err) => {
                    console.error("Error reloading history cache:", err);
                    reject(err);
                };
            });
        });
    }

    function saveAuditRun(batchLog) {
        if (!batchLog) return Promise.resolve();

        return initDB().then(database => {
            const timestamp = Date.now();
            const runId = "run_" + timestamp;
            const report = generateArchitectureHealthReport(batchLog);
            const pack = generateKnowledgePackJSON();
            const version = batchLog.version || "1.0";

            const projId = currentProject ? currentProject.id : "trace-sample";

            const auditRun = {
                id: runId,
                projectId: projId,
                timestamp: timestamp,
                architectureVersion: version,
                flowsExecuted: batchLog.flowsSimulated,
                unifiedAuditLog: batchLog,
                architectureHealthReport: report,
                knowledgePack: pack
            };

            const snapshot = {
                id: "snap_" + timestamp,
                projectId: projId,
                timestamp: timestamp,
                architectureVersion: version,
                nodeCount: NODES.length,
                connectionCount: CONNECTIONS.length,
                flowCount: FLOWS.length,
                snapshotMetadata: {
                    flowsSimulated: batchLog.flowsSimulated
                }
            };

            const healthHist = {
                id: "health_" + timestamp,
                projectId: projId,
                timestamp: timestamp,
                architectureVersion: version,
                totalFlows: report.summary.flowsExecuted,
                totalSteps: report.summary.totalSteps,
                mostActiveNode: report.mostActiveNode,
                leastActiveNode: report.leastActiveNodes[0] || { title: "N/A", count: 0 },
                criticalDependencies: report.criticalDeps,
                unusedComponents: report.leastActiveNodes.filter(n => n.count === 0),
                unusedConnections: report.risks.filter(r => r.title === "Unused Connection"),
                highCouplingCount: report.risks.filter(r => r.title === "High Coupling").length,
                spofCount: report.risks.filter(r => r.title === "Single Point of Failure").length,
                databaseDependencyScore: calculateDatabaseDependencyScore(report)
            };

            return new Promise((resolve, reject) => {
                const tx = database.transaction(["auditRuns", "architectureSnapshots", "healthHistory"], "readwrite");
                tx.objectStore("auditRuns").put(auditRun);
                tx.objectStore("architectureSnapshots").put(snapshot);
                tx.objectStore("healthHistory").put(healthHist);

                tx.oncomplete = () => {
                    console.log("Successfully saved audit run history.");
                    reloadHistoryCache().then(() => resolve(runId));
                };
                tx.onerror = (err) => {
                    console.error("Failed to save history transaction:", err);
                    reject(err);
                };
            });
        });
    }

    function deleteAuditRun(runId) {
        return initDB().then(database => {
            return new Promise((resolve, reject) => {
                const tx = database.transaction(["auditRuns", "architectureSnapshots", "healthHistory"], "readwrite");
                const timestampSuffix = runId.split("_")[1];

                tx.objectStore("auditRuns").delete(runId);
                tx.objectStore("architectureSnapshots").delete("snap_" + timestampSuffix);
                tx.objectStore("healthHistory").delete("health_" + timestampSuffix);

                tx.oncomplete = () => {
                    console.log(`Deleted run ${runId} from history DB.`);
                    reloadHistoryCache().then(resolve);
                };
                tx.onerror = (err) => {
                    console.error("Failed to delete history run:", err);
                    reject(err);
                };
            });
        });
    }

    function clearProjectHistoryFromDB(projectId) {
        return initDB().then(database => {
            return new Promise((resolve, reject) => {
                const tx = database.transaction(["auditRuns", "architectureSnapshots", "healthHistory"], "readwrite");
                const stores = ["auditRuns", "architectureSnapshots", "healthHistory"];
                
                stores.forEach(storeName => {
                    const store = tx.objectStore(storeName);
                    const req = store.openCursor();
                    req.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            if (cursor.value.projectId === projectId) {
                                cursor.delete();
                            }
                            cursor.continue();
                        }
                    };
                });
                
                tx.oncomplete = () => {
                    console.log(`Cleaned up history for project: ${projectId}`);
                    reloadHistoryCache().then(resolve);
                };
                tx.onerror = (err) => {
                    console.error("Failed to cleanup project history:", err);
                    reject(err);
                };
            });
        });
    }

    // calculateArchitectureQualityScore and calculateDatabaseDependencyScore moved to js/metrics.js

    function updateArchitectureHistoryUI() {
        if (!historyReportContent) return;

        reloadHistoryCache().then(() => {
            const currentProjId = currentProject ? currentProject.id : "trace-sample";
            const runs = localHistoryCache.auditRuns.filter(r => !r.projectId || r.projectId === currentProjId);
            const healths = localHistoryCache.healthHistory.filter(h => !h.projectId || h.projectId === currentProjId);
            const snaps = localHistoryCache.architectureSnapshots.filter(s => !s.projectId || s.projectId === currentProjId);

            if (runs.length === 0) {
                historyReportContent.innerHTML = `
                    <p style="font-size:11px; color:var(--text-secondary); line-height:1.5; font-style: italic;">
                        No audit history recorded yet. Run a sequential simulation audit in the Flow Checklist tab to automatically save your first run.
                    </p>
                `;
                return;
            }

            const sortedRuns = [...runs].reverse();

            let html = `
            <style>
                .history-container {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    color: var(--text-primary);
                    font-size: 11px;
                    line-height: 1.4;
                }
                .history-header {
                    font-size: 12px;
                    font-weight: 700;
                    color: #fff;
                    border-left: 3px solid hsl(270, 70%, 60%);
                    padding-left: 8px;
                    margin-top: 8px;
                    margin-bottom: 4px;
                }
                .history-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 10px;
                }
                .history-table th, .history-table td {
                    padding: 6px;
                    text-align: left;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                }
                .history-table th {
                    color: var(--text-secondary);
                    font-weight: 600;
                }
                .action-btn-small {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                    padding: 2px 6px;
                    color: #fff;
                    font-size: 9px;
                    cursor: pointer;
                    margin-right: 4px;
                }
                .action-btn-small:hover {
                    background: rgba(255, 255, 255, 0.15);
                }
                .delete-btn-small {
                    background: rgba(231, 76, 60, 0.1);
                    border: 1px solid rgba(231, 76, 60, 0.2);
                    color: #e74c3c;
                }
                .delete-btn-small:hover {
                    background: rgba(231, 76, 60, 0.25);
                }
                .compare-box {
                    background: rgba(180, 130, 255, 0.05);
                    border: 1px solid rgba(180, 130, 255, 0.15);
                    border-radius: 8px;
                    padding: 10px;
                }
                .compare-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 8px;
                    margin-top: 6px;
                }
                .compare-card {
                    background: rgba(255, 255, 255, 0.02);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 6px;
                    padding: 6px;
                    text-align: center;
                }
                .compare-val {
                    font-size: 14px;
                    font-weight: 800;
                }
                .compare-lbl {
                    font-size: 9px;
                    color: var(--text-secondary);
                }
                .compare-pct {
                    font-size: 9px;
                    font-weight: 700;
                    margin-top: 2px;
                }
                .timeline-flow {
                    position: relative;
                    padding-left: 16px;
                    margin-left: 8px;
                    border-left: 1px dashed rgba(255, 255, 255, 0.15);
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .timeline-node {
                    position: relative;
                }
                .timeline-node::before {
                    content: '';
                    position: absolute;
                    left: -21px;
                    top: 4px;
                    width: 9px;
                    height: 9px;
                    border-radius: 50%;
                    background: hsl(270, 70%, 60%);
                    border: 2px solid var(--bg-void);
                }
            </style>
            <div class="history-container">
                <!-- Runs List -->
                <div>
                    <div class="history-header">1. Architecture History Records</div>
                    <table class="history-table">
                        <thead>
                            <tr>
                                <th style="width: 25px;">Select</th>
                                <th>Audit Run</th>
                                <th>Timestamp</th>
                                <th style="text-align: center;">Flows</th>
                                <th style="text-align: center;">Steps</th>
                                <th style="text-align: center;">Score</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            sortedRuns.forEach((run, index) => {
                const dateStr = new Date(run.timestamp).toLocaleString();
                const runScore = calculateArchitectureQualityScore(run.architectureHealthReport);
                const isChecked = selectedRunsForComparison.includes(run.id) ? "checked" : "";
                
                let badgeStyle = "background: rgba(231,76,60,0.15); color: #e74c3c; border: 1px solid rgba(231,76,60,0.3);";
                if (runScore >= 80) {
                    badgeStyle = "background: rgba(46,204,113,0.15); color: #2ecc71; border: 1px solid rgba(46,204,113,0.3);";
                } else if (runScore >= 50) {
                    badgeStyle = "background: rgba(241,196,15,0.15); color: #f1c40f; border: 1px solid rgba(241,196,15,0.3);";
                }

                html += `
                    <tr data-run-id="${run.id}">
                        <td style="text-align: center;">
                            <input type="checkbox" class="compare-checkbox" value="${run.id}" ${isChecked}>
                        </td>
                        <td style="font-weight: 600; color: #fff;">Audit #${runs.length - index} (v${run.architectureVersion})</td>
                        <td>${dateStr}</td>
                        <td style="text-align: center; font-family: monospace;">${run.flowsExecuted.length}</td>
                        <td style="text-align: center; font-family: monospace;">${run.architectureHealthReport.summary.totalSteps}</td>
                        <td style="text-align: center;">
                            <span class="health-badge" style="${badgeStyle}">${runScore}</span>
                        </td>
                        <td style="text-align: right; white-space: nowrap;">
                            <button class="action-btn-small btn-view-run" data-id="${run.id}" title="Load this simulation data to view full report">👁️ View</button>
                            <button class="action-btn-small btn-export-run" data-id="${run.id}">📤 Export</button>
                            <button class="action-btn-small delete-btn-small btn-delete-run" data-id="${run.id}">🗑️ Delete</button>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                    <div style="font-size: 9px; color: var(--text-secondary); margin-top: 4px; font-style: italic;">
                        * Select exactly 2 checkboxes to trigger Audit Comparison Mode.
                    </div>
                </div>
            `;

            // Comparison mode
            if (selectedRunsForComparison.length === 2) {
                const runA = runs.find(r => r.id === selectedRunsForComparison[0]);
                const runB = runs.find(r => r.id === selectedRunsForComparison[1]);

                if (runA && runB) {
                    const [olderRun, newerRun] = runA.timestamp < runB.timestamp ? [runA, runB] : [runB, runA];
                    
                    const scoreA = calculateArchitectureQualityScore(olderRun.architectureHealthReport);
                    const scoreB = calculateArchitectureQualityScore(newerRun.architectureHealthReport);
                    const spofA = olderRun.architectureHealthReport.risks.filter(r => r.title === "Single Point of Failure").length;
                    const spofB = newerRun.architectureHealthReport.risks.filter(r => r.title === "Single Point of Failure").length;
                    const couplingA = olderRun.architectureHealthReport.risks.filter(r => r.title === "High Coupling").length;
                    const couplingB = newerRun.architectureHealthReport.risks.filter(r => r.title === "High Coupling").length;
                    const unusedA = olderRun.architectureHealthReport.leastActiveNodes.filter(n => n.count === 0).length;
                    const unusedB = newerRun.architectureHealthReport.leastActiveNodes.filter(n => n.count === 0).length;
                    const dbA = olderRun.architectureHealthReport.databaseImpact.dbTouchCount;
                    const dbB = newerRun.architectureHealthReport.databaseImpact.dbTouchCount;

                    const compSPOF = formatComparisonMetric(spofA, spofB, true);
                    const compCoupling = formatComparisonMetric(couplingA, couplingB, true);
                    const compUnused = formatComparisonMetric(unusedA, unusedB, true);
                    const compScore = formatComparisonMetric(scoreA, scoreB, false);
                    const compDb = formatComparisonMetric(dbA, dbB, true);

                    html += `
                        <div class="compare-box">
                            <div style="font-weight: 700; color: hsl(280, 85%, 75%); display: flex; align-items:center; gap: 4px;">
                                <span>⚖️ Audit Comparison Mode</span>
                                <span style="font-size: 9px; font-weight: normal; color: var(--text-secondary);">
                                    (${new Date(olderRun.timestamp).toLocaleDateString()} vs ${new Date(newerRun.timestamp).toLocaleDateString()})
                                </span>
                            </div>
                            <div class="compare-grid">
                                <div class="compare-card">
                                    <div class="compare-lbl">Architecture Score</div>
                                    <div class="compare-val" style="color: ${scoreB >= scoreA ? '#2ecc71' : '#e74c3c'};">${scoreA} → ${scoreB}</div>
                                    <div class="compare-pct" style="color: ${scoreB >= scoreA ? '#2ecc71' : '#e74c3c'};">${compScore}</div>
                                </div>
                                <div class="compare-card">
                                    <div class="compare-lbl">SPOF Count</div>
                                    <div class="compare-val" style="color: ${spofB <= spofA ? '#2ecc71' : '#e74c3c'};">${spofA} → ${spofB}</div>
                                    <div class="compare-pct" style="color: ${spofB <= spofA ? '#2ecc71' : '#e74c3c'};">${compSPOF}</div>
                                </div>
                                <div class="compare-card">
                                    <div class="compare-lbl">High Coupling</div>
                                    <div class="compare-val" style="color: ${couplingB <= couplingA ? '#2ecc71' : '#e74c3c'};">${couplingA} → ${couplingB}</div>
                                    <div class="compare-pct" style="color: ${couplingB <= couplingA ? '#2ecc71' : '#e74c3c'};">${compCoupling}</div>
                                </div>
                                <div class="compare-card">
                                    <div class="compare-lbl">Unused Components</div>
                                    <div class="compare-val" style="color: ${unusedB <= unusedA ? '#2ecc71' : '#e74c3c'};">${unusedA} → ${unusedB}</div>
                                    <div class="compare-pct" style="color: ${unusedB <= unusedA ? '#2ecc71' : '#e74c3c'};">${compUnused}</div>
                                </div>
                                <div class="compare-card" style="grid-column: span 2;">
                                    <div class="compare-lbl">Database Operations</div>
                                    <div class="compare-val" style="color: ${dbB <= dbA ? '#2ecc71' : '#e74c3c'};">${dbA} → ${dbB} touches</div>
                                    <div class="compare-pct" style="color: ${dbB <= dbA ? '#2ecc71' : '#e74c3c'};">${compDb}</div>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }

            // Timeline
            html += `
                <div>
                    <div class="history-header">2. Architecture Evolution Timeline</div>
                    <div class="timeline-flow" style="margin-top: 10px;">
            `;

            snaps.forEach((snap, idx) => {
                const dateStr = new Date(snap.timestamp).toLocaleDateString();
                const healthRec = healths.find(h => h.id === "health_" + snap.id.split("_")[1]);
                const matchingRun = runs.find(r => r.id === "run_" + snap.id.split("_")[1]);
                const scoreVal = matchingRun ? calculateArchitectureQualityScore(matchingRun.architectureHealthReport) : "N/A";

                html += `
                    <div class="timeline-node">
                        <div style="font-weight: 700; color: #fff;">Audit #${idx + 1} (${dateStr})</div>
                        <div style="color: var(--text-secondary); margin-top: 2px;">
                            Nodes: <b style="color: #fff;">${snap.nodeCount}</b> | 
                            Connections: <b style="color: #fff;">${snap.connectionCount}</b> | 
                            SPOFs: <b style="color: #fff;">${healthRec ? healthRec.spofCount : "N/A"}</b> | 
                            Score: <b style="color: hsl(220, 95%, 70%);">${scoreVal}/100</b>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            </div>
            `;

            historyReportContent.innerHTML = html;

            // Wire up event listeners
            historyReportContent.querySelectorAll(".compare-checkbox").forEach(cb => {
                cb.addEventListener("change", (e) => {
                    const val = e.target.value;
                    if (e.target.checked) {
                        selectedRunsForComparison.push(val);
                        if (selectedRunsForComparison.length > 2) {
                            selectedRunsForComparison.shift();
                        }
                    } else {
                        selectedRunsForComparison = selectedRunsForComparison.filter(id => id !== val);
                    }
                    updateArchitectureHistoryUI();
                });
            });

            historyReportContent.querySelectorAll(".btn-view-run").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    const id = e.target.getAttribute("data-id");
                    const run = runs.find(r => r.id === id);
                    if (run) {
                        unifiedBatchLog = run.unifiedAuditLog;
                        updateArchitectureHealthUI();
                        updateExecutionLogUI();
                        switchTab("health");
                        showToast(`Loaded Audit run (${new Date(run.timestamp).toLocaleDateString()}) into memory!`);
                    }
                });
            });

            historyReportContent.querySelectorAll(".btn-export-run").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    const id = e.target.getAttribute("data-id");
                    const run = runs.find(r => r.id === id);
                    if (run) {
                        const json = JSON.stringify(run, null, 2);
                        downloadFile(json, `archbench_audit_run_${id}_${Date.now()}.json`, "application/json");
                        showToast("JSON audit file exported successfully.");
                    }
                });
            });

            historyReportContent.querySelectorAll(".btn-delete-run").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    const id = e.target.getAttribute("data-id");
                    if (confirm("Are you sure you want to permanently delete this audit run from local storage?")) {
                        deleteAuditRun(id).then(() => {
                            selectedRunsForComparison = selectedRunsForComparison.filter(val => val !== id);
                            updateArchitectureHistoryUI();
                            showToast("Audit run deleted successfully.");
                        });
                    }
                });
            });
        }).catch(err => {
            console.error("UI history update failed:", err);
            historyReportContent.innerHTML = `<p style="color: #e74c3c;">Failed to load architecture history: ${err.message}</p>`;
        });
    }

    function formatComparisonMetric(valA, valB, lowerIsBetter) {
        if (valA === valB) return "No Change";
        if (lowerIsBetter) {
            if (valB === 0 && valA > 0) return "Resolved";
            const diff = valB - valA;
            const pct = Math.round((diff / valA) * 100);
            if (diff < 0) return `Improvement: ${pct}%`;
            return `Regression: +${pct}%`;
        } else {
            const diff = valB - valA;
            const pct = Math.round((diff / valA) * 100);
            if (diff > 0) return `Improvement: +${pct}%`;
            return `Regression: ${pct}%`;
        }
    }

    // ─── PROJECT SYSTEM ──────────────────────────────────────────
    export const DEFAULT_PROJECT_ID = "trace-sample";

    const SKELETON_TEMPLATE = {
        nodes: [
            {
                id: "node1",
                category: "Entry Point",
                title: "My Web Client",
                icon: "💻",
                color: "hsl(210,85%,62%)",
                x: 300, y: 250,
                desc: "User-facing dashboard application.",
                sections: [
                    { label: "Tech Stack", items: ["HTML", "Vanilla JS"] }
                ]
            },
            {
                id: "node2",
                category: "Service",
                title: "My Backend API",
                icon: "⚙️",
                color: "hsl(200,80%,58%)",
                x: 750, y: 250,
                desc: "Processes user requests.",
                sections: [
                    { label: "Features", items: ["Query database", "Format output"] }
                ]
            }
        ],
        connections: [
            ["node1", "node2", "JSON over HTTPS", "request"]
        ],
        flows: [
            {
                id: "query_flow",
                title: "Fetch Data Flow",
                subtitle: "Retrieve data from backend service",
                steps: [
                    {
                        node: "node1",
                        label: "Send Request",
                        detail: "Browser triggers AJAX query to API.",
                        data: '{"query": "products"}'
                    },
                    {
                        node: "node2",
                        label: "Fetch Database",
                        detail: "API queries relational store and formats response.",
                        data: '{"status": 200, "count": 12}'
                    }
                ]
            }
        ]
    };

    export function getCustomProjects() {
        try {
            const data = localStorage.getItem("archbench_projects");
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error("Failed to load projects from localStorage", e);
            return [];
        }
    }

    export function saveCustomProjects(projects) {
        try {
            localStorage.setItem("archbench_projects", JSON.stringify(projects));
        } catch (e) {
            console.error("Failed to save projects to localStorage", e);
            showToast("Failed to save project locally. Storage may be full.");
        }
    }

    // ─── Markdown Parser & Generator (Sprint 2) ──────────────────

    // parseMarkdownToProject, exportProjectToMarkdown, and validateProjectData moved to js/parser.js

    function getAvailableProjects() {
        const custom = getCustomProjects();
        const list = [];
        
        // Always include built-in TRACE project as default
        const builtIn = { ...project };
        if (!builtIn.id) builtIn.id = DEFAULT_PROJECT_ID;
        list.push(builtIn);
        
        custom.forEach(p => {
            if (p.id !== DEFAULT_PROJECT_ID) {
                list.push(p);
            }
        });
        
        return list;
    }

    export function loadProject(projectToLoad) {
        // Stop any active simulations
        stopAutoPlay();
        exitFlow();
        unifiedBatchLog = null;
        
        if (currentProjectTitle) {
            currentProjectTitle.textContent = projectToLoad.title || "Untitled Project";
        }
        
        // Save active project ID to localStorage
        localStorage.setItem("archbench_active_project_id", projectToLoad.id);
        currentProject = projectToLoad;
        
        // Re-assign NODES, CONNECTIONS, FLOWS
        NODES = projectToLoad.nodes || [];
        CONNECTIONS = projectToLoad.connections || [];
        FLOWS = projectToLoad.flows || [];
        
        // Re-resolve layers and boundaries
        LAYERS = projectToLoad.layers || DEFAULT_LAYERS;
        TRUST_BOUNDARY = projectToLoad.hasOwnProperty('trustBoundary') ? projectToLoad.trustBoundary : DEFAULT_TRUST_BOUNDARY;
        
        // Clear canvas dynamic layers and nodes
        canvas.querySelectorAll(".layer-zone").forEach(el => el.remove());
        canvas.querySelectorAll(".trust-boundary").forEach(el => el.remove());
        canvas.querySelectorAll(".graph-node").forEach(el => el.remove());
        
        // Render layers
        LAYERS.forEach(l => {
            const z = document.createElement("div");
            z.className = `layer-zone ${l.cls || 'services'}`;
            z.style.top = l.y + "px"; z.style.height = l.h + "px";
            z.innerHTML = `<span class="layer-label">${l.label}</span>`;
            canvas.appendChild(z);
        });
        
        // Render trust boundary
        if (TRUST_BOUNDARY) {
            trustEl = document.createElement("div");
            trustEl.className = "trust-boundary";
            trustEl.id = "trust-boundary";
            trustEl.style.left   = TRUST_BOUNDARY.x + "px";
            trustEl.style.top    = TRUST_BOUNDARY.y + "px";
            trustEl.style.width  = TRUST_BOUNDARY.w + "px";
            trustEl.style.height = TRUST_BOUNDARY.h + "px";
            trustEl.innerHTML = `
                <span class="trust-boundary-label">${TRUST_BOUNDARY.label}</span>
                <span class="trust-boundary-note">${TRUST_BOUNDARY.note || ""}</span>
            `;
            canvas.appendChild(trustEl);
        } else {
            trustEl = null;
        }
        
        // Re-render nodes
        Object.keys(nodeEls).forEach(k => delete nodeEls[k]);
        Object.keys(nodeData).forEach(k => delete nodeData[k]);
        NODES.forEach(buildNode);
        
        // Re-render flow simulator bar buttons
        if (flowBarBtns) {
            flowBarBtns.innerHTML = "";
            FLOWS.forEach(flow => {
                const btn = document.createElement("button");
                btn.className = "flow-btn";
                btn.dataset.flow = flow.id;
                btn.innerHTML = `<span class="flow-btn-dot" style="background:${flow.color || 'hsl(210,85%,62%)'}"></span>${flow.title}`;
                btn.addEventListener("click", () => startFlow(flow.id));
                flowBarBtns.appendChild(btn);
            });
        }
        
        // Re-render other dynamic UI panels
        populateBatchChecklist();
        populateAIGrid();
        populateLegend();
        
        // Clear health content preview
        const healthContent = document.getElementById("health-report-content");
        if (healthContent) {
            healthContent.innerHTML = `<p style="font-size:11px; color:var(--text-secondary); line-height:1.5; font-style: italic;">Run a sequential simulation audit through the Flow Checklist tab to compile and view the Architecture Health Report.</p>`;
        }
        
        // Reset execution log
        const logContent = document.getElementById("log-code-preview");
        if (logContent) {
            logContent.textContent = "Select and run a simulation scenario to record system execution logs.";
        }
        
        // Recompute layout sizes and render
        setTimeout(() => {
            measureNodes();
            drawConnections();
            updateMinimap();
            fitToView(false);
        }, 150);
    }

    function populateLegend() {
        const legendEl = document.getElementById("legend");
        if (!legendEl) return;
        
        let html = `<div class="legend-title">Node Types</div>`;
        const categories = {};
        NODES.forEach(n => {
            if (n.category && !categories[n.category]) {
                categories[n.category] = n.color || "hsl(210,85%,62%)";
            }
        });
        
        Object.keys(categories).forEach(cat => {
            html += `<div class="legend-item"><span class="legend-dot" style="background: ${categories[cat]}"></span>${cat}</div>`;
        });
        
        html += `<div class="legend-title" style="margin-top: 6px;">Connections</div>`;
        html += `<div class="legend-item"><span class="legend-line solid"></span>Request Flow</div>`;
        html += `<div class="legend-item"><span class="legend-line dashed"></span>Data Flow</div>`;
        
        legendEl.innerHTML = html;
    }

    function populateProjectDropdownList() {
        if (!projectList) return;
        projectList.innerHTML = "";
        const list = getAvailableProjects();
        
        list.forEach(p => {
            const item = document.createElement("div");
            item.className = "project-item";
            if (currentProject && p.id === currentProject.id) {
                item.classList.add("active");
            }
            
            item.addEventListener("click", () => {
                projectDropdown.classList.remove("show");
                loadProject(p);
            });
            
            const titleWrapper = document.createElement("div");
            titleWrapper.className = "project-item-title-wrapper";
            
            const titleSpan = document.createElement("span");
            titleSpan.textContent = p.title;
            titleWrapper.appendChild(titleSpan);
            
            const verSpan = document.createElement("span");
            verSpan.className = "project-item-version";
            verSpan.textContent = `v${p.version || "1.0"}`;
            titleWrapper.appendChild(verSpan);
            
            item.appendChild(titleWrapper);
            
            // Delete button for custom projects
            if (p.id !== DEFAULT_PROJECT_ID) {
                const delBtn = document.createElement("button");
                delBtn.className = "project-item-delete";
                delBtn.title = "Delete Project";
                delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
                
                delBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to permanently delete project '${p.title}' and all of its simulation history?`)) {
                        let custom = getCustomProjects();
                        custom = custom.filter(cp => cp.id !== p.id);
                        saveCustomProjects(custom);
                        
                        clearProjectHistoryFromDB(p.id).then(() => {
                            if (currentProject && currentProject.id === p.id) {
                                const available = getAvailableProjects();
                                if (available.length > 0) {
                                    loadProject(available[0]);
                                }
                            }
                            populateProjectDropdownList();
                            showToast(`Project '${p.title}' and its history deleted.`);
                        }).catch(err => {
                            console.error("Error clearing project history on delete:", err);
                            if (currentProject && currentProject.id === p.id) {
                                const available = getAvailableProjects();
                                if (available.length > 0) {
                                    loadProject(available[0]);
                                }
                            }
                            populateProjectDropdownList();
                            showToast(`Project '${p.title}' deleted.`);
                        });
                    }
                });
                
                item.appendChild(delBtn);
            }
            
            projectList.appendChild(item);
        });
    }

    // ─── Onboarding Wizard (Sprint 5) ───────────────────────────
    const wizardModal = document.getElementById("wizard-modal");
    const wizardModalClose = document.getElementById("wizard-modal-close");
    const wizardOptAnalyze = document.getElementById("wizard-opt-analyze");
    const wizardOptDesign = document.getElementById("wizard-opt-design");
    const wizardStep1 = document.getElementById("wizard-step-1");
    const wizardStepAnalyze = document.getElementById("wizard-step-analyze");
    const wizardStepDesign = document.getElementById("wizard-step-design");
    const wizardAnalyzeTitle = document.getElementById("wizard-analyze-title");
    const wizardDesignTitle = document.getElementById("wizard-design-title");
    const wizardDesignDesc = document.getElementById("wizard-design-desc");
    const wizardFolderInput = document.getElementById("wizard-folder-input");
    const wizardFileInput = document.getElementById("wizard-file-input");
    const wizardBtnBrowseFolder = document.getElementById("wizard-btn-browse-folder");
    const wizardBtnBrowseFile = document.getElementById("wizard-btn-browse-file");
    const wizardScanStatus = document.getElementById("wizard-scan-status");
    const wizardBtnLoadAnalyzed = document.getElementById("wizard-btn-load-analyzed");
    const wizardBtnGenerateDesigned = document.getElementById("wizard-btn-generate-designed");
    const wizardDropzone = document.getElementById("wizard-dropzone");

    let wizardScannedProjectSpec = null;

    function openWizardModal() {
        if (wizardAnalyzeTitle) wizardAnalyzeTitle.value = "";
        if (wizardDesignTitle) wizardDesignTitle.value = "";
        if (wizardDesignDesc) wizardDesignDesc.value = "";
        if (wizardScanStatus) {
            wizardScanStatus.style.display = "none";
            wizardScanStatus.innerHTML = "";
        }
        if (wizardBtnLoadAnalyzed) wizardBtnLoadAnalyzed.disabled = true;
        wizardScannedProjectSpec = null;
        showWizardStep(1);
        if (wizardModal) wizardModal.classList.add("show");
    }

    function closeWizardModal() {
        if (wizardModal) wizardModal.classList.remove("show");
    }

    function showWizardStep(step) {
        if (wizardStep1) wizardStep1.classList.remove("active");
        if (wizardStepAnalyze) wizardStepAnalyze.classList.remove("active");
        if (wizardStepDesign) wizardStepDesign.classList.remove("active");

        if (step === 1) {
            if (wizardStep1) wizardStep1.classList.add("active");
        } else if (step === "analyze") {
            if (wizardStepAnalyze) wizardStepAnalyze.classList.add("active");
        } else if (step === "design") {
            if (wizardStepDesign) wizardStepDesign.classList.add("active");
        }
    }

    if (wizardModalClose) {
        wizardModalClose.addEventListener("click", closeWizardModal);
    }
    if (wizardOptAnalyze) {
        wizardOptAnalyze.addEventListener("click", () => showWizardStep("analyze"));
    }
    if (wizardOptDesign) {
        wizardOptDesign.addEventListener("click", () => showWizardStep("design"));
    }
    document.querySelectorAll(".wizard-back-btn").forEach(btn => {
        btn.addEventListener("click", () => showWizardStep(1));
    });

    if (wizardBtnBrowseFolder && wizardFolderInput) {
        wizardBtnBrowseFolder.addEventListener("click", () => wizardFolderInput.click());
    }
    if (wizardBtnBrowseFile && wizardFileInput) {
        wizardBtnBrowseFile.addEventListener("click", () => wizardFileInput.click());
    }

    function handleScannedFiles(files, isFolder) {
        if (!files || files.length === 0) return;
        
        let archFile = null;
        let filesList = Array.from(files);
        
        for (let file of filesList) {
            const name = file.name.toLowerCase();
            const relPath = file.webkitRelativePath ? file.webkitRelativePath.toLowerCase() : "";
            if (name === "architecture.md" || relPath.endsWith("architecture.md")) {
                archFile = file;
                break;
            }
        }

        if (wizardScanStatus) {
            wizardScanStatus.style.display = "block";
            wizardScanStatus.innerHTML = "<span style='color: hsl(200, 85%, 75%);'>Scanning project files...</span>";
        }

        if (archFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const parsed = parseMarkdownToProject(text);
                    validateProjectData(parsed);
                    
                    wizardScannedProjectSpec = parsed;
                    if (wizardAnalyzeTitle) wizardAnalyzeTitle.value = parsed.title;
                    
                    if (wizardScanStatus) {
                        wizardScanStatus.innerHTML = `<span style="color: hsl(150, 75%, 70%); font-weight:600;">✅ Found architecture.md!</span><br>` +
                            `<strong>Title:</strong> ${parsed.title}<br>` +
                            `<strong>Version:</strong> ${parsed.version}<br>` +
                            `<strong>Components:</strong> ${parsed.nodes.length} nodes, ${parsed.connections.length} connections.`;
                    }
                    if (wizardBtnLoadAnalyzed) wizardBtnLoadAnalyzed.disabled = false;
                } catch (err) {
                    if (wizardScanStatus) {
                        wizardScanStatus.innerHTML = `<span style="color: hsl(0, 72%, 62%); font-weight:600;">❌ Found architecture.md but failed parsing:</span><br>` +
                            `<span style="font-size:10px; font-family:monospace; opacity:0.8;">${err.message}</span>`;
                    }
                }
            };
            reader.readAsText(archFile);
        } else {
            let hasClient = false, hasApi = false, hasDb = false, hasAuth = false, hasWorker = false;
            let folderName = "";

            filesList.forEach(file => {
                const path = file.webkitRelativePath ? file.webkitRelativePath.toLowerCase() : file.name.toLowerCase();
                if (!folderName && file.webkitRelativePath) {
                    folderName = file.webkitRelativePath.split('/')[0];
                }
                if (path.includes("/client") || path.includes("/frontend") || path.includes("/web") || path.includes("index.html") || path.includes("app.js") || path.includes("app.tsx")) {
                    hasClient = true;
                }
                if (path.includes("/api") || path.includes("/backend") || path.includes("/server") || path.includes("server.js") || path.includes("app.py")) {
                    hasApi = true;
                }
                if (path.includes("/db") || path.includes("/database") || path.includes("/postgres") || path.includes("/mysql") || path.includes("/mongo") || path.includes("schema.sql")) {
                    hasDb = true;
                }
                if (path.includes("/auth") || path.includes("login") || path.includes("session")) {
                    hasAuth = true;
                }
                if (path.includes("/worker") || path.includes("/queue") || path.includes("rabbitmq") || path.includes("kafka") || path.includes("redis")) {
                    hasWorker = true;
                }
            });

            if (folderName && wizardAnalyzeTitle) {
                wizardAnalyzeTitle.value = folderName.split(/[_-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            } else if (wizardAnalyzeTitle && !wizardAnalyzeTitle.value) {
                wizardAnalyzeTitle.value = "Workspace Scaffold";
            }

            const nodesList = [];
            const connectionsList = [];
            const flowsList = [];

            if (hasClient || (!hasApi && !hasDb)) {
                nodesList.push({
                    id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250,
                    desc: "Scaffolded client interface detected in project directory."
                });
            }
            if (hasAuth) {
                nodesList.push({
                    id: "auth", category: "Service", title: "Authentication API", icon: "🔒", color: "hsl(280,85%,75%)", x: 550, y: 550,
                    desc: "Scaffolded authentication system detected."
                });
            }
            if (hasApi || hasWorker || hasDb) {
                nodesList.push({
                    id: "api", category: "Service", title: "Backend API Gateway", icon: "⚙️", color: "hsl(200,80%,58%)", x: 550, y: 250,
                    desc: "Scaffolded core api controller."
                });
            }
            if (hasWorker) {
                nodesList.push({
                    id: "worker", category: "Service", title: "Background Job Processor", icon: "📨", color: "hsl(28,85%,58%)", x: 800, y: 550,
                    desc: "Scaffolded message queue worker."
                });
            }
            if (hasDb) {
                nodesList.push({
                    id: "db", category: "Infrastructure", title: "Relational Database", icon: "🗄️", color: "hsl(170,70%,50%)", x: 800, y: 250,
                    desc: "Scaffolded storage container."
                });
            }

            if (nodesList.length === 0) {
                nodesList.push(
                    { id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250, desc: "Default client interface." },
                    { id: "api", category: "Service", title: "Core Service", icon: "⚙️", color: "hsl(200,80%,58%)", x: 750, y: 250, desc: "Default backend API service." }
                );
            }

            const nodeIds = nodesList.map(n => n.id);
            if (nodeIds.includes("client") && nodeIds.includes("api")) {
                connectionsList.push(["client", "api", "HTTPS Request", "request"]);
            }
            if (nodeIds.includes("api") && nodeIds.includes("auth")) {
                connectionsList.push(["api", "auth", "Authorize User", "request"]);
            }
            if (nodeIds.includes("api") && nodeIds.includes("worker")) {
                connectionsList.push(["api", "worker", "Publish Job", "data"]);
            }
            if (nodeIds.includes("api") && nodeIds.includes("db")) {
                connectionsList.push(["api", "db", "Read/Write SQL", "data"]);
            }
            if (nodeIds.includes("worker") && nodeIds.includes("db")) {
                connectionsList.push(["worker", "db", "Update State", "data"]);
            }
            
            if (connectionsList.length === 0 && nodeIds.length >= 2) {
                connectionsList.push([nodeIds[0], nodeIds[1], "Connects To", "request"]);
            }

            const flowSteps = [];
            nodesList.forEach(n => {
                flowSteps.push({
                    node: n.id,
                    label: `Process at ${n.title}`,
                    detail: `Scaffolded pipeline execution step at ${n.title}.`,
                    data: `{"scaffold": true}`
                });
            });

            flowsList.push({
                id: "main_scaffold_flow",
                title: "Default Execution Scenario",
                subtitle: "Automatically generated scenario walkthrough",
                steps: flowSteps
            });

            const spec = {
                title: wizardAnalyzeTitle.value.trim() || "Workspace Scaffold",
                version: "1.0",
                nodes: nodesList,
                connections: connectionsList,
                flows: flowsList
            };

            wizardScannedProjectSpec = spec;
            if (wizardScanStatus) {
                let detectedText = [];
                if (hasClient) detectedText.push("Frontend (Client)");
                if (hasApi) detectedText.push("Backend (API)");
                if (hasDb) detectedText.push("Database");
                if (hasAuth) detectedText.push("Auth Module");
                if (hasWorker) detectedText.push("Worker Queue");
                
                if (detectedText.length === 0) detectedText.push("Generic project directory");

                wizardScanStatus.innerHTML = `<span style="color: hsl(32, 85%, 58%); font-weight:600;">⚠️ architecture.md not found.</span><br>` +
                    `Detected structure components: <strong>${detectedText.join(", ")}</strong>.<br>` +
                    `We scaffolded ${nodesList.length} nodes and ${connectionsList.length} connections to match. Ready to load!`;
            }
            if (wizardBtnLoadAnalyzed) wizardBtnLoadAnalyzed.disabled = false;
        }
    }

    if (wizardFolderInput) {
        wizardFolderInput.addEventListener("change", (e) => {
            handleScannedFiles(e.target.files, true);
        });
    }

    if (wizardFileInput) {
        wizardFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const isJson = file.name.toLowerCase().endsWith(".json");
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    let spec;
                    if (isJson) {
                        spec = JSON.parse(event.target.result);
                    } else {
                        spec = parseMarkdownToProject(event.target.result);
                    }
                    validateProjectData(spec);
                    wizardScannedProjectSpec = spec;
                    if (wizardAnalyzeTitle) wizardAnalyzeTitle.value = spec.title;
                    if (wizardScanStatus) {
                        wizardScanStatus.style.display = "block";
                        wizardScanStatus.innerHTML = `<span style="color: hsl(150, 75%, 70%); font-weight:600;">✅ Loaded Specification File!</span><br>` +
                            `<strong>Title:</strong> ${spec.title}<br>` +
                            `<strong>Nodes:</strong> ${spec.nodes.length}, <strong>Connections:</strong> ${spec.connections.length}`;
                    }
                    if (wizardBtnLoadAnalyzed) wizardBtnLoadAnalyzed.disabled = false;
                } catch(err) {
                    if (wizardScanStatus) {
                        wizardScanStatus.style.display = "block";
                        wizardScanStatus.innerHTML = `<span style="color: hsl(0, 72%, 62%); font-weight:600;">❌ File loading failed:</span><br>` +
                            `<span style="font-size:10px; font-family:monospace; opacity:0.8;">${err.message}</span>`;
                    }
                }
            };
            reader.readAsText(file);
        });
    }

    if (wizardBtnLoadAnalyzed) {
        wizardBtnLoadAnalyzed.addEventListener("click", () => {
            if (!wizardScannedProjectSpec) return;
            
            const titleVal = wizardAnalyzeTitle.value.trim();
            if (titleVal) {
                wizardScannedProjectSpec.title = titleVal;
            }

            const custom = getCustomProjects();
            const newId = "project-" + Date.now();
            wizardScannedProjectSpec.id = newId;
            custom.push(wizardScannedProjectSpec);
            saveCustomProjects(custom);
            loadProject(wizardScannedProjectSpec);
            closeWizardModal();
            showToast(`Project '${wizardScannedProjectSpec.title}' loaded and initialized!`);
        });
    }

    if (wizardDropzone) {
        wizardDropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            wizardDropzone.classList.add("dragover");
        });
        wizardDropzone.addEventListener("dragleave", () => {
            wizardDropzone.classList.remove("dragover");
        });
        wizardDropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            wizardDropzone.classList.remove("dragover");
            if (e.dataTransfer.files) {
                handleScannedFiles(e.dataTransfer.files, false);
            }
        });
    }

    if (wizardModal) {
        wizardModal.addEventListener("click", (e) => {
            if (e.target === wizardModal) {
                closeWizardModal();
            }
        });
    }

    if (wizardBtnGenerateDesigned) {
        wizardBtnGenerateDesigned.addEventListener("click", () => {
            const titleVal = wizardDesignTitle.value.trim() || "My New System Architecture";
            const descVal = wizardDesignDesc.value.trim().toLowerCase();
            
            const nodesList = [];
            const connectionsList = [];
            const flowsList = [];

            const hasClient = descVal.includes("client") || descVal.includes("frontend") || descVal.includes("web") || descVal.includes("ui") || descVal.includes("react") || descVal.includes("next") || descVal.includes("vue") || descVal.includes("app");
            const hasGateway = descVal.includes("gateway") || descVal.includes("proxy") || descVal.includes("nginx") || descVal.includes("load balancer");
            const hasAuth = descVal.includes("auth") || descVal.includes("oauth") || descVal.includes("jwt") || descVal.includes("login") || descVal.includes("identity") || descVal.includes("cognito");
            const hasWorker = descVal.includes("worker") || descVal.includes("queue") || descVal.includes("rabbitmq") || descVal.includes("kafka") || descVal.includes("celery") || descVal.includes("redis") || descVal.includes("broker");
            const hasDb = descVal.includes("database") || descVal.includes("db") || descVal.includes("postgres") || descVal.includes("postgresql") || descVal.includes("mysql") || descVal.includes("sqlite") || descVal.includes("mongodb") || descVal.includes("dynamo");
            const hasApi = descVal.includes("api") || descVal.includes("backend") || descVal.includes("service") || descVal.includes("python") || descVal.includes("node") || descVal.includes("django") || descVal.includes("flask") || descVal.includes("express") || descVal.includes("spring");

            if (hasClient || (!hasGateway && !hasAuth && !hasWorker && !hasDb && !hasApi)) {
                nodesList.push({
                    id: "client", category: "Entry Point", title: "Web Client Portal", icon: "💻", color: "hsl(210,85%,62%)", x: 200, y: 150,
                    desc: "User-facing dashboard and interactive portal interface.",
                    sections: [{ label: "Capabilities", items: ["Render Views", "Form Inputs", "Event Handling"] }]
                });
            }
            if (hasGateway) {
                nodesList.push({
                    id: "gateway", category: "Service", title: "Edge API Gateway", icon: "🛡️", color: "hsl(270,70%,65%)", x: 500, y: 150,
                    desc: "Ingress security router and authentication proxy gateway.",
                    sections: [{ label: "Middlewares", items: ["Rate Limiter", "Router"] }]
                });
            }
            if (hasAuth) {
                nodesList.push({
                    id: "auth", category: "Service", title: "Authentication API", icon: "🔒", color: "hsl(280,85%,75%)", x: 500, y: 450,
                    desc: "Authenticates users, signs JSON Web Tokens, and manages sessions.",
                    sections: [{ label: "Tech Stack", items: ["JWT", "BCrypt"] }]
                });
            }
            if (hasApi || (!hasClient && nodesList.length === 0)) {
                nodesList.push({
                    id: "api", category: "Service", title: "Core Business Service", icon: "⚙️", color: "hsl(220,80%,62%)", x: 800, y: 150,
                    desc: "Handles transactional requests and processes core workflows.",
                    sections: [{ label: "Controller Endpoints", items: ["POST /orders", "GET /data"] }]
                });
            }
            if (hasWorker) {
                nodesList.push({
                    id: "worker", category: "Service", title: "Task Event Worker", icon: "📨", color: "hsl(28,85%,58%)", x: 800, y: 450,
                    desc: "Asynchronous task queue workers running background jobs.",
                    sections: [{ label: "Workers", items: ["Email Processing", "Image Scaling"] }]
                });
            }
            if (hasDb) {
                let dbTitle = "Database Store";
                let dbIcon = "🗄️";
                if (descVal.includes("postgres")) dbTitle = "PostgreSQL DB";
                else if (descVal.includes("mysql")) dbTitle = "MySQL DB";
                else if (descVal.includes("mongo")) { dbTitle = "MongoDB Store"; dbIcon = "🍃"; }
                else if (descVal.includes("redis")) { dbTitle = "Redis Cache"; dbIcon = "⚡"; }

                nodesList.push({
                    id: "db", category: "Infrastructure", title: dbTitle, icon: dbIcon, color: "hsl(170,70%,50%)", x: 1100, y: 150,
                    desc: "Persistent relational and transactional storage node.",
                    sections: [{ label: "Tables/Schemas", items: ["Users Registry", "Audit Logs"] }]
                });
            }

            if (nodesList.length === 0) {
                nodesList.push(
                    { id: "client", category: "Entry Point", title: "Client Web App", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250, desc: "User client view." },
                    { id: "api", category: "Service", title: "Backend Controller", icon: "⚙️", color: "hsl(200,80%,58%)", x: 750, y: 250, desc: "Processes logical APIs." }
                );
            }

            const nodeIds = nodesList.map(n => n.id);
            if (nodeIds.includes("client") && nodeIds.includes("gateway")) {
                connectionsList.push(["client", "gateway", "HTTPS Api Request", "request"]);
            } else if (nodeIds.includes("client") && nodeIds.includes("api")) {
                connectionsList.push(["client", "api", "HTTPS Request", "request"]);
            }

            if (nodeIds.includes("gateway") && nodeIds.includes("auth")) {
                connectionsList.push(["gateway", "auth", "Authorize Key", "request"]);
            }
            if (nodeIds.includes("gateway") && nodeIds.includes("api")) {
                connectionsList.push(["gateway", "api", "Forward Route", "request"]);
            }
            if (nodeIds.includes("api") && nodeIds.includes("worker")) {
                connectionsList.push(["api", "worker", "Publish Event Task", "data"]);
            }
            if (nodeIds.includes("api") && nodeIds.includes("db")) {
                connectionsList.push(["api", "db", "Read/Write Queries", "data"]);
            }
            if (nodeIds.includes("worker") && nodeIds.includes("db")) {
                connectionsList.push(["worker", "db", "Save Task Result", "data"]);
            }

            if (connectionsList.length === 0 && nodeIds.length >= 2) {
                connectionsList.push([nodeIds[0], nodeIds[1], "HTTP Request", "request"]);
            }

            const flowSteps = [];
            nodesList.forEach(n => {
                flowSteps.push({
                    node: n.id,
                    label: `Activate ${n.title}`,
                    detail: `Workflow processes payload at ${n.title}.`,
                    data: `{"activated": "${n.id}"}`
                });
            });

            flowsList.push({
                id: "generated_flow",
                title: "Simulated Data Flow Scenario",
                subtitle: "Automatically generated playback timeline for design concept",
                steps: flowSteps
            });

            const spec = {
                id: "project-" + Date.now(),
                title: titleVal,
                version: "1.0",
                nodes: nodesList,
                connections: connectionsList,
                flows: flowsList
            };

            const custom = getCustomProjects();
            custom.push(spec);
            saveCustomProjects(custom);
            loadProject(spec);
            closeWizardModal();
            showToast(`Successfully designed and generated '${titleVal}'!`);
        });
    }

    let editingProjectId = null;

    function openProjectModal(projId = null) {
        editingProjectId = projId;
        if (projId) {
            const projects = getAvailableProjects();
            const proj = projects.find(p => p.id === projId);
            if (!proj) return;
            
            projectModalTitle.textContent = "Edit Project Settings";
            projectTitleInput.value = proj.title || "";
            projectVersionInput.value = proj.version || "1.0";
            
            const spec = {
                title: proj.title,
                version: proj.version,
                description: proj.description || undefined,
                nodes: proj.nodes || [],
                connections: proj.connections || [],
                flows: proj.flows || [],
                layers: proj.layers || undefined,
                trustBoundary: proj.hasOwnProperty('trustBoundary') ? proj.trustBoundary : undefined
            };
            projectJsonInput.value = exportProjectToMarkdown(spec);
        } else {
            projectModalTitle.textContent = "Create New Project";
            projectTitleInput.value = "";
            projectVersionInput.value = "1.0";
            
            const defaultSpec = {
                title: "Untitled Project",
                version: "1.0",
                nodes: SKELETON_TEMPLATE.nodes || [],
                connections: SKELETON_TEMPLATE.connections || [],
                flows: SKELETON_TEMPLATE.flows || []
            };
            projectJsonInput.value = exportProjectToMarkdown(defaultSpec);
        }
        projectModal.classList.add("show");
    }

    function closeProjectModal() {
        projectModal.classList.remove("show");
        editingProjectId = null;
    }

    function saveProjectFromModal() {
        let title = projectTitleInput.value.trim();
        let version = projectVersionInput.value.trim() || "1.0";
        const jsonStr = projectJsonInput.value.trim();
        
        let spec;
        const isMarkdown = !jsonStr.startsWith("{");
        
        if (isMarkdown) {
            try {
                spec = parseMarkdownToProject(jsonStr);
            } catch (e) {
                alert("Invalid Markdown format in Architecture Specification: " + e.message);
                return;
            }
        } else {
            try {
                spec = JSON.parse(jsonStr);
            } catch (e) {
                alert("Invalid JSON format in Architecture Specification: " + e.message);
                return;
            }
        }
        
        // Validate parsed project data
        try {
            validateProjectData(spec);
        } catch (e) {
            alert("Specification validation failed: " + e.message);
            return;
        }
        
        if (isMarkdown) {
            if (spec.title) title = spec.title;
            if (spec.version) version = spec.version;
        }
        
        if (!title) {
            alert("Project Title is required.");
            return;
        }
        
        const custom = getCustomProjects();
        
        if (editingProjectId) {
            const idx = custom.findIndex(p => p.id === editingProjectId);
            if (idx === -1) {
                // If editing built-in project, save as a new custom project clone
                const newProj = {
                    id: "project_" + Date.now(),
                    ...spec,
                    title,
                    version
                };
                custom.push(newProj);
                saveCustomProjects(custom);
                loadProject(newProj);
                showToast(`Built-in project cloned as '${title}'`);
            } else {
                custom[idx] = {
                    id: editingProjectId,
                    ...spec,
                    title,
                    version
                };
                saveCustomProjects(custom);
                if (currentProject && currentProject.id === editingProjectId) {
                    loadProject(custom[idx]);
                }
                showToast(`Project '${title}' updated.`);
            }
        } else {
            const newProj = {
                id: "project_" + Date.now(),
                ...spec,
                title,
                version
            };
            custom.push(newProj);
            saveCustomProjects(custom);
            loadProject(newProj);
            showToast(`Project '${title}' created successfully.`);
        }
        
        closeProjectModal();
    }

    function startupProjectSystem() {
        const list = getAvailableProjects();
        const activeId = localStorage.getItem("archbench_active_project_id");
        let activeProj = list.find(p => p.id === activeId);
        
        if (!activeProj && list.length > 0) {
            activeProj = list[0];
        }
        
        if (activeProj) {
            loadProject(activeProj);
        }
        
        // Initialize default sidebar tab and active headers on launch
        switchTab("ai");
    }

    // ─── Attach Listeners ────────────────────────────────────────

    btnStartBatch.addEventListener("click", startBatchRun);
    btnStopBatch.addEventListener("click", stopBatchRun);

    // Project Dropdown Events
    if (btnProjectSelector) {
        btnProjectSelector.addEventListener("click", (e) => {
            e.stopPropagation();
            projectDropdown.classList.toggle("show");
            if (projectDropdown.classList.contains("show")) {
                populateProjectDropdownList();
            }
        });
    }

    document.addEventListener("click", () => {
        if (projectDropdown) projectDropdown.classList.remove("show");
    });

    if (projectDropdown) {
        projectDropdown.addEventListener("click", (e) => {
            e.stopPropagation();
        });
    }

    if (dropdownBtnCreate) {
        dropdownBtnCreate.addEventListener("click", () => {
            if (projectDropdown) projectDropdown.classList.remove("show");
            openWizardModal();
        });
    }

    if (dropdownBtnEdit) {
        dropdownBtnEdit.addEventListener("click", () => {
            if (projectDropdown) projectDropdown.classList.remove("show");
            if (currentProject) {
                openProjectModal(currentProject.id);
            }
        });
    }

    if (dropdownBtnImport) {
        dropdownBtnImport.addEventListener("click", () => {
            if (projectDropdown) projectDropdown.classList.remove("show");
            if (projectFileInput) projectFileInput.click();
        });
    }

    if (projectFileInput) {
        projectFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const isMd = file.name.toLowerCase().endsWith(".md");
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const text = event.target.result;
                    let parsed;
                    if (isMd) {
                        parsed = parseMarkdownToProject(text);
                    } else {
                        parsed = JSON.parse(text);
                    }
                    
                    if (!parsed.title || !parsed.nodes || !parsed.connections || !parsed.flows) {
                        throw new Error("Invalid project structure. Requires 'title', 'nodes', 'connections', and 'flows'.");
                    }
                    
                    validateProjectData(parsed);
                    
                    parsed.id = "project_" + Date.now();
                    
                    const custom = getCustomProjects();
                    custom.push(parsed);
                    saveCustomProjects(custom);
                    
                    loadProject(parsed);
                    showToast(`Project '${parsed.title}' imported successfully!`);
                } catch (err) {
                    alert("Failed to import project: " + err.message);
                }
                projectFileInput.value = "";
            };
            reader.readAsText(file);
        });
    }

    if (dropdownBtnExport) {
        dropdownBtnExport.addEventListener("click", () => {
            if (projectDropdown) projectDropdown.classList.remove("show");
            if (!currentProject) {
                showToast("No active project to export!");
                return;
            }
            
            const exportData = {
                id: currentProject.id,
                title: currentProject.title,
                version: currentProject.version,
                nodes: NODES,
                connections: CONNECTIONS,
                flows: FLOWS,
                layers: currentProject.layers || null,
                trustBoundary: currentProject.hasOwnProperty('trustBoundary') ? currentProject.trustBoundary : undefined
            };
            
            const md = exportProjectToMarkdown(exportData);
            const safeTitle = currentProject.title.toLowerCase().replace(/[^a-z0-9]/g, "_");
            downloadFile(md, `archbench_project_${safeTitle}_${Date.now()}.md`, "text/markdown");
            showToast("Project configuration exported successfully as Markdown.");
        });
    }

    // Modal Control Events
    if (projectModalClose) projectModalClose.addEventListener("click", closeProjectModal);
    if (projectModalCancel) projectModalCancel.addEventListener("click", closeProjectModal);
    if (projectModalSave) projectModalSave.addEventListener("click", saveProjectFromModal);

    // ─── Architecture Spec Kit Helpers ──────────────────────────
    const linkSpecTemplate = document.getElementById("link-spec-template");
    const linkSpecPrompt = document.getElementById("link-spec-prompt");

    if (linkSpecTemplate) {
        linkSpecTemplate.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
                const resp = await fetch("docs/architecture.template.md");
                if (!resp.ok) throw new Error("Failed to load template: " + resp.status);
                const templateText = await resp.text();
                if (projectJsonInput) {
                    projectJsonInput.value = templateText;
                    projectJsonInput.focus();
                }
                showToast("📋 Architecture template loaded into editor.");
            } catch (err) {
                console.error("Load template error:", err);
                showToast("⚠️ Could not load template file.");
            }
        });
    }

    if (linkSpecPrompt) {
        linkSpecPrompt.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
                const resp = await fetch("docs/agent_prompt.md");
                if (!resp.ok) throw new Error("Failed to load agent prompt: " + resp.status);
                const promptText = await resp.text();
                await navigator.clipboard.writeText(promptText);
                showToast("🤖 Agent prompt copied to clipboard! Paste into your LLM client.");
            } catch (err) {
                console.error("Copy agent prompt error:", err);
                // Fallback: open in new tab if clipboard fails
                try {
                    const resp2 = await fetch("docs/agent_prompt.md");
                    const text2 = await resp2.text();
                    const blob = new Blob([text2], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                    showToast("📄 Agent prompt opened in new tab (clipboard unavailable).");
                } catch (e2) {
                    showToast("⚠️ Could not load agent prompt file.");
                }
            }
        });
    }


    // Live watch detection and Terminal command shell logic moved to js/live-watch.js and js/terminal.js


    // ─── Init ───────────────────────────────────────────────────

    // Replaces default startup static drawings by loading project dynamically
    startupProjectSystem();

    setTimeout(() => {
        reloadHistoryCache().catch(err => console.error("Could not load history on startup:", err));
    }, 250);

    // Help auto-fade
    setTimeout(() => {
        if (helpHint) { 
            helpHint.style.opacity = "0"; 
            setTimeout(() => { if(helpHint) helpHint.style.display = "none"; }, 600); 
        }
    }, 6000);

    applyTransform();
