import { NODES, CONNECTIONS } from "../graph.js";
import { activeFlow, nextStep, prevStep, exitFlow, applyFlowToConnections } from "./flow-engine.js";

// DOM references
const viewport    = document.getElementById("viewport");
const canvas      = document.getElementById("canvas");
const svgLayer    = document.getElementById("connections-svg");
const zoomLabel   = document.getElementById("zoom-label");
const helpHint    = document.getElementById("help-hint");

const mmC = document.getElementById("minimap-canvas");
const mmX = mmC ? mmC.getContext("2d") : null;
const mmV = document.getElementById("minimap-viewport");

// State
let scale = 0.45, panX = 0, panY = 0;
let isPanning = false, spacePressed = false;
let panStartX, panStartY, panStartPanX, panStartPanY;

export const nodeEls = {};
export const nodeData = {};

export function clearNodeState() {
    Object.keys(nodeEls).forEach(k => delete nodeEls[k]);
    Object.keys(nodeData).forEach(k => delete nodeData[k]);
}

// ─── Build Nodes ────────────────────────────────────────────
export function buildNode(n) {
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
    if (canvas) canvas.appendChild(el);
    nodeEls[n.id] = el;
    makeDraggable(el, n);
}

// ─── Measure Nodes ──────────────────────────────────────────
export function measureNodes() {
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

export function drawConnections() {
    if (!svgLayer) return;
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
    if (!svgLayer) return;
    svgLayer.querySelectorAll(".conn-line,.conn-arrow,.conn-label,.conn-dot").forEach(el => {
        if (el.dataset.from===nid || el.dataset.to===nid) el.classList.toggle("highlighted",on);
    });
    CONNECTIONS.forEach(([f,t]) => {
        if (f===nid && nodeEls[t]) nodeEls[t].classList.toggle("highlighted",on);
        if (t===nid && nodeEls[f]) nodeEls[f].classList.toggle("highlighted",on);
    });
}

// ─── Pan & Zoom ─────────────────────────────────────────────
export function applyTransform() {
    if (canvas) canvas.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
    if (zoomLabel) zoomLabel.textContent = Math.round(scale*100)+"%";
    const gs = 20*scale, ms = 100*scale;
    if (viewport) {
        viewport.style.backgroundSize = `${gs}px ${gs}px,${gs}px ${gs}px,${ms}px ${ms}px,${ms}px ${ms}px`;
        viewport.style.backgroundPosition = `${panX}px ${panY}px,${panX}px ${panY}px,${panX}px ${panY}px,${panX}px ${panY}px`;
    }
    updateMinimap();
}

export function zoomAt(f) {
    if (!viewport) return;
    const r=viewport.getBoundingClientRect();
    const cx=r.width/2,cy=r.height/2;
    const ns=Math.min(Math.max(scale*f,0.1),2.5);
    panX=cx-(cx-panX)*(ns/scale);panY=cy-(cy-panY)*(ns/scale);scale=ns;
    applyTransform();
}

export function fitToView(anim) {
    let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
    Object.values(nodeData).forEach(d=>{if(d.x<mnX)mnX=d.x;if(d.y<mnY)mnY=d.y;if(d.x+d.w>mxX)mxX=d.x+d.w;if(d.y+d.h>mxY)mxY=d.y+d.h;});
    if(!isFinite(mnX) || !viewport || !canvas) return;
    const p=140,cw=mxX-mnX+p*2,ch=mxY-mnY+p*2;
    const vr=viewport.getBoundingClientRect();
    const fs=Math.min(vr.width/cw,vr.height/ch,1.2);
    if(anim){canvas.style.transition="transform 0.5s cubic-bezier(0.4,0,0.2,1)";setTimeout(()=>{canvas.style.transition="";},550);}
    scale=fs;panX=(vr.width-cw*fs)/2-(mnX-p)*fs;panY=(vr.height-ch*fs)/2-(mnY-p)*fs;
    applyTransform();
}

export function panToNode(nid, anim) {
    const d = nodeData[nid];
    if (!d || !viewport || !canvas) return;
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
export function updateMinimap() {
    if (!mmC || !mmX || !mmV || !viewport) return;
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
    mmX.globalAlpha=0.4;
    Object.entries(nodeData).forEach(([id,d])=>{const n=NODES.find(n=>n.id===id);mmX.fillStyle=n?n.color:"rgba(100,120,255,0.5)";mmX.fillRect((d.x-mnX)*ms,(d.y-mnY)*ms,Math.max(d.w*ms,3),Math.max(d.h*ms,2));});
    mmX.globalAlpha=1;
    // Viewport
    const vr=viewport.getBoundingClientRect();
    const vx=(-panX/scale-mnX)*ms,vy=(-panY/scale-mnY)*ms;
    const vw=(vr.width/scale)*ms,vh=(vr.height/scale)*ms;
    mmV.style.left=Math.max(0,vx)+"px";mmV.style.top=Math.max(0,vy)+"px";
    mmV.style.width=Math.min(vw,mw)+"px";mmV.style.height=Math.min(vh,mh)+"px";
}

export function initCanvasRenderer() {
    if (!viewport) return;

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

    // Toolbar
    const zoomInBtn = document.getElementById("btn-zoom-in");
    const zoomOutBtn = document.getElementById("btn-zoom-out");
    const resetBtn = document.getElementById("btn-reset");
    const fitBtn = document.getElementById("btn-fit");

    if (zoomInBtn) zoomInBtn.addEventListener("click", () => zoomAt(1.25));
    if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => zoomAt(0.75));
    if (resetBtn) resetBtn.addEventListener("click", () => { scale=0.45; panX=0; panY=0; applyTransform(); setTimeout(()=>fitToView(true),50); });
    if (fitBtn) fitBtn.addEventListener("click", () => fitToView(true));

    applyTransform();
}
