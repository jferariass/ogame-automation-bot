// ==UserScript==
// @name         OGame Pase1 - Automation Bot (v0.9.1)
// @namespace    http://tampermonkey.net/
// @version      0.9.1
// @description  Imperio Futurista: Mapeo de Planetas/Lunas (Versión Robusta)
// @author       Pase1
// @match        *://*.ogame.gameforge.com/game/index.php*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    console.log("🚀 PASE1: Iniciando carga de script...");

    // --- CONFIGURACIÓN Y ESTADO ---
    const State = {
        lastUpdate: '...',
        currentPlanet: {},
        allEntities: [],
        resources: { metal: 0, crystal: 0, deut: 0 },
        fleetEvents: { own: 0, hostile: 0, neutral: 0 }
    };

    const COLORS = {
        main: '#00ffcc',
        unmapped: '#ff3366',
        mapped: '#33ff77',
        bg: 'rgba(5, 15, 25, 0.85)'
    };

    function log(msg) {
        console.log(`%c[Pase1] ${msg}`, `color: ${COLORS.main}; font-weight: bold; border-left: 3px solid ${COLORS.main}; padding-left: 5px;`);
    }

    // --- MÓDULO 1: BASE DE DATOS ---
    const DB = {
        load: function () {
            try {
                let data = localStorage.getItem('Pase1_Empire');
                return data ? JSON.parse(data) : { planets: {} };
            } catch (e) { return { planets: {} }; }
        },
        save: function (data) {
            try { localStorage.setItem('Pase1_Empire', JSON.stringify(data)); } catch (e) { }
        },
        updateSnapshot: function () {
            const getMeta = (name) => {
                const tag = document.querySelector(`meta[name="${name}"]`);
                return tag ? tag.getAttribute('content') : null;
            };

            const id = getMeta('ogame-planet-id');
            if (!id) return;

            const data = this.load();
            State.currentPlanet = {
                id: id,
                name: getMeta('ogame-planet-name'),
                coords: getMeta('ogame-planet-coordinates'),
                type: getMeta('ogame-planet-type')
            };

            data.planets[id] = {
                name: State.currentPlanet.name,
                coords: State.currentPlanet.coords,
                type: State.currentPlanet.type,
                resources: { ...State.resources },
                lastUpdate: new Date().getTime()
            };

            this.save(data);
        }
    };

    // --- MÓDULO 2: ESCÁNER DE ENTORNO ---
    function scanRightMenu() {
        const entities = [];
        const items = document.querySelectorAll('#countColonies .smallplanet');

        items.forEach(item => {
            const pLink = item.querySelector('.planetlink');
            if (pLink) {
                const id = pLink.getAttribute('href')?.match(/cp=(\d+)/)?.[1];
                const name = item.querySelector('.planet-name')?.innerText || 'Planet';
                const coords = item.querySelector('.planet-koords')?.innerText || '';
                entities.push({ id, name, coords, type: 'planet' });
            }
            const mLink = item.querySelector('.moonlink');
            if (mLink) {
                const id = mLink.getAttribute('href')?.match(/cp=(\d+)/)?.[1];
                const coords = item.querySelector('.planet-koords')?.innerText || '';
                entities.push({ id, name: 'Luna', coords, type: 'moon' });
            }
        });
        if (entities.length > 0) State.allEntities = entities;
    }

    function scanResources() {
        const getRaw = (id) => {
            const el = document.getElementById(id);
            if (!el) return 0;
            const raw = el.getAttribute('data-raw');
            return raw ? parseInt(raw) : (parseInt(el.innerText.replace(/\./g, '')) || 0);
        };
        State.resources = { metal: getRaw('resources_metal'), crystal: getRaw('resources_crystal'), deut: getRaw('resources_deuterium') };
        State.lastUpdate = new Date().toLocaleTimeString();
    }

    function scanFleet() {
        const attackAlert = document.getElementById('attack_alert');
        State.fleetEvents.hostile = (attackAlert && attackAlert.classList.contains('soon')) ? 1 : 0;
        const eventRows = document.querySelectorAll('#eventContent .eventFleet');
        if (eventRows.length > 0) {
            let own = 0, hostile = 0;
            eventRows.forEach(row => {
                if (row.classList.contains('hostile')) hostile++;
                else if (row.classList.contains('friendly')) own++;
            });
            State.fleetEvents.own = own;
            State.fleetEvents.hostile = hostile || State.fleetEvents.hostile;
        }
    }

    // --- MÓDULO 3: INTERFAZ (UI) ---
    function injectStyles() {
        if (document.getElementById('pase1-core-styles')) return;
        const s = document.createElement('style');
        s.id = 'pase1-core-styles';
        s.innerHTML = `
            .p1-glass {
                background: ${COLORS.bg};
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                border: 1px solid ${COLORS.main};
                box-shadow: 0 0 15px rgba(0,0,0,0.5);
                color: white;
                font-family: Arial, sans-serif;
                pointer-events: auto;
            }
            .p1-item { border-left: 2px solid transparent; margin-bottom: 5px; padding: 4px 8px; background: rgba(255,255,255,0.03); }
            .p1-mapped { border-color: ${COLORS.mapped}; }
            .p1-unmapped { border-color: ${COLORS.unmapped}; }
            .p1-res-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px; font-size: 9px; margin-top: 2px; }
            @keyframes p1-pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
            .p1-alert { border-color: ${COLORS.unmapped} !important; animation: p1-pulse 1s infinite; }
        `;
        document.head.appendChild(s);
    }

    function updateEmpirePanel() {
        let panel = document.getElementById('p1-empire');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'p1-empire';
            panel.className = 'p1-glass';
            panel.style = "position:fixed; top:60px; left:10px; width:220px; max-height:80vh; border-radius:8px; overflow-y:auto; z-index:9999; padding:10px;";
            document.body.appendChild(panel);
        }

        const data = DB.load();
        let totalM = 0, totalC = 0, totalD = 0;
        let itemsHtml = '<div style="font-weight:bold; border-bottom:1px solid #444; margin-bottom:10px; padding-bottom:5px;">🏛️ IMPERIO</div>';

        State.allEntities.forEach(ent => {
            const dbEnt = data.planets[ent.id];
            const isMapped = !!dbEnt;
            const res = isMapped ? dbEnt.resources : null;
            if (res) { totalM += res.metal; totalC += res.crystal; totalD += res.deut; }

            itemsHtml += `
                <div class="p1-item ${isMapped ? 'p1-mapped' : 'p1-unmapped'}">
                    <div style="font-size:10px; display:flex; justify-content:space-between;">
                        <span style="color:${isMapped ? COLORS.mapped : COLORS.unmapped}"><sup>${ent.type === 'moon' ? '🌙' : '🪐'}</sup> ${ent.name}</span>
                        <span style="color:#666">${ent.coords}</span>
                    </div>
                    ${isMapped ? `
                        <div class="p1-res-grid">
                            <div>M: ${Math.floor(res.metal / 1000)}k</div>
                            <div>C: ${Math.floor(res.crystal / 1000)}k</div>
                            <div>D: ${Math.floor(res.deut / 1000)}k</div>
                        </div>
                    ` : `<div style="font-size:8px; color:#555;">PENDIENTE</div>`}
                </div>
            `;
        });

        panel.innerHTML = itemsHtml + `
            <div style="border-top:1px solid #444; margin-top:5px; padding-top:5px; font-size:9px;">
                MT: ${Math.floor(totalM / 1000)}k | CT: ${Math.floor(totalC / 1000)}k | DT: ${Math.floor(totalD / 1000)}k
            </div>
        `;
    }

    function updateHUD() {
        let hud = document.getElementById('p1-hud');
        if (!hud) {
            hud = document.createElement('div');
            hud.id = 'p1-hud';
            hud.className = 'p1-glass';
            hud.style = "position:fixed; bottom:10px; left:10px; width:220px; padding:10px; border-radius:8px; z-index:10000;";
            document.body.appendChild(hud);
        }
        const isAttack = State.fleetEvents.hostile > 0;
        hud.className = `p1-glass ${isAttack ? 'p1-alert' : ''}`;
        hud.innerHTML = `
            <div style="font-size:11px; font-weight:bold; color:${isAttack ? COLORS.unmapped : COLORS.main}">
                ● ${isAttack ? 'ALERTA DE COMBATE' : 'SISTEMA OPERATIVO'}
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:5px; font-size:10px;">
                <span>Propias: ${State.fleetEvents.own}</span>
                <span style="color:${isAttack ? COLORS.unmapped : '#888'}">Enemigas: ${State.fleetEvents.hostile}</span>
            </div>
        `;
    }

    // --- CORE TICK ---
    function coreTick() {
        try {
            scanResources();
            scanFleet();
            scanRightMenu();
            DB.updateSnapshot();
            injectStyles();
            updateEmpirePanel();
            updateHUD();
        } catch (e) { console.error("PASE1 Tick Error:", e); }
    }

    // --- ARRANQUE ---
    const init = setInterval(() => {
        if (document.body) {
            clearInterval(init);
            log("Cuerpo detectado. Iniciando...");
            setInterval(coreTick, 1000);
            coreTick();
        }
    }, 500);

})();
