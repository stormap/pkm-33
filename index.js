/**
 * ===========================================
 * INDEX.JS - UI CONTROLLER & ENTRY POINT
 * ===========================================
 * * Phụ thuộc: pokedex-data.js, moves-data.js, battle-engine.js
 * * Trách nhiệm:
 * - Render UI (Thanh máu, Sprite, Nút bấm)
 * - Xử lý tương tác người dùng
 * - Kiểm soát luồng chiến đấu
 * - Điểm nhập tải JSON
 */

// Trạng thái chiến đấu toàn cục
let battle = new BattleState();
window.battle = battle;  // Xuất ra toàn cục để các module khác truy cập

// ============================================
// 【Hệ thống Cổ Võ v3】Tính toán Hồi chiêu Động
// Dựa trên độ thành thạo của Trainer để quyết định số lượt nghỉ
// ============================================
/**
 * Tính toán lượt hồi chiêu của Style dựa trên độ thành thạo
 * @param {number} proficiency - Độ thành thạo Trainer (0-255)
 * @returns {number} Số lượt hồi chiêu (0-4)
 */
function getStyleCooldown(proficiency) {
    if (proficiency > 200) return 0;  // Tông sư: Khí mạch quán thông, không hồi chiêu
    if (proficiency > 150) return 1;  // Tinh thông: Nhịp điệu chuẩn
    if (proficiency > 100) return 2;  // Quen tay: Hơi trôi chảy
    if (proficiency > 50)  return 3;  // Nhập môn: Nhịp điệu khá chậm
    return 4;                          // Người mới: Chỉ dùng làm đòn kết liễu
}
window.getStyleCooldown = getStyleCooldown;

// ============================================
// 【Hệ thống Chỉ Huy v2】Tính toán Đồng bộ & Hồi chiêu Động
// Tỷ lệ đồng bộ = (Độ thành thạo Trainer + Trung bình 4 chỉ số AVS) / 2
// ============================================
/**
 * Tính tỷ lệ đồng bộ giữa Trainer và Pokémon
 * @param {number} proficiency - Độ thành thạo Trainer (0-255)
 * @param {Pokemon} pokemon - Pokémon hiện tại
 * @returns {number} Tỷ lệ đồng bộ (0-255)
 */
function getCommanderSyncScore(proficiency, pokemon) {
    if (!pokemon || !pokemon.isAce) return 0;
    
    // Lấy giá trị trung bình 4 chỉ số AVS
    let avsAverage = 0;
    if (pokemon.avs) {
        const trust = pokemon.getEffectiveAVs?.('trust') || pokemon.avs.trust || 0;
        const passion = pokemon.getEffectiveAVs?.('passion') || pokemon.avs.passion || 0;
        const insight = pokemon.getEffectiveAVs?.('insight') || pokemon.avs.insight || 0;
        const devotion = pokemon.getEffectiveAVs?.('devotion') || pokemon.avs.devotion || 0;
        avsAverage = (trust + passion + insight + devotion) / 4;
    }
    
    // Tỷ lệ đồng bộ = (Độ thành thạo + AVS trung bình) / 2
    const syncScore = Math.floor((proficiency + avsAverage) / 2);
    return Math.min(255, Math.max(0, syncScore));
}
window.getCommanderSyncScore = getCommanderSyncScore;

/**
 * Tính toán lượt hồi chiêu hệ thống Chỉ Huy dựa trên tỷ lệ đồng bộ
 * @param {number} syncScore - Tỷ lệ đồng bộ (0-255)
 * @returns {number} Số lượt hồi chiêu (1-4, hoặc -1 là không khả dụng)
 */
function getCommanderCooldown(syncScore) {
    if (syncScore < 60)  return -1; // Không khả dụng: Chưa đủ ăn ý
    if (syncScore >= 240) return 1; // Zone: Can thiệp tần suất cao
    if (syncScore >= 180) return 2; // Khá nhạy bén
    if (syncScore >= 120) return 3; // Tương đối ổn định
    return 4;                        // Thỉnh thoảng lóe sáng
}
window.getCommanderCooldown = getCommanderCooldown;

// ============================================
// 【Đã di chuyển】Hệ thống Cổ Võ -> mechanics/move-styles.js
// 【Đã di chuyển】Suy luận Z-Move/Max Move -> mechanics/z-moves.js
// ============================================

// ============================================
// 【Đã di chuyển】HUD Trainer -> ui/ui-trainer-hud.js
// 【Đã di chuyển】Hệ thống Cut-in -> ui/ui-trainer-hud.js
// 【Đã di chuyển】Scale UI -> ui/ui-renderer.js
// ============================================

// Mô phỏng Preload
setTimeout(() => {
    document.getElementById('btn-start').innerText = "START GAME";
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-start').style.fontWeight = "900";
}, 800);

window.addEventListener('resize', updateUIScale);
updateUIScale();

/**
 * Khởi tạo Game - Tải trận đấu mẫu
 */
async function initGame() {
    const startBtn = document.getElementById('btn-start');
    const sysMsg = document.querySelector('.sys-msg');
    
    // === Giai đoạn Preload ===
    startBtn.disabled = true;
    startBtn.innerText = "LOADING...";
    if (sysMsg) sysMsg.textContent = "PRELOADING RESOURCES...";
    
    // Lấy dữ liệu chiến đấu
    const FORCE_USE_DEFAULT_DATA = false;
    
    let json;
    if (!FORCE_USE_DEFAULT_DATA && typeof globalBattleData !== 'undefined' && globalBattleData) {
        json = globalBattleData;
        console.log('[PKM] Sử dụng dữ liệu bên ngoài (globalBattleData)');
    } else {
        json = getDefaultBattleData();
        console.log('[PKM] Sử dụng dữ liệu mặc định (data-loader.js)');
    }
    
    // ============================================
    // 【Switch Hệ thống Toàn cục】Đọc từ JSON settings
    // ============================================
    const settings = json.settings || {};
    window.GAME_SETTINGS = {
        enableAVS: settings.enableAVS !== false,           // Hệ thống AVS (Bond)
        enableCommander: settings.enableCommander !== false, // Hệ thống Chỉ huy Chiến thuật
        enableEVO: settings.enableEVO !== false,           // Hệ thống Tiến hóa/Cộng hưởng
        enableBGM: settings.enableBGM !== false,           // BGM
        enableSFX: settings.enableSFX !== false,           // Hiệu ứng âm thanh
        enableClash: settings.enableClash !== false,       // Hệ thống Đối xung (Clash)
        enableEnvironment: settings.enableEnvironment !== false  // Hệ thống Môi trường/Thời tiết
    };
    console.log('[SETTINGS] System Switches:', window.GAME_SETTINGS);
    
    // Preload tài nguyên trận này
    const playerParty = (json.player && json.player.party) || [];
    const enemyParty = json.party || (json.enemy && json.enemy.party) || [];
    const trainerId = (json.enemy && json.enemy.id) || (json.trainer && json.trainer.id) || null;
    
    if (typeof preloadBattleResources === 'function' && (playerParty.length > 0 || enemyParty.length > 0)) {
        try {
            await preloadBattleResources(playerParty, enemyParty, trainerId, (loaded, total) => {
                if (sysMsg) sysMsg.textContent = `LOADING... ${Math.floor(loaded/total*100)}%`;
            });
        } catch (e) {
            console.warn('[PRELOAD] Error:', e);
        }
    }
    
    if (sysMsg) sysMsg.textContent = "READY!";
    
    // Ẩn trang load, hiện giao diện game
    document.getElementById('start-view').style.opacity = 0;
    setTimeout(() => document.getElementById('start-view').style.display = 'none', 500);
    document.getElementById('game-view').classList.remove('hidden');

    resetSpriteState();
    
    // Khởi tạo hệ thống hiển thị thời tiết
    if (typeof window.initWeatherSystem === 'function') {
        window.initWeatherSystem();
    }

    // Tải JSON chiến đấu
    try {
        console.log('[PKM] Battle Data:', json);
        
        // Tải đội hình người chơi
        if (json.player && json.player.party) {
            // === Hệ thống Mở khóa (Unlock System) ===
            const unlocks = json.player.unlocks || {};
            battle.playerUnlocks = {
                enable_bond: unlocks.enable_bond !== false,        // Cộng hưởng
                enable_styles: unlocks.enable_styles === true,     // Agile/Strong Style (Cần bật thủ công)
                enable_insight: unlocks.enable_insight !== false,  // Insight/AVs Break
                enable_mega: unlocks.enable_mega !== false,        // Mega Evolution
                enable_z_move: unlocks.enable_z_move !== false,    // Z-Move
                enable_dynamax: unlocks.enable_dynamax !== false,  // Dynamax
                enable_tera: unlocks.enable_tera !== false,        // Terastal
                enable_proficiency_cap: unlocks.enable_proficiency_cap === true  // Mở khóa giới hạn thành thạo 155
            };
            console.log('[UNLOCK] Player Unlocks:', battle.playerUnlocks);
            
            // 【Hệ thống Chỉ Huy】Đọc độ thành thạo Trainer
            if (json.player.trainerProficiency !== undefined) {
                const proficiencyCap = battle.playerUnlocks.enable_proficiency_cap ? 255 : 155;
                battle.trainerProficiency = Math.min(proficiencyCap, Math.max(0, json.player.trainerProficiency));
                console.log(`[COMMANDER] Trainer Proficiency: ${battle.trainerProficiency} (Cap: ${proficiencyCap})`);
            }
            
            // 【Hệ thống Chỉ Huy】Khởi tạo
            if (typeof initCommanderSystem === 'function') {
                initCommanderSystem();
            }
            
            const playerCanMega = battle.playerUnlocks.enable_mega;
            battle.setPlayerParty(json.player.party, playerCanMega);
            battle.playerName = json.player.name || 'Player'; // Default English
            log(`<b>${battle.playerName}</b> đã sẵn sàng chiến đấu!`);
            
            // === Kiểm tra hợp thể Necrozma ===
            if (typeof checkAndProcessNecrozmaFusion === 'function') {
                checkAndProcessNecrozmaFusion(battle.playerParty, log, () => {
                    console.log('[NECROZMA FUSION] Player check complete.');
                });
            }
        } else {
            // Fallback: Đội hình mặc định
            battle.setPlayerParty([
                { name: 'Charmander', lv: 5, moves: ['Scratch', 'Ember'] },
                { name: 'Pikachu', lv: 5, moves: ['Thunder Shock', 'Quick Attack'] },
            ], false);
            battle.playerName = 'Player';
        }
        
        // Tải dữ liệu đối thủ
        battle.loadFromJSON(json);
        updateTrainerHud();
        
        const t = battle.trainer;
        const btnCatch = document.getElementById('btn-catch');
        const rightCol = document.getElementById('menu-right-col');
        const catchLayer = document.getElementById('ball-layer');
        if (btnCatch && rightCol) {
            if (t && (t.id === 'wild' || !t.id)) {
                btnCatch.classList.remove('hidden');
                rightCol.classList.remove('two-btn');
            } else {
                btnCatch.classList.add('hidden');
                rightCol.classList.add('two-btn');
                if (catchLayer) catchLayer.classList.add('hidden');
            }
        }
        if (t) {
            const isWild = t.id === 'wild';
            if (isWild) {
                // Ưu tiên hiển thị tên tiếng Anh (.name)
                log(`Wild Pokémon 【${battle.getEnemy().name}】 xuất hiện!`);
            } else {
                log(`<b style="color:#e74c3c">【${t.name}】</b> thách đấu!`);
            }
            if (t.lines?.start) {
                log(`<i>${t.name}: "${t.lines.start}"</i>`);
            }
        }
        // Ưu tiên hiển thị tên tiếng Anh (.name)
        log(`Đối phương tung ra <b>${battle.getEnemy().name}</b> (Lv.${battle.getEnemy().level})!`);
        
        if (battle.scriptedResult === 'loss') {
            log(`<span style="color:#e67e22">[[Cốt truyện] Đây là trận đấu không thể thắng...</span>`);
        }
    } catch (e) {
        console.error('Failed to load battle JSON:', e);
        // Fallback: Trận đấu đơn giản
        battle.setPlayerParty([
            { name: 'Pikachu', lv: 5, moves: ['Thunder Shock', 'Quick Attack'] }
        ]);
        battle.loadFromJSON({
            trainer: { name: 'Wild Pokémon', id: 'wild', line: '' },
            party: [{ name: 'Rattata', lv: 3, moves: ['Tackle'] }]
        });
        log("Wild Rattata xuất hiện!");
    }

    const openingPoke = battle.getPlayer();
    const openingEnemy = battle.getEnemy();
    if (openingPoke) {
        // Ưu tiên hiển thị tên tiếng Anh (.name)
        log(`Lên đi! ${openingPoke.name} (Lv.${openingPoke.level})!`);
    }
    
    // === Phát tiếng kêu Pokémon ===
    setTimeout(() => {
        if (openingPoke && typeof window.playPokemonCry === 'function') {
            window.playPokemonCry(openingPoke.name);
        }
    }, 500);
    setTimeout(() => {
        if (openingEnemy && typeof window.playPokemonCry === 'function') {
            window.playPokemonCry(openingEnemy.name);
        }
    }, 1200);
    
    // === Kiểm tra biến hình khi vào trận (Primal/Crowned) ===
    const checkInitTransformFunc = typeof window.checkInitTransform === 'function' ? window.checkInitTransform : null;
    if (checkInitTransformFunc) {
        // Kiểm tra Player
        if (openingPoke && openingPoke.needsInitTransform) {
            console.log('[FORM] Checking player init transform:', openingPoke.name);
            const result = checkInitTransformFunc(openingPoke);
            if (result) {
                log(`<span style="color:#a855f7">✦ ${result.oldName} biến thành ${result.newName}!</span>`);
                const newSpriteUrl = openingPoke.getSprite(true);
                const preloader = new Image();
                preloader.src = newSpriteUrl;
            }
        }
        
        // Kiểm tra Enemy
        if (openingEnemy && openingEnemy.needsInitTransform) {
            console.log('[FORM] Checking enemy init transform:', openingEnemy.name);
            const result = checkInitTransformFunc(openingEnemy);
            if (result) {
                log(`<span style="color:#ef4444">✦ Đối phương ${result.oldName} biến thành ${result.newName}!</span>`);
                const newSpriteUrl = openingEnemy.getSprite(false);
                const preloader = new Image();
                preloader.src = newSpriteUrl;
            }
        }
    }
    
    // === 【Enemy Lead Necrozma Fusion + Ultra Burst】===
    if (typeof window.autoProcessNecrozmaFusion === 'function' && openingEnemy) {
        const necrozmaName = (openingEnemy.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (necrozmaName === 'necrozma') {
            setTimeout(async () => {
                updateAllVisuals('enemy');
                await new Promise(r => setTimeout(r, 800));
                
                const fusionResult = window.autoProcessNecrozmaFusion(battle.enemyParty, (msg) => {
                    log(msg);
                });
                
                if (fusionResult.success) {
                    const newSpriteUrl = openingEnemy.getSprite ? openingEnemy.getSprite(false) : null;
                    if (newSpriteUrl && typeof window.smartLoadSprite === 'function') {
                        window.smartLoadSprite('enemy-sprite', newSpriteUrl, false);
                    }
                    updateAllVisuals('enemy');
                    setTimeout(() => {
                        if (typeof window.playPokemonCry === 'function') {
                            window.playPokemonCry(openingEnemy.name);
                        }
                    }, 500);
                }
            }, 1500);
        }
    }
    
    setTimeout(() => {
        updateAllVisuals();
    }, 50);
    
    // === Phát BGM Chiến đấu ===
    if (typeof playBattleBgm === 'function') {
        playBattleBgm();
    }
    
    // === Khởi tạo Thời tiết Môi trường ===
    const enableEnv = window.GAME_SETTINGS && window.GAME_SETTINGS.enableEnvironment;
    if (json.environment && json.environment.weather && json.environment.weather !== 'none') {
        const envWeather = json.environment.weather;
        const envTurns = json.environment.weatherTurns || 0;
        const suppressionTier = json.environment.suppressionTier || 1;
        const revertMessage = json.environment.revertMessage || null;
        
        battle.environmentWeather = envWeather;
        battle.weather = envWeather;
        battle.weatherTurns = envTurns; // 0 = vĩnh viễn
        
        battle.environmentConfig = {
            weather: envWeather,
            weatherTurns: envTurns,
            suppressionTier: suppressionTier,
            revertMessage: revertMessage
        };
        
        // Mapping tên thời tiết
        const weatherNames = {
            'rain': 'Trời đổ mưa',
            'sun': 'Ánh nắng trở nên gay gắt',
            'sandstorm': 'Bão cát nổi lên',
            'snow': 'Tuyết bắt đầu rơi',
            'hail': 'Mưa đá rơi xuống',
            'smog': 'Khói bụi bao trùm',
            'fog': 'Sương mù dày đặc',
            'ashfall': 'Tro tàn rơi lả tả',
            'gale': 'Gió lớn thổi mạnh'
        };
        const weatherName = weatherNames[envWeather] || envWeather;
        
        let tierHint = '';
        if (suppressionTier === 2) {
            tierHint = ' <span style="color:#f59e0b">[Khu vực Áp chế]</span>';
        } else if (suppressionTier === 3) {
            tierHint = ' <span style="color:#dc2626">[Lĩnh vực Tuyệt đối]</span>';
        }
        log(`<span style="color:#9b59b6">🌍 Hiệu ứng môi trường: ${weatherName}!${tierHint}</span>`);
        
        if (typeof window.setWeatherVisuals === 'function') {
            window.setWeatherVisuals(envWeather);
        }
        console.log(`[ENVIRONMENT] Init Weather: ${envWeather}, Turns: ${envTurns || 'Forever'}, Tier: ${suppressionTier}`);
    }
    
    // === 【Hệ thống Lớp phủ Môi trường】Khởi tạo ===
    console.log(`[ENV OVERLAY] Check: enableEnv=${enableEnv}, hasEnv=${!!json.environment}, hasOverlay=${!!(json.environment && json.environment.overlay)}`);
    if (enableEnv && json.environment && json.environment.overlay) {
        console.log(`[ENV OVERLAY] Loading overlay...`);
        const overlay = json.environment.overlay;
        
        if (typeof window.clearEnvironmentOverlay === 'function') {
            window.clearEnvironmentOverlay();
        }
        
        if (typeof window.injectEnvironmentOverlay === 'function') {
            const env = window.injectEnvironmentOverlay(overlay);
            
            if (env) {
                log(`<span style="color:#a855f7">🌍 <b>${env.env_name}</b></span>`);
                if (env.narrative) {
                    log(`<span style="color:#a855f7; font-style:italic">${env.narrative}</span>`);
                }
                
                for (const rule of env.rules || []) {
                    const targetDesc = _getTargetDescription(rule.target);
                    const effectsDesc = _getEffectsDescription(rule.effects);
                    if (effectsDesc) {
                        log(`<span style="color:#c084fc">  → ${targetDesc}: ${effectsDesc}</span>`);
                    }
                }
                console.log(`[ENV OVERLAY] Initialized: ${env.env_name}, Rules: ${env.rules?.length || 0}`);
            }
        }
    }
    
    // === Kích hoạt đặc tính khi vào sân (Intimidate, Weather, etc.) ===
    if (openingEnemy) {
        triggerEntryAbilities(openingEnemy, openingPoke);
    }
    if (openingPoke) {
        triggerEntryAbilities(openingPoke, openingEnemy);
    }

    const trainerHud = document.getElementById('trainer-hud');
    if (trainerHud) {
        trainerHud.classList.add('hidden');
        trainerHud.style.opacity = '0';
    }

    const trainer = battle.trainer;
    if (trainer && trainer.id !== 'wild') {
        const introLine = trainer.lines?.start || `${trainer.name || 'Opponent'} is challenging you!`;
        setTimeout(() => {
            playCutIn(introLine, 3500);
            setTimeout(() => {
                updateTrainerHud();
                if (trainerHud) {
                    trainerHud.classList.remove('hidden');
                    trainerHud.style.transition = 'opacity 1s';
                    trainerHud.style.opacity = '1';
                }
            }, 3800);
        }, 500);
    }
    
    // 【Commander System V2】Khởi tạo bong bóng chỉ huy (sau khi load xong)
    if (typeof window.initCommanderSystemV2 === 'function') {
        window.initCommanderSystemV2();
    }
}

// =========================================================
// 【Đã di chuyển】Kiểm tra cơ chế tương thích -> mechanics/mechanic-checker.js
// 【Đã di chuyển】Quản lý trạng thái Dynamax -> mechanics/dynamax.js
// =========================================================

// =========================================================
// 【Đã di chuyển】Dữ liệu chiến đấu mặc định -> systems/data-loader.js
// 【Đã di chuyển】Tải dữ liệu JSON -> systems/data-loader.js
// =========================================================

/* ================= TERA CROWN SYSTEM (Totem Tera Treo) ================= */

const TERA_GEM_PATH = 'm49.996 50.41-15.215 8.7812h30.43zm-16.652 6.3047 15.215-26.355v17.57zm-1.4336 5.3594 18.09 31.332 18.09-31.332zm15.602-35.641-18.09 31.328-18.09-31.328zm41.156 0-18.09 31.332-18.09-31.332zm-61.203 33.676-4.8984-8.4844-9.7969 16.969zm6.332 10.965h-19.59l14.691-8.4805zm37.305-8.4805 14.688 8.4805h-19.586zm6.332-10.973-4.8984 8.4805 14.691 8.4844zm-25.992-28.066h9.7891l-9.7891-16.961zm-12.672 0h9.7891v-16.961zm27.887 33.156-15.215-8.7852v-17.57z';
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/**
 * Kích hoạt Totem Tera (SVG Render)
 * @param {string} type - Hệ Tera (fire, water, grass...)
 * @param {string} targetSide - 'player' | 'enemy'
 */
function triggerTeraCrown(type, targetSide) {
    const wrapper = document.querySelector(`.${targetSide}-pos`);
    if (!wrapper) return;

    // Ngăn kích hoạt trùng lặp
    const existing = wrapper.querySelector('.tera-crown-container');
    if (existing) existing.remove();

    const typeLower = (type || 'normal').toLowerCase();
    const color = (window.TYPE_COLORS && window.TYPE_COLORS[typeLower]) || '#22d3ee';
    const CDN_ICON = `https://cdn.jsdelivr.net/gh/duiker101/pokemon-type-svg-icons/icons/${typeLower}.svg`;

    // 1. Container
    const container = document.createElement('div');
    container.className = 'tera-crown-container';
    if (typeLower === 'stellar') container.classList.add('stellar');
    container.style.setProperty('--tera-color', color);
    container.style.animation = 'tera-crown-spawn 0.8s ease-out forwards, tera-crown-float 4s ease-in-out 0.8s infinite';

    // 2. SVG Layer
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'tera-svg-layer');
    svg.setAttribute('viewBox', '-5 -10 110 135');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.filter = `drop-shadow(0 0 10px ${color})`;

    // 3. Gem Path
    const gemPath = document.createElementNS(SVG_NS, 'path');
    gemPath.setAttribute('class', 'gem-shape');
    gemPath.setAttribute('d', TERA_GEM_PATH);
    gemPath.style.fill = color;
    gemPath.style.fillOpacity = '0.3';
    gemPath.style.stroke = 'white';
    svg.appendChild(gemPath);

    // 4. Icon (Centered)
    const icon = document.createElementNS(SVG_NS, 'image');
    icon.setAttribute('class', 'type-icon-img');
    icon.setAttributeNS(XLINK_NS, 'href', CDN_ICON);
    icon.setAttribute('href', CDN_ICON);
    icon.setAttribute('x', '30');
    icon.setAttribute('y', '27');
    icon.setAttribute('width', '40');
    icon.setAttribute('height', '40');
    icon.style.filter = `brightness(0) invert(1) drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color})`;
    icon.style.opacity = '0.95';
    svg.appendChild(icon);

    // 5. Connector
    const connector = document.createElement('div');
    connector.className = 'tera-connector';
    connector.style.background = `linear-gradient(to top, transparent, ${color} 40%, rgba(255,255,255,0.8) 100%)`;

    // Assemble
    container.appendChild(svg);
    container.appendChild(connector);
    wrapper.appendChild(container);

    // SFX
    if (typeof AudioSys !== 'undefined' && AudioSys.play) {
        AudioSys.play('Hit_Super');
    }

    console.log(`[TERA CROWN] ${targetSide} activated: ${typeLower} (${color})`);
}
window.triggerTeraCrown = triggerTeraCrown;

/**
 * Xóa Totem Tera
 * @param {string} targetSide - 'player' | 'enemy'
 */
function removeTeraCrown(targetSide) {
    const wrapper = document.querySelector(`.${targetSide}-pos`);
    const crown = wrapper?.querySelector('.tera-crown-container');
    if (crown) {
        crown.style.transition = 'opacity 0.5s, transform 0.5s';
        crown.style.opacity = '0';
        crown.style.transform = 'translate(-50%, -20px) scale(0.3)';
        setTimeout(() => crown.remove(), 500);
    }
    console.log(`[TERA CROWN] ${targetSide} removed`);
}
window.removeTeraCrown = removeTeraCrown;

/**
 * Cập nhật Sprite chiến đấu (Cho Imposter/Illusion)
 * Xuất ra window để ability-handlers.js gọi
 */
function updateBattleSprites() {
    updateAllVisuals(false);
}
window.updateBattleSprites = updateBattleSprites;

/**
 * Làm mới giao diện: Render text, HP, hình ảnh
 * @param {string|boolean} forceSpriteAnim - false: không force, 'player': chỉ player, 'enemy': chỉ enemy, true: cả hai
 */
function updateAllVisuals(forceSpriteAnim = false) {
    const p = battle.getPlayer();
    const e = battle.getEnemy();
    
    if (!p || !e) return;

    // 1. Tên & Level (Ưu tiên hiển thị tên tiếng Anh)
    // 【Illusion/Imposter】Hỗ trợ tên giả dạng
    document.getElementById('player-name').innerText = p.name; // FORCE ENGLISH NAME
    document.getElementById('player-lvl').innerText = p.level;
    const enemyNameEl = document.getElementById('enemy-name');
    enemyNameEl.innerText = e.name; // FORCE ENGLISH NAME
    const enemyLvEl = document.getElementById('enemy-lvl');
    enemyLvEl.innerText = e.level;
    enemyLvEl.style.color = (e.level > p.level + 20) ? '#e74c3c' : '';
    enemyLvEl.style.fontWeight = (e.level > p.level + 20) ? '900' : '';

    // 2. Render thanh HP
    renderHp('player', p.currHp, p.maxHp);
    renderHp('enemy', e.currHp, e.maxHp);

    // 3. Tải Sprite (Chống nhấp nháy)
    const playerAnim = (forceSpriteAnim === true || forceSpriteAnim === 'player');
    const enemyAnim = (forceSpriteAnim === true || forceSpriteAnim === 'enemy');
    
    // G-Max không reload sprite
    if (!p.isDynamaxed) {
        const playerSpriteUrl = p.displaySpriteId 
            ? `https://play.pokemonshowdown.com/sprites/ani-back/${p.displaySpriteId}.gif`
            : p.getSprite(true);
        smartLoadSprite('player-sprite', playerSpriteUrl, playerAnim);
    }
    if (!e.isDynamaxed) {
        const enemySpriteUrl = e.displaySpriteId 
            ? `https://play.pokemonshowdown.com/sprites/ani/${e.displaySpriteId}.gif`
            : e.getSprite(false);
        smartLoadSprite('enemy-sprite', enemySpriteUrl, enemyAnim);
    }
    const playerSpriteEl = document.getElementById('player-sprite');
    if (playerSpriteEl) {
        playerSpriteEl.classList.toggle('mega-player', !!p.isMega);
        playerSpriteEl.classList.toggle('mega-enemy', false);
        // Dynamax state
        playerSpriteEl.classList.toggle('state-dynamax', !!p.isDynamaxed);
        
        // Tera state & Colors
        playerSpriteEl.classList.toggle('state-terastal', !!p.isTerastallized);
        const allTeraTypes = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy', 'stellar'];
        allTeraTypes.forEach(type => playerSpriteEl.classList.remove(`tera-type-${type}`));
        
        if (p.isTerastallized && p.teraType) {
            playerSpriteEl.classList.add(`tera-type-${p.teraType.toLowerCase()}`);
            // 【TERA CROWN】Ensure crown exists
            const playerWrapper = playerSpriteEl.closest('.sprite-wrapper');
            if (playerWrapper && !playerWrapper.querySelector('.tera-crown-container')) {
                triggerTeraCrown(p.teraType, 'player');
            }
        } else {
            // 【TERA CROWN】Remove crown
            const playerWrapper = playerSpriteEl.closest('.sprite-wrapper');
            if (playerWrapper && playerWrapper.querySelector('.tera-crown-container')) {
                removeTeraCrown('player');
            }
        }
        
        // Clear Unofficial Mega
        if (!p.isUnofficialMega) {
            playerSpriteEl.classList.remove('unofficial-mega');
        }
        // Bond Resonance
        if (p.hasBondResonance) {
            playerSpriteEl.classList.add('bond-resonance');
            playerSpriteEl.style.filter = 'drop-shadow(0 0 12px gold) brightness(1.1) saturate(1.15)';
        } else {
            playerSpriteEl.classList.remove('bond-resonance');
            if (playerSpriteEl.style.filter && playerSpriteEl.style.filter.includes('gold')) {
                playerSpriteEl.style.filter = '';
            }
        }
    }
    const enemySpriteEl = document.getElementById('enemy-sprite');
    if (enemySpriteEl) {
        enemySpriteEl.classList.toggle('mega-enemy', !!e.isMega);
        enemySpriteEl.classList.toggle('mega-player', false);
        // Dynamax state
        enemySpriteEl.classList.toggle('state-dynamax', !!e.isDynamaxed);
        
        // Tera state & Colors
        enemySpriteEl.classList.toggle('state-terastal', !!e.isTerastallized);
        const allTeraTypes = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy', 'stellar'];
        allTeraTypes.forEach(type => enemySpriteEl.classList.remove(`tera-type-${type}`));
        
        if (e.isTerastallized && e.teraType) {
            enemySpriteEl.classList.add(`tera-type-${e.teraType.toLowerCase()}`);
            // 【TERA CROWN】Ensure crown exists
            const enemyWrapper = enemySpriteEl.closest('.sprite-wrapper');
            if (enemyWrapper && !enemyWrapper.querySelector('.tera-crown-container')) {
                triggerTeraCrown(e.teraType, 'enemy');
            }
        } else {
            // 【TERA CROWN】Remove crown
            const enemyWrapper = enemySpriteEl.closest('.sprite-wrapper');
            if (enemyWrapper && enemyWrapper.querySelector('.tera-crown-container')) {
                removeTeraCrown('enemy');
            }
        }
        
        // Clear Unofficial Mega
        if (!e.isUnofficialMega) {
            enemySpriteEl.classList.remove('unofficial-mega');
        }
        
        // Bond Resonance
        if (e.hasBondResonance) {
            enemySpriteEl.classList.add('bond-resonance');
            enemySpriteEl.style.filter = 'drop-shadow(0 0 12px gold) brightness(1.1) saturate(1.15)';
        } else {
            enemySpriteEl.classList.remove('bond-resonance');
            if (enemySpriteEl.style.filter && enemySpriteEl.style.filter.includes('gold')) {
                enemySpriteEl.style.filter = '';
            }
        }
    }

    // 4. Party Dots
    renderDots('ui-player-dots', battle.playerParty, battle.playerActive);
    renderDots('ui-enemy-dots', battle.enemyParty, battle.enemyActive);

    updateTrainerHud();

    // 5. Nút bấm
    document.getElementById('switch-menu-layer').classList.add('hidden');

    if (p.currHp <= 0) {
        // Chết, chờ thay người
    } else {
        // Render nút skill
        const btnIds = ['btn-m0', 'btn-m1', 'btn-m2', 'btn-m3'];
        btnIds.forEach((id, i) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            
            // Reset style
            btn.className = 'action-btn';
            btn.style.opacity = '1';
            
            if (i < p.moves.length) {
                const m = p.moves[i];
                
                // =========================================================
                // Tự động suy luận Z-Move / Max Move
                // =========================================================
                const mId = (m.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const mData = (typeof MOVES !== 'undefined' && MOVES[mId]) ? MOVES[mId] : {};
                
                const zTarget = getZMoveTarget(m, p);
                const maxTarget = p.isDynamaxed ? getMaxMoveTarget(m, p) : null;
                
                const showZStyle = zTarget && !battle.playerZUsed;
                const showMaxStyle = maxTarget !== null;
                
                // Logic Vô hiệu hóa
                let isDisabled = false;
                if (showZStyle && battle.playerZUsed) isDisabled = true;
                
                // Disable / Cursed Body
                if (p.volatile && p.volatile.disable > 0 && p.volatile.disabledMove) {
                    if (m.name === p.volatile.disabledMove) {
                        isDisabled = true;
                        console.log(`[DISABLE UI] ${m.name} bị phong ấn`);
                    }
                }
                
                // Grudge
                if (p.volatile && p.volatile.grudgeSealed && p.volatile.grudgeSealed.includes(m.name)) {
                    isDisabled = true;
                    console.log(`[GRUDGE UI] ${m.name} bị Grudge phong ấn`);
                }
                
                // PP System
                if (m.pp !== undefined && m.pp <= 0) {
                    isDisabled = true;
                    console.log(`[PP UI] ${m.name} hết PP`);
                }
                
                // Environment Ban
                let envBanned = false;
                if (typeof window.envOverlay !== 'undefined' && window.envOverlay.isMoveBanned) {
                    if (window.envOverlay.isMoveBanned(p, m)) {
                        isDisabled = true;
                        envBanned = true;
                        console.log(`[ENV BAN UI] ${m.name} bị môi trường cấm`);
                    }
                }
                
                // Tên hiển thị (Ưu tiên tiếng Anh)
                let displayName = m.name; // FORCE ENGLISH MOVE NAME
                let displayType = m.type || 'Normal';
                
                if (showZStyle) {
                    // Z Move
                    displayName = zTarget.name; // FORCE ENGLISH Z-MOVE NAME
                    displayType = zTarget.type;
                } else if (showMaxStyle) {
                    // Max Move
                    displayName = maxTarget.name; // FORCE ENGLISH MAX-MOVE NAME
                    displayType = maxTarget.type;
                }
                
                // =========================================================
                // 【Hệ thống Insight】Gợi ý khắc hệ
                // =========================================================
                let insightHint = '';
                const insightUnlocked = battle.playerUnlocks && battle.playerUnlocks.enable_insight !== false;
                if (insightUnlocked && e && e.types) {
                    const moveType = displayType || m.type || 'Normal';
                    const eff = window.getTypeEffectiveness ? 
                        window.getTypeEffectiveness(moveType, e.types) : 1;
                    if (eff === 0) {
                        insightHint = '<span class="insight-hint insight-immune" title="Vô hiệu">×</span>';
                    } else if (eff >= 2) {
                        insightHint = '<span class="insight-hint insight-super" title="Hiệu quả">▲</span>';
                    } else if (eff <= 0.5) {
                        insightHint = '<span class="insight-hint insight-resist" title="Không hiệu quả">▼</span>';
                    }
                }
                
                const typeKey = (displayType || 'normal').toLowerCase();
                const typeSvgPath = `./data/svg/${typeKey}.svg`;
                const typeNameEN = displayType;
                
                btn.setAttribute('data-type', typeKey);
                
                if (showZStyle || showMaxStyle) {
                    // Style đặc biệt
                    if (showZStyle) {
                        btn.classList.add('z-move-btn');
                    } else {
                        btn.classList.add('max-move-btn');
                    }
                    
                    if (isDisabled) {
                        btn.classList.add('z-move-used');
                    }
                    
                    const labelText = showZStyle ? 'Z' : '';
                    btn.innerHTML = `
                        <div class="deco-bar"></div>
                        <div class="content-unskew">
                            <div class="z-badge-icon">${labelText}</div>
                            <div class="icon-circle">
                                <img src="${typeSvgPath}" alt="${typeKey}">
                            </div>
                            <div class="text-group">
                                <span class="move-name">${displayName}${insightHint}</span>
                                <span class="move-type-name">${typeNameEN.toUpperCase()}</span>
                            </div>
                            <div class="bg-watermark">
                                <img src="${typeSvgPath}">
                            </div>
                        </div>
                    `;
                } else {
                    // Skill thường
                    const ppCur = m.pp !== undefined ? m.pp : '?';
                    const ppMax = m.maxPp !== undefined ? m.maxPp : '?';
                    const ppRatio = (typeof ppCur === 'number' && typeof ppMax === 'number' && ppMax > 0) ? ppCur / ppMax : 1;
                    const ppColorClass = ppCur === 0 ? 'pp-zero' : ppRatio <= 0.25 ? 'pp-critical' : ppRatio <= 0.5 ? 'pp-low' : '';
                    btn.innerHTML = `
                        <div class="deco-bar"></div>
                        <div class="content-unskew">
                            <div class="icon-circle">
                                <img src="${typeSvgPath}" alt="${typeKey}">
                            </div>
                            <div class="text-group">
                                <span class="move-name">${displayName}${insightHint}</span>
                                <span class="move-type-name">${typeNameEN.toUpperCase()}</span>
                            </div>
                            <div class="bg-watermark">
                                <img src="${typeSvgPath}">
                            </div>
                        </div>
                        <span class="pp-badge ${ppColorClass}">${ppCur}/${ppMax}</span>
                    `;
                }
                
                // Sự kiện Click
                if (isDisabled) {
                    btn.disabled = true;
                    btn.onclick = null;
                } else {
                    btn.disabled = false;
                    if (showZStyle) {
                        btn.onclick = () => handleAttack(i, { useZ: true, zTarget: zTarget });
                    } else {
                        btn.onclick = () => handleAttack(i);
                    }
                }
                btn.style.visibility = 'visible';
                
            } else {
                btn.disabled = true;
                btn.style.visibility = 'hidden';
                btn.innerHTML = '<span class="move-name">---</span><span class="move-type">---</span>';
            }
        });
        
        // 【Struggle Check】
        const allBtns = btnIds.map(id => document.getElementById(id)).filter(b => b);
        const allDisabled = allBtns.every(btn => btn.disabled || btn.style.visibility === 'hidden');
        if (allDisabled && p.moves.length > 0) {
            const struggleBtn = allBtns[0];
            if (struggleBtn) {
                struggleBtn.disabled = false;
                struggleBtn.style.visibility = 'visible';
                struggleBtn.style.opacity = '0.7';
                struggleBtn.setAttribute('data-type', 'normal');
                struggleBtn.innerHTML = `
                    <div class="deco-bar"></div>
                    <div class="content-unskew">
                        <div class="icon-circle">
                            <img src="./data/svg/normal.svg" alt="normal">
                        </div>
                        <div class="text-group">
                            <span class="move-name" style="color:#ef4444">Struggle</span>
                            <span class="move-type-name">NORMAL</span>
                        </div>
                        <div class="bg-watermark">
                            <img src="./data/svg/normal.svg">
                        </div>
                    </div>
                `;
                struggleBtn.onclick = () => handleStruggle();
                console.log('[ENV BAN] All moves banned, enable Struggle');
            }
        }
    }
    
    // 6. Cập nhật nút Evolution
    if (typeof updateEvolutionButtonVisuals === 'function') {
        updateEvolutionButtonVisuals();
    }
    
    // 7. 【Hệ thống Clash】Cập nhật Insight Bar
    if (typeof window.updateInsightBar === 'function' && window.GAME_SETTINGS?.enableClash !== false) {
        window.updateInsightBar(p);
        
        const insightBar = document.getElementById('insight-bar');
        if (insightBar) {
            const hasInsight = p.isAce && p.avs && (p.avs.insight > 0 || (typeof p.getEffectiveAVs === 'function' && p.getEffectiveAVs('insight') > 0));
            insightBar.classList.toggle('active', hasInsight);
        }
    }
}

// ============================================
// 【Đã di chuyển】Load Sprite -> ui/ui-sprites.js
// 【Đã di chuyển】Render HP/Ball -> ui/ui-renderer.js
// ============================================

/**
 * Xử lý "Struggle" (Khi bị cấm hết chiêu)
 */
async function handleStruggle() {
    if (typeof window.playSFX === 'function') window.playSFX('CONFIRM');
    if (battle.locked) return;
    battle.locked = true;
    
    showMainMenu();
    
    const p = battle.getPlayer();
    const e = battle.getEnemy();
    
    const struggleMove = { 
        name: 'Struggle', 
        cn: 'Struggle', 
        power: 50, 
        type: 'Normal', 
        cat: 'phys',
        accuracy: 100,
        flags: { contact: 1 }
    };
    
    log(`<span style="color:#ef4444">🌍 ${p.name} bị áp chế, chỉ có thể vùng vẫy (Struggle)!</span>`);
    
    if (typeof window.executePlayerTurn === 'function') {
        await window.executePlayerTurn(p, e, struggleMove);
    }
    
    // Phản thương 1/4 HP
    const recoil = Math.floor(p.maxHp / 4);
    p.takeDamage(recoil);
    log(`<span style="color:#e74c3c">${p.name} chịu ${recoil} sát thương phản hồi!</span>`);
    
    updateAllVisuals();
    
    if (battle.checkBattleEnd()) {
        battle.locked = false;
        return;
    }
    
    if (typeof window.handleAITurn === 'function') {
        await window.handleAITurn();
    }
    
    if (typeof window.executeEndPhase === 'function') {
        await window.executeEndPhase();
    }
    
    battle.locked = false;
    showMovesMenu();
}

/**
 * Logic cốt lõi: Tấn công (Hỗ trợ ưu tiên)
 * @param {number} moveIndex Index chiêu thức
 * @param {object} options Tham số { useZ: boolean, zConfig: object }
 */
async function handleAttack(moveIndex, options = {}) {
    if (typeof window.playSFX === 'function') window.playSFX('CONFIRM');
    if (battle.locked) return;
    battle.locked = true;
    
    if (typeof window.onTurnStart === 'function') {
        window.onTurnStart();
    }
    
    // 【Commander】Trigger lệnh đã nạp
    if (typeof window.triggerArmedCommand === 'function') {
        window.triggerArmedCommand();
    }
    
    // 【Evolution】Trigger tiến hóa đã nạp
    const evoArmedThisTurn = battle.evoArmed;
    if (evoArmedThisTurn) {
        battle.evoArmed = null;
    }
    
    const megaArmedThisTurn = battle.playerMegaArmed;
    
    showMainMenu();

    let p = battle.getPlayer();
    let e = battle.getEnemy();
    let playerMove = p.moves[moveIndex];
    
    // === Kiểm tra Taunt/Volatile ===
    if (typeof MoveEffects !== 'undefined' && MoveEffects.canUseMove) {
        const canUseResult = MoveEffects.canUseMove(p, playerMove);
        if (!canUseResult.canUse) {
            log(`<span style="color:#e74c3c">${canUseResult.reason}</span>`);
            battle.locked = false;
            return;
        }
    }
    
    // === Kiểm tra Môi trường cấm ===
    if (typeof window.envOverlay !== 'undefined' && window.envOverlay.isMoveBanned) {
        if (window.envOverlay.isMoveBanned(p, playerMove)) {
            log(`<span style="color:#a855f7">🌍 ${playerMove.name} không thể sử dụng trong môi trường này!</span>`);
            battle.locked = false;
            return;
        }
    }
    
    // =========================================================
    // 【BUG FIX】Choice Item Lock
    // =========================================================
    const pItem = p.item || '';
    const pIsChoiceItem = pItem.includes('Choice') || pItem.includes('Khăn chọn');
    if (pIsChoiceItem) {
        const _isStatusMove = (moveName) => {
            if (!moveName) return false;
            const mid = moveName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const mdata = (typeof MOVES !== 'undefined' && MOVES[mid]) ? MOVES[mid] : null;
            return mdata && (mdata.category === 'Status' || mdata.basePower === 0);
        };
        
        if (p.choiceLockedMove) {
            if (_isStatusMove(p.choiceLockedMove)) {
                console.log(`[CHOICE FIX] Clear status move lock: ${p.choiceLockedMove}`);
                delete p.choiceLockedMove;
            } else {
                const lockedMoveObj = p.moves.find(m => m.name === p.choiceLockedMove);
                if (lockedMoveObj && playerMove.name !== p.choiceLockedMove) {
                    console.log(`[CHOICE ENFORCE] Tried ${playerMove.name}, locked to ${p.choiceLockedMove}`);
                    log(`<span style="color:#e74c3c">${p.name} bị ${pItem} khóa vào ${lockedMoveObj.name}!</span>`);
                    playerMove = lockedMoveObj;
                }
            }
        }
        if (!p.choiceLockedMove) {
            if (!_isStatusMove(playerMove.name)) {
                p.choiceLockedMove = playerMove.name;
                console.log(`[CHOICE LOCK] Locked to ${playerMove.name}`);
            }
        }
    }
    
    // =========================================================
    // Choice + Torment Fix
    // =========================================================
    if (typeof MoveEffects !== 'undefined' && MoveEffects.canUseMove) {
        const postChoiceCheck = MoveEffects.canUseMove(p, playerMove);
        if (!postChoiceCheck.canUse) {
            console.log(`[CHOICE+TORMENT] Locked but cant use: ${postChoiceCheck.reason}`);
            log(`<span style="color:#e74c3c">${postChoiceCheck.reason}</span>`);
            playerMove = { name: 'Struggle', cn: 'Struggle', power: 50, type: 'Normal', cat: 'phys', accuracy: true, flags: { contact: 1 } };
            log(`<span style="color:#ef4444">${p.name} chỉ còn cách vùng vẫy!</span>`);
        }
    }
    
    // =========================================================
    // Z-Move Logic
    // =========================================================
    if (options.useZ && options.zTarget && !battle.playerZUsed) {
        if (p.isMega || p.isDynamaxed || p.hasBondResonance) {
            console.warn(`[CHEAT BLOCK] Attempted Z-Move while Mega/Dynamax.`);
            log(`<b style="color:#aaa">...nhưng hình thái hiện tại không thể tung ra Z-Power!</b>`);
        } else {
            // Ultra Burst Check
            if (typeof canUltraBurst === 'function' && canUltraBurst(p)) {
                const burstResult = executeUltraBurst(p);
                if (burstResult.success) {
                    burstResult.logs.forEach(msg => log(msg));
                    updateAllVisuals('player');
                    await wait(800);
                    p = battle.getPlayer();
                }
            }
            
            const zTarget = options.zTarget;
            const zMoveId = zTarget.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const zMoveData = (typeof MOVES !== 'undefined' && MOVES[zMoveId]) ? MOVES[zMoveId] : {};
            
            playerMove = {
                name: zTarget.name,
                cn: zTarget.name, // Force English
                type: zTarget.type || playerMove.type || 'Normal',
                power: zTarget.power || 180,
                basePower: zTarget.power || 180,
                accuracy: 100,
                pp: 1,
                isZ: true,
                priority: zMoveData.priority || 0,
                cat: zMoveData.category === 'Physical' ? 'phys' : 'spec',
                category: zMoveData.category || 'Special'
            };
            
            // Ambrosia Check
            if (typeof window.WeatherEffects !== 'undefined' && window.WeatherEffects.checkNeuroBacklash) {
                const currentWeather = battle?.weather || '';
                const neuroResult = window.WeatherEffects.checkNeuroBacklash(currentWeather, 'zmove', p, null);
                if (neuroResult.shouldTrigger) {
                    p.volatile = p.volatile || {};
                    p.volatile.neuroBacklash = true;
                    log(neuroResult.message);
                }
            }
            
            console.log(`[Z-MOVE] Auto Z: ${playerMove.name}`);
        }
    }
    
    // =========================================================
    // 【Style System v2.1】Agile / Strong
    // =========================================================
    let currentMoveStyle = window.currentMoveStyle || 'normal';
    console.log(`[STYLES] Current: ${currentMoveStyle}`);
    
    if (currentMoveStyle !== 'normal' && battle.playerUnlocks?.enable_styles) {
        // Chronal Rift Check
        let isUnboundArts = false;
        let unboundModifier = null;
        if (typeof window.WeatherEffects !== 'undefined' && window.WeatherEffects.getUnboundArtsModifier) {
            const weather = battle?.weather || battle?.environmentWeather || '';
            unboundModifier = window.WeatherEffects.getUnboundArtsModifier(weather, currentMoveStyle, p, e);
            isUnboundArts = unboundModifier.active;
        }
        
        // Cooldown Check
        if (battle.playerStyleCooldown > 0 && !isUnboundArts) {
            log(`<span style="color:#aaa">Style System đang hồi, chỉ dùng được chiêu thường.</span>`);
            currentMoveStyle = 'normal';
        } else {
            const originalPower = playerMove.basePower || playerMove.power || 0;
            const originalPriority = playerMove.priority || 0;
            const originalAccuracy = playerMove.accuracy;
            const isStatus = (playerMove.category === 'Status' || playerMove.cat === 'status' || originalPower === 0);
            
            let mySpe = (typeof p.getStat === 'function') ? p.getStat('spe') : (p.spe || 100);
            let enemySpe = (typeof e.getStat === 'function') ? e.getStat('spe') : (e.spe || 100);
            if (p.status === 'par') mySpe = Math.floor(mySpe * 0.5);
            if (e.status === 'par') enemySpe = Math.floor(enemySpe * 0.5);
            
            const isTrickRoom = battle.field && battle.field.trickRoom > 0;
            let haveSpeedAdvantage = false;
            if (isTrickRoom) {
                haveSpeedAdvantage = mySpe < enemySpe;
            } else {
                haveSpeedAdvantage = mySpe > enemySpe;
            }
            
            // ============================================
            // Unbound Arts
            // ============================================
            if (isUnboundArts && unboundModifier) {
                playerMove = { ...playerMove };
                playerMove.styleUsed = currentMoveStyle;
                
                if (currentMoveStyle === 'agile') {
                    playerMove.priority = originalPriority + unboundModifier.priorityMod;
                    playerMove.basePower = Math.floor(originalPower * unboundModifier.damageMultiplier);
                    playerMove.power = playerMove.basePower;
                    log(unboundModifier.message);
                } else if (currentMoveStyle === 'strong') {
                    playerMove.priority = originalPriority + unboundModifier.priorityMod;
                    playerMove.basePower = Math.floor(originalPower * unboundModifier.damageMultiplier);
                    playerMove.power = playerMove.basePower;
                    playerMove.breaksProtect = true;
                    const oldAcc = (typeof originalAccuracy === 'number') ? originalAccuracy : 100;
                    if (originalAccuracy !== true && oldAcc < 101) {
                        playerMove.accuracy = Math.floor(oldAcc * unboundModifier.accuracyMultiplier);
                    }
                    log(unboundModifier.message);
                }
            }
            // ============================================
            // ⚡ Agile Style
            // ============================================
            else if (currentMoveStyle === 'agile') {
                if (isStatus) {
                    log(`<span style="color:#aaa">Chiêu Status không dùng được Agile Style!</span>`);
                    currentMoveStyle = 'normal';
                } else {
                    playerMove = { ...playerMove };
                    playerMove.priority = originalPriority + 1;
                    playerMove.styleUsed = 'agile';
                    
                    const oldAcc = (typeof originalAccuracy === 'number') ? originalAccuracy : 100;
                    
                    if (haveSpeedAdvantage) {
                        // A: Có lợi thế tốc độ
                        playerMove.basePower = Math.floor(originalPower * 0.75);
                        playerMove.accuracy = Math.floor(oldAcc * 0.9);
                        log(`<span style="color:#3b82f6">⚡ Agile Style: Đảm bảo đi trước nhờ lợi thế tốc độ - Uy lực×0.75, Chính xác×0.9</span>`);
                    } else {
                        // B: Không lợi thế tốc độ
                        playerMove.basePower = Math.floor(originalPower * 0.50);
                        playerMove.accuracy = Math.floor(oldAcc * 0.85);
                        log(`<span style="color:#60a5fa">⚡ Agile Style: Đảo ngược thứ tự hành động - Uy lực×0.50, Chính xác×0.85</span>`);
                    }
                    playerMove.power = playerMove.basePower;
                    
                    const proficiency = battle.trainerProficiency ?? 0;
                    const styleCooldown = getStyleCooldown(proficiency);
                    battle.playerStyleCooldown = styleCooldown;
                    if (styleCooldown > 0) {
                        console.log(`[STYLES v3] Nghỉ: ${styleCooldown} lượt`);
                    }
                }
            } 
            // ============================================
            // 💪 Strong Style
            // ============================================
            else if (currentMoveStyle === 'strong') {
                playerMove = { ...playerMove };
                playerMove.priority = originalPriority - 1;
                playerMove.basePower = Math.floor(originalPower * 1.30);
                playerMove.power = playerMove.basePower;
                playerMove.breaksProtect = true;
                playerMove.styleUsed = 'strong';
                
                if (!haveSpeedAdvantage) {
                    // A: Chậm hơn
                    const oldAcc = (typeof originalAccuracy === 'number') ? originalAccuracy : 100;
                    playerMove.accuracy = Math.floor(oldAcc * 0.8);
                    log(`<span style="color:#ef4444">💪 Strong Style: Cường công khi thất thế - Uy lực×1.3, Chính xác×0.8</span>`);
                } else {
                    // B: Nhanh hơn
                    log(`<span style="color:#b91c1c">💪 Strong Style: Bỏ qua lượt đi trước, toàn lực tấn công! (Uy lực×1.3, Xuyên thủng bảo vệ)</span>`);
                }
                
                const proficiency = battle.trainerProficiency ?? 0;
                const styleCooldown = getStyleCooldown(proficiency);
                battle.playerStyleCooldown = styleCooldown;
                if (styleCooldown > 0) {
                    console.log(`[STYLES v3] Nghỉ: ${styleCooldown} lượt`);
                }
            }
            // ============================================
            // 🎯 Focus Style
            // ============================================
            else if (currentMoveStyle === 'focus') {
                if (isStatus) {
                    log(`<span style="color:#aaa">Chiêu Status không dùng được Focus Style!</span>`);
                    currentMoveStyle = 'normal';
                } else {
                    playerMove = { ...playerMove };
                    playerMove.styleUsed = 'focus';
                    playerMove.accuracy = true;
                    playerMove.bypassAccuracyCheck = true;
                    
                    log(`<span style="color:#a855f7">🎯 Focus Style: Tập trung tuyệt đối, đòn đánh tất trúng!</span>`);
                    
                    const proficiency = battle.trainerProficiency ?? 0;
                    const styleCooldown = getStyleCooldown(proficiency);
                    battle.playerStyleCooldown = styleCooldown;
                    if (styleCooldown > 0) {
                        console.log(`[STYLES v3] Nghỉ: ${styleCooldown} lượt`);
                    }
                }
            }
        }
        
        window.currentMoveStyle = 'normal';
        if (typeof setMoveStyle === 'function') setMoveStyle('normal');
        if (typeof window.refreshCommanderBubble === 'function') window.refreshCommanderBubble();
    }

    // === PP System ===
    if (window.PPSystem && playerMove) {
        const ppResult = window.PPSystem.deductPP(p, playerMove, e);
        if (ppResult && ppResult.logs) ppResult.logs.forEach(msg => log(msg));
    }

    // === Clear Protect ===
    if (p.volatile) p.volatile.protect = false;
    if (e.volatile) e.volatile.protect = false;

    // === Mega/Dynamax Process ===
    const canMegaEvolveFunc = window.canMegaEvolve;
    const performMegaEvolutionFunc = window.performMegaEvolution;
    
    const isDynamaxMode = p && p.mechanic !== 'mega' && (p.canDynamax || (p.megaTargetId && p.megaTargetId.toLowerCase().includes('gmax')));
    
    if (megaArmedThisTurn && isDynamaxMode && !battle.playerMaxUsed && !p.isDynamaxed) {
        // === DYNAMAX ===
        battle.playerMegaArmed = false;
        battle.playerMaxUsed = true;
        
        const oldName = p.name;
        const oldMaxHp = p.maxHp;
        const oldCurrHp = p.currHp;
        
        log(`<div style="border-bottom: 2px solid #e11d48; margin-bottom: 5px;"></div>`);
        log(`<b style="font-size:1.2em; color:#e11d48">▂▃▅▆▇ DYNAMAX !!! ▇▆▅▃▂</b>`);
        log(`Cơ thể của ${oldName} bắt đầu biến lớn! Như muốn chọc thủng bầu trời!`);
        
        await wait(600);
        await playDynamaxAnimation(p, true);
        
        // G-Max check
        const gmaxFormId = p.megaTargetId;
        if (gmaxFormId && gmaxFormId.includes('gmax') && !p.isGenericDynamax) {
            p.originalName = p.name;
            const baseName = gmaxFormId.replace(/gmax$/i, '');
            const formattedName = baseName.charAt(0).toUpperCase() + baseName.slice(1) + '-Gmax';
            p.name = formattedName; // English G-Max Name
            p.cnName = formattedName; // Ensure consistency
            
            const gmaxSpriteId = gmaxFormId.replace(/gmax$/i, '-gmax');
            const gmaxSpriteUrl = `https://play.pokemonshowdown.com/sprites/ani-back/${gmaxSpriteId}.gif`;
            smartLoadSprite('player-sprite', gmaxSpriteUrl, true);
        } else if (p.isGenericDynamax) {
            console.log(`[DYNAMAX] Generic Dynamax, keeping sprite: ${p.name}`);
        }
        
        const hpMultiplier = 1.5;
        p.maxHp = Math.floor(oldMaxHp * hpMultiplier);
        p.currHp = Math.floor(oldCurrHp * hpMultiplier);
        
        p.isDynamaxed = true;
        p.dynamaxTurns = 3;
        p.preDynamaxMaxHp = oldMaxHp;
        p.preDynamaxCurrHp = oldCurrHp;
        
        applyDynamaxState(p, true);
        playerMove = p.moves[moveIndex]; // Re-fetch
        
        log(`<b style="color:#e11d48">${oldName} đã Dynamax! (HP x${hpMultiplier})</b>`);
        log(`<span style="color:#ff6b8a">[Số lượt Dynamax còn lại: ${p.dynamaxTurns}]</span>`);
        
        updateAllVisuals('player');
        await wait(800);
        if (typeof window.refreshCommanderBubble === 'function') window.refreshCommanderBubble();
        
    } else if (megaArmedThisTurn && canMegaEvolveFunc && canMegaEvolveFunc(p) && !battle.playerMegaUsed && p.mechanic !== 'tera') {
        // === MEGA EVOLUTION ===
        battle.playerMegaArmed = false;
        battle.playerMegaUsed = true;
        
        const oldName = p.name;
        log(`<div style="border-bottom: 2px solid #c084fc; margin-bottom: 5px;"></div>`);
        log(`Đá Mega của ${oldName} phản ứng với Key Stone của ${battle.playerName || 'Trainer'}!`);
        
        await wait(600);
        const megaResult = performMegaEvolutionFunc(p);
        
        if (megaResult) {
            await playMegaEvolutionAnimation(p, true);
            log(`<b style="color:#d8b4fe">${oldName} đã Mega Evolve thành ${megaResult.newName}!</b>`);
            
            if (megaResult.typeChanged) {
                log(`<span style="font-size:0.9em; color:#9ca3af;">${megaResult.newName} chuyển thành hệ ${megaResult.newTypes.join('/')}!</span>`);
            }
            if (megaResult.abilityChanged && megaResult.newAbility) {
                log(`<span style="font-size:0.9em; color:#9ca3af;">Nhận đặc tính <b>${megaResult.newAbility}</b>!</span>`);
                triggerEntryAbilities(p, e);
            }
        }
        updateAllVisuals('player');
        await wait(800);
        if (typeof window.refreshCommanderBubble === 'function') window.refreshCommanderBubble();
        
    } else if (megaArmedThisTurn && p.mechanic === 'tera' && p.canTera && !battle.playerTeraUsed && !p.isTerastallized) {
        // === TERASTAL ===
        battle.playerMegaArmed = false;
        battle.playerTeraUsed = true;
        
        const oldName = p.name;
        const oldTypes = [...p.types];
        const teraType = p.teraType;
        
        log(`<div style="border-bottom: 2px solid #22d3ee; margin-bottom: 5px;"></div>`);
        log(`<b style="font-size:1.2em; color:#22d3ee">💎 TERASTALLIZE !!! 💎</b>`);
        log(`Cơ thể ${oldName} bắt đầu kết tinh! Tỏa sáng ánh sáng hệ ${teraType}!`);
        
        await wait(600);
        
        const playerSprite = document.getElementById('player-sprite');
        if (playerSprite) {
            playerSprite.classList.add('tera-burst', `tera-type-${teraType.toLowerCase()}`);
            await wait(800);
            playerSprite.classList.remove('tera-burst');
            playerSprite.classList.add('state-terastal');
        }
        
        p.isTerastallized = true;
        p.originalTypes = oldTypes;
        p.types = [teraType];
        
        if (typeof window.WeatherEffects !== 'undefined' && window.WeatherEffects.checkNeuroBacklash) {
            const currentWeather = battle?.weather || '';
            const neuroResult = window.WeatherEffects.checkNeuroBacklash(currentWeather, 'terastal', p, null);
            if (neuroResult.shouldTrigger) {
                p.volatile = p.volatile || {};
                p.volatile.neuroBacklash = true;
                log(neuroResult.message);
            }
        }
        
        log(`<b style="color:#22d3ee">${oldName} đã Terastallize!</b>`);
        log(`<span style="color:#67e8f9">Thay đổi hệ: ${oldTypes.join('/')} → <b>${teraType}</b></span>`);
        
        updateAllVisuals('player');
        await wait(800);
        if (typeof window.refreshCommanderBubble === 'function') window.refreshCommanderBubble();
    }
    
    // === Player Evo Trigger ===
    if (evoArmedThisTurn && typeof window.triggerBattleEvolution === 'function') {
        await window.triggerBattleEvolution();
        if (typeof window.refreshCommanderBubble === 'function') window.refreshCommanderBubble();
    }
    
    // =====================================================
    // === ENEMY AI TRIGGERS ===
    // =====================================================
    const enemyUnlocks = battle.enemyUnlocks || {};
    const isEnemyDynamax = (e.mechanic === 'dynamax') || (e.evolutionType === 'dynamax') || (e.canDynamax && e.mechanic !== 'mega' && e.mechanic !== 'tera') || (e.megaTargetId && e.megaTargetId.includes('gmax') && e.mechanic !== 'mega');
    
    const canEnemyMega = enemyUnlocks.enable_mega && e.mechanic === 'mega' && (canMegaEvolveFunc && canMegaEvolveFunc(e));
    const canEnemyDynamax = enemyUnlocks.enable_dynamax && isEnemyDynamax && !e.isDynamaxed;
    
    const shouldTriggerMega = canEnemyMega && !battle.enemyMegaUsed;
    const shouldTriggerDynamax = canEnemyDynamax && !battle.enemyMaxUsed;
    
    // === Enemy Dynamax ===
    if (shouldTriggerDynamax) {
        battle.enemyMaxUsed = true;
        const oldEnemyName = e.name;
        const oldMaxHp = e.maxHp;
        const oldCurrHp = e.currHp;
        const trainerName = battle.trainer?.name || 'Đối thủ';
        
        if (battle.trainer && battle.trainer.lines && battle.trainer.lines.gmax_trigger) {
            log(`<i>${trainerName}: "${battle.trainer.lines.gmax_trigger}"</i>`);
        }
        
        log(`<div style="border-bottom: 2px solid #e11d48; margin-bottom: 5px;"></div>`);
        log(`<b style="font-size:1.2em; color:#e11d48">▂▃▅▆▇ DYNAMAX !!! ▇▆▅▃▂</b>`);
        log(`${oldEnemyName} của ${trainerName} bắt đầu biến lớn! Không khí rung chuyển!`);
        
        await wait(600);
        e.originalName = e.name;
        
        const spriteEl = document.getElementById('enemy-sprite');
        if (spriteEl) {
            spriteEl.classList.add('dynamax-burst');
            await wait(400);
            
            const gmaxFormId = e.megaTargetId;
            if (gmaxFormId && gmaxFormId.includes('gmax') && !e.isGenericDynamax) {
                const baseName = gmaxFormId.replace(/gmax$/i, '');
                const formattedName = baseName.charAt(0).toUpperCase() + baseName.slice(1) + '-Gmax';
                e.name = formattedName;
                e.cnName = formattedName;
                
                const gmaxSpriteId = gmaxFormId.replace(/gmax$/i, '-gmax');
                const gmaxSpriteUrl = `https://play.pokemonshowdown.com/sprites/ani/${gmaxSpriteId}.gif`;
                smartLoadSprite('enemy-sprite', gmaxSpriteUrl, false);
            } else if (e.isGenericDynamax) {
                console.log(`[DYNAMAX] Enemy generic dynamax: ${e.name}`);
            }
            
            await wait(400);
            spriteEl.classList.remove('dynamax-burst');
            spriteEl.classList.add('state-dynamax');
        }
        
        const hpMultiplier = 1.5;
        e.maxHp = Math.floor(oldMaxHp * hpMultiplier);
        e.currHp = Math.floor(oldCurrHp * hpMultiplier);
        
        e.isDynamaxed = true;
        e.dynamaxTurns = 3;
        e.preDynamaxMaxHp = oldMaxHp;
        e.preDynamaxCurrHp = oldCurrHp;
        
        applyDynamaxState(e, true);
        
        log(`<b style="color:#e11d48">${oldEnemyName} đã Dynamax! (HP x${hpMultiplier})</b>`);
        log(`<span style="color:#ff6b8a">[Số lượt Dynamax địch còn lại: ${e.dynamaxTurns}]</span>`);
        
        updateAllVisuals('enemy');
        await wait(800);
    }
    
    // === Enemy Mega ===
    if (shouldTriggerMega) {
        battle.enemyMegaUsed = true;
        const oldEnemyName = e.name;
        const trainerName = battle.trainer?.name || 'Đối thủ';
        
        log(`<div style="border-bottom: 2px solid #ef4444; margin-bottom: 5px;"></div>`);
        log(`Đá Mega của đối phương ${oldEnemyName} phản ứng với Key Stone của ${trainerName}!`);
        
        await wait(600);
        const megaResult = performMegaEvolutionFunc ? performMegaEvolutionFunc(e) : null;
        
        if (megaResult) {
            await playMegaEvolutionAnimation(e, false);
            log(`<b style="color:#fca5a5">Đối phương ${oldEnemyName} đã Mega Evolve thành ${megaResult.newName}!</b>`);
            
            if (megaResult.typeChanged) {
                log(`<span style="font-size:0.9em; color:#9ca3af;">Đối phương ${megaResult.newName} chuyển thành hệ ${megaResult.newTypes.join('/')}!</span>`);
            }
            if (megaResult.abilityChanged && megaResult.newAbility) {
                log(`<span style="font-size:0.9em; color:#9ca3af;">Nhận đặc tính <b>${megaResult.newAbility}</b>!</span>`);
                triggerEntryAbilities(e, p);
            }
        }
        updateAllVisuals('enemy');
        await wait(800);
    }
    
    // === Enemy Tera ===
    if (enemyUnlocks.enable_tera && e.mechanic === 'tera' && e.canTera && !battle.enemyTeraUsed && !e.isTerastallized) {
        battle.enemyTeraUsed = true;
        const oldEnemyName = e.name;
        const oldTypes = [...e.types];
        const teraType = e.teraType;
        const trainerName = battle.trainer?.name || 'Đối thủ';
        
        log(`<div style="border-bottom: 2px solid #22d3ee; margin-bottom: 5px;"></div>`);
        log(`<b style="font-size:1.2em; color:#22d3ee">💎 TERASTALLIZE !!! 💎</b>`);
        log(`${oldEnemyName} của ${trainerName} bắt đầu kết tinh! Tỏa sáng ánh sáng hệ ${teraType}!`);
        
        await wait(600);
        
        const enemySprite = document.getElementById('enemy-sprite');
        if (enemySprite) {
            enemySprite.classList.add('tera-burst', `tera-type-${teraType.toLowerCase()}`);
            await wait(800);
            enemySprite.classList.remove('tera-burst');
            enemySprite.classList.add('state-terastal');
        }
        
        e.isTerastallized = true;
        e.originalTypes = oldTypes;
        e.types = [teraType];
        
        if (typeof window.WeatherEffects !== 'undefined' && window.WeatherEffects.checkNeuroBacklash) {
            const currentWeather = battle?.weather || '';
            const trainer = battle?.enemyTrainer || battle?.trainer;
            const neuroResult = window.WeatherEffects.checkNeuroBacklash(currentWeather, 'terastal', e, trainer);
            if (neuroResult.shouldTrigger) {
                e.volatile = e.volatile || {};
                e.volatile.neuroBacklash = true;
                log(neuroResult.message);
            }
        }
        
        log(`<b style="color:#22d3ee">${oldEnemyName} của ${trainerName} đã Terastallize!</b>`);
        log(`<span style="color:#67e8f9">Thay đổi hệ: ${oldTypes.join('/')} → <b>${teraType}</b></span>`);
        
        updateAllVisuals('enemy');
        await wait(800);
    }

    // === Enemy Bond Resonance ===
    if (window.GAME_SETTINGS?.enableEVO !== false && enemyUnlocks.enable_bond && e.isAce && !battle.enemyBondUsed && !e.hasBondResonance && !e.hasEvolvedThisBattle) {
        const eHpRatio = e.currHp / e.maxHp;
        const eAvs = e.avs || { trust: 0, passion: 0, insight: 0, devotion: 0 };
        const eTotalAVs = (e.getEffectiveAVs?.('trust') || eAvs.trust || 0) + 
                         (e.getEffectiveAVs?.('passion') || eAvs.passion || 0) + 
                         (e.getEffectiveAVs?.('insight') || eAvs.insight || 0) + 
                         (e.getEffectiveAVs?.('devotion') || eAvs.devotion || 0);
        
        const meetsAVsReq = eTotalAVs >= 300;
        
        let enemyTotalHp = 0, enemyTotalMaxHp = 0;
        let playerTotalHp = 0, playerTotalMaxHp = 0;
        battle.enemyParty.forEach(ep => {
            if (ep && typeof ep.isAlive === 'function') {
                enemyTotalMaxHp += ep.maxHp || 0;
                enemyTotalHp += Math.max(0, ep.currHp || 0);
            }
        });
        battle.playerParty.forEach(pp => {
            if (pp && typeof pp.isAlive === 'function') {
                playerTotalMaxHp += pp.maxHp || 0;
                playerTotalHp += Math.max(0, pp.currHp || 0);
            }
        });
        
        const aliveEnemies = battle.enemyParty.filter(ep => ep && typeof ep.isAlive === 'function' && ep.isAlive()).length;
        const alivePlayers = battle.playerParty.filter(pp => pp && typeof pp.isAlive === 'function' && pp.isAlive()).length;
        const isLastStand = aliveEnemies === 1;
        const currentPokemonCritical = eHpRatio <= 0.50;
        const isSmallBattle = (battle.enemyParty.length <= 2 && battle.playerParty.length <= 2);
        const isHpDisadvantage = enemyTotalHp < playerTotalHp * 0.5;
        
        const canTriggerBond = meetsAVsReq && currentPokemonCritical && (isLastStand || (isSmallBattle && isHpDisadvantage));
        
        if (canTriggerBond) {
            e.hasBondResonance = true;
            battle.enemyBondUsed = true;
            const trainerName = battle.trainer?.name || 'Đối thủ';
            
            log(`<div style="border-top: 2px solid #ef4444; border-bottom: 2px solid #ef4444; padding: 8px; text-align: center; margin: 10px 0; background: linear-gradient(90deg, rgba(239,68,68,0.1), rgba(239,68,68,0.3), rgba(239,68,68,0.1));">`);
            log(`<b style="font-size:1.4em; color:#ef4444; text-shadow: 0 0 10px #dc2626;">∞ BOND RESONANCE ∞</b>`);
            log(`</div>`);
            await wait(500);
            
            log(`${trainerName} và ${e.name} nhịp tim hoàn toàn đồng bộ...`);
            await wait(400);
            log(`Đáp lại sự tin tưởng tuyệt đối <span style="color:#facc15">(Total AVs: ${eTotalAVs})</span>, giới hạn cơ thể bị phá vỡ!`);
            
            const enemySprite = document.getElementById('enemy-sprite');
            if (enemySprite) {
                enemySprite.classList.add('evo-burst');
                enemySprite.style.filter = 'brightness(3) drop-shadow(0 0 20px #ef4444)';
            }
            await wait(400);
            
            if (enemySprite) {
                enemySprite.classList.remove('evo-burst');
                enemySprite.classList.add('evo-finish');
                enemySprite.style.filter = 'drop-shadow(0 0 15px #ef4444) brightness(1.15) saturate(1.2)';
            }
            await wait(600);
            
            if (enemySprite) {
                enemySprite.classList.remove('evo-finish');
                enemySprite.classList.add('bond-resonance');
            }
            
            const healAmount = Math.floor(e.maxHp * 0.6);
            e.currHp = Math.min(e.currHp + healAmount, e.maxHp);
            e.status = null;
            
            if (typeof e.applyBoost === 'function') {
                e.applyBoost('atk', 1);
                e.applyBoost('def', 1);
                e.applyBoost('spa', 1);
                e.applyBoost('spd', 1);
                e.applyBoost('spe', 1);
            }
            
            log(`<b style="color:#ef4444">✦ ${trainerName} và ${e.name} đã thức tỉnh tiềm năng! Chỉ số toàn diện tăng vọt!</b>`);
            log(`<span style="color:#60a5fa">✦ Khí thế (HP) hồi phục mạnh mẽ! (+${healAmount})</span>`);
            
            if (isLastStand) {
                log(`<span style="color:#f87171; font-style:italic;">「${trainerName}: Đây là sự phản kháng cuối cùng của chúng ta!」</span>`);
            }
            
            updateAllVisuals('enemy');
            await wait(800);
        }
    }

    // === AI Decision ===
    let enemyMove = null;
    let enemyAction = null;
    let enemyWillSwitch = false;
    let switchTargetIndex = -1;
    
    if (typeof window.getAiAction === 'function') {
        enemyAction = window.getAiAction(e, p, battle.aiDifficulty || 'normal', battle.enemyParty, {
            turnCount: battle.turnCount || 1
        });
    }
    
    if (enemyAction && enemyAction.type === 'switch' && typeof enemyAction.index === 'number') {
        const switchTarget = battle.enemyParty[enemyAction.index];
        const targetIsValid = switchTarget && typeof switchTarget.isAlive === 'function' && switchTarget.isAlive() && switchTarget.currHp > 0 && switchTarget !== e;
        
        let enemyCanSwitch = true;
        if (typeof window.canEnemySwitch === 'function') {
            const switchCheck = window.canEnemySwitch();
            if (!switchCheck.canSwitch) {
                enemyCanSwitch = false;
            }
        }
        
        if (targetIsValid && enemyCanSwitch) {
            enemyWillSwitch = true;
            switchTargetIndex = enemyAction.index;
        }
    }
    
    if (!enemyWillSwitch) {
        if (enemyAction && enemyAction.move) {
            enemyMove = enemyAction.move;
        }
        
        if (!enemyMove && typeof window.getAiMove === 'function') {
            enemyMove = window.getAiMove(e, p, battle.aiDifficulty || 'normal');
        }
        if (!enemyMove) {
            enemyMove = e.moves[Math.floor(Math.random() * e.moves.length)];
        }
        
        // Check PP
        if (window.PPSystem && enemyMove && enemyMove.pp !== undefined && enemyMove.pp <= 0) {
            const ppAvailable = e.moves.filter(m => m.pp === undefined || m.pp > 0);
            if (ppAvailable.length > 0) {
                enemyMove = ppAvailable[Math.floor(Math.random() * ppAvailable.length)];
            } else {
                enemyMove = { name: 'Struggle', cn: 'Struggle', power: 50, type: 'Normal', cat: 'phys' };
                log(`<span style="color:#aaa">${e.name} hết PP, đành dùng Struggle!</span>`);
            }
        }
        
        // Check Taunt
        if (typeof MoveEffects !== 'undefined' && MoveEffects.canUseMove && enemyMove) {
            const canUseResult = MoveEffects.canUseMove(e, enemyMove);
            if (!canUseResult.canUse) {
                log(`<span style="color:#e74c3c">${canUseResult.reason}</span>`);
                const availableMoves = e.moves.filter(m => {
                    const check = MoveEffects.canUseMove(e, m);
                    const hasPP = m.pp === undefined || m.pp > 0;
                    return check.canUse && hasPP;
                });
                if (availableMoves.length > 0) {
                    enemyMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
                } else {
                    enemyMove = { name: 'Struggle', cn: 'Struggle', power: 50, type: 'Normal', cat: 'phys' };
                    log(`<span style="color:#aaa">${e.name} hết cách, đành dùng Struggle!</span>`);
                }
            }
        }
        
        // AI Z-Move
        const enemyUnlocksForZ = battle.enemyUnlocks || {};
        if (enemyUnlocksForZ.enable_z_move && e.mechanic === 'zmove' && !battle.enemyZUsed && enemyMove) {
            let zTarget = null;
            let zBaseMove = null;
            
            for (const move of e.moves) {
                const potentialZ = typeof getZMoveTarget === 'function' ? getZMoveTarget(move, e) : null;
                if (potentialZ && potentialZ.isExclusive) {
                    zTarget = potentialZ;
                    zBaseMove = move;
                    break;
                }
            }
            if (!zTarget) {
                zTarget = typeof getZMoveTarget === 'function' ? getZMoveTarget(enemyMove, e) : null;
                zBaseMove = enemyMove;
            }
            
            if (zTarget) {
                if (typeof canUltraBurst === 'function' && canUltraBurst(e)) {
                    const burstResult = executeUltraBurst(e);
                    if (burstResult.success) {
                        burstResult.logs.forEach(msg => log(msg));
                        updateAllVisuals('enemy');
                        await wait(800);
                        e = battle.getEnemy();
                    }
                }
                
                enemyMove = {
                    name: zTarget.name,
                    type: zTarget.type || zBaseMove.type,
                    power: zTarget.power,
                    cat: zBaseMove.cat || 'phys',
                    accuracy: true,
                    isZ: true,
                    baseMove: zBaseMove.name
                };
                
                if (typeof window.WeatherEffects !== 'undefined' && window.WeatherEffects.checkNeuroBacklash) {
                    const currentWeather = battle?.weather || '';
                    const trainer = battle?.enemyTrainer || battle?.trainer;
                    const neuroResult = window.WeatherEffects.checkNeuroBacklash(currentWeather, 'zmove', e, trainer);
                    if (neuroResult.shouldTrigger) {
                        e.volatile = e.volatile || {};
                        e.volatile.neuroBacklash = true;
                        log(neuroResult.message);
                    }
                }
            }
        }
        
        // AI Styles
        const enemyUnlocksForStyles = battle.enemyUnlocks || {};
        if (enemyUnlocksForStyles.enable_styles && enemyMove && !enemyMove.isZ) {
            let isEnemyUnboundArts = false;
            let enemyUnboundModifier = null;
            if (typeof window.WeatherEffects !== 'undefined' && window.WeatherEffects.getUnboundArtsModifier) {
                const weather = battle?.weather || battle?.environmentWeather || '';
                const potentialStyle = (enemyAction && enemyAction.style) ? enemyAction.style : 'normal';
                if (potentialStyle !== 'normal') {
                    enemyUnboundModifier = window.WeatherEffects.getUnboundArtsModifier(weather, potentialStyle, e, p);
                    isEnemyUnboundArts = enemyUnboundModifier.active;
                }
            }
            
            if (battle.enemyStyleCooldown > 0 && !isEnemyUnboundArts) {
                // Cooldown
            } else {
                const originalPower = enemyMove.basePower || enemyMove.power || 0;
                const originalPriority = enemyMove.priority || 0;
                const originalAccuracy = enemyMove.accuracy;
                const isStatus = (enemyMove.category === 'Status' || enemyMove.cat === 'status' || originalPower === 0);
                
                let aiSpe = (typeof e.getStat === 'function') ? e.getStat('spe') : (e.spe || 100);
                let playerSpe = (typeof p.getStat === 'function') ? p.getStat('spe') : (p.spe || 100);
                if (e.status === 'par') aiSpe = Math.floor(aiSpe * 0.5);
                if (p.status === 'par') playerSpe = Math.floor(playerSpe * 0.5);
                
                const isTrickRoom = battle.field && battle.field.trickRoom > 0;
                let aiHasSpeedAdvantage = false;
                if (isTrickRoom) aiHasSpeedAdvantage = aiSpe < playerSpe;
                else aiHasSpeedAdvantage = aiSpe > playerSpe;
                
                let aiStyle = 'normal';
                if (enemyAction && enemyAction.style) aiStyle = enemyAction.style;
                
                if (isEnemyUnboundArts && enemyUnboundModifier) {
                    enemyMove = { ...enemyMove };
                    enemyMove.styleUsed = aiStyle;
                    if (aiStyle === 'agile') {
                        enemyMove.priority = originalPriority + enemyUnboundModifier.priorityMod;
                        enemyMove.basePower = Math.floor(originalPower * enemyUnboundModifier.damageMultiplier);
                        enemyMove.power = enemyMove.basePower;
                        log(enemyUnboundModifier.message.replace('洗翠无法', 'Enemy Unbound Arts'));
                    } else if (aiStyle === 'strong') {
                        enemyMove.priority = originalPriority + enemyUnboundModifier.priorityMod;
                        enemyMove.basePower = Math.floor(originalPower * enemyUnboundModifier.damageMultiplier);
                        enemyMove.power = enemyMove.basePower;
                        enemyMove.breaksProtect = true;
                        const oldAcc = (typeof originalAccuracy === 'number') ? originalAccuracy : 100;
                        if (originalAccuracy !== true && oldAcc < 101) {
                            enemyMove.accuracy = Math.floor(oldAcc * enemyUnboundModifier.accuracyMultiplier);
                        }
                        log(enemyUnboundModifier.message.replace('洗翠无法', 'Enemy Unbound Arts'));
                    }
                } else if (aiStyle === 'agile') {
                    if (isStatus) {
                        // Skip
                    } else {
                        enemyMove = { ...enemyMove };
                        enemyMove.priority = originalPriority + 1;
                        enemyMove.styleUsed = 'agile';
                        const oldAcc = (typeof originalAccuracy === 'number') ? originalAccuracy : 100;
                        if (aiHasSpeedAdvantage) {
                            enemyMove.basePower = Math.floor(originalPower * 0.75);
                            enemyMove.accuracy = Math.floor(oldAcc * 0.9);
                            log(`<span style="color:#3b82f6">⚡ Enemy Agile Style: Strike - Uy lực×0.75, Chính xác×0.9</span>`);
                        } else {
                            enemyMove.basePower = Math.floor(originalPower * 0.50);
                            enemyMove.accuracy = Math.floor(oldAcc * 0.85);
                            log(`<span style="color:#60a5fa">⚡ Enemy Agile Style: Speed - Uy lực×0.50, Chính xác×0.85</span>`);
                        }
                        enemyMove.power = enemyMove.basePower;
                        
                        const enemyProf = battle.enemyTrainerProficiency ?? 0;
                        battle.enemyStyleCooldown = getStyleCooldown(enemyProf);
                    }
                } else if (aiStyle === 'strong') {
                    enemyMove = { ...enemyMove };
                    enemyMove.priority = originalPriority - 1;
                    enemyMove.basePower = Math.floor(originalPower * 1.30);
                    enemyMove.power = enemyMove.basePower;
                    enemyMove.breaksProtect = true;
                    enemyMove.styleUsed = 'strong';
                    
                    if (!aiHasSpeedAdvantage) {
                        const oldAcc = (typeof originalAccuracy === 'number') ? originalAccuracy : 100;
                        enemyMove.accuracy = Math.floor(oldAcc * 0.8);
                        log(`<span style="color:#ef4444">💪 Enemy Strong Style: Recoil - Uy lực×1.3, Chính xác×0.8</span>`);
                    } else {
                        log(`<span style="color:#b91c1c">💪 Enemy Strong Style: Charge - Uy lực×1.3, Xuyên thủng bảo vệ</span>`);
                    }
                    
                    const enemyProf = battle.enemyTrainerProficiency ?? 0;
                    battle.enemyStyleCooldown = getStyleCooldown(enemyProf);
                } else if (aiStyle === 'focus') {
                    if (isStatus) {
                        // Skip
                    } else {
                        enemyMove = { ...enemyMove };
                        enemyMove.styleUsed = 'focus';
                        enemyMove.accuracy = true;
                        enemyMove.bypassAccuracyCheck = true;
                        log(`<span style="color:#a855f7">🎯 Enemy Focus Style: Tất trúng!</span>`);
                        
                        const enemyProf = battle.enemyTrainerProficiency ?? 0;
                        battle.enemyStyleCooldown = getStyleCooldown(enemyProf);
                    }
                }
            }
        }
    }

    // === Thực thi lượt đấu ===
    
    // Giai đoạn 1: Enemy Switch
    if (enemyWillSwitch) {
        log(`<span style="color:#ef4444">Địch thu hồi ${e.name}!</span>`);
        if (e.choiceLockedMove) delete e.choiceLockedMove;
        if (e.status === 'tox') e.statusTurns = 0;
        if (typeof e.resetBoosts === 'function') e.resetBoosts();
        
        battle.enemyActive = switchTargetIndex;
        const newE = battle.getEnemy();
        log(`<span style="color:#ef4444">Địch tung ra ${newE.name}!</span>`);
        
        if (typeof window.markEnemySwitch === 'function') window.markEnemySwitch();
        
        const checkInitTransformFunc = typeof window.checkInitTransform === 'function' ? window.checkInitTransform : null;
        if (checkInitTransformFunc && newE.needsInitTransform) {
            const result = checkInitTransformFunc(newE);
            if (result) {
                log(`<span style="color:#ef4444">✦ Địch ${result.oldName} biến thành ${result.newName}!</span>`);
            }
        }
        
        updateAllVisuals('enemy');
        await wait(500);
        triggerEntryAbilities(newE, p);
        
        if (typeof MoveEffects !== 'undefined' && MoveEffects.applyEntryHazards) {
            const hazardLogs = MoveEffects.applyEntryHazards(newE, false, battle);
            hazardLogs.forEach(msg => log(msg));
            if (hazardLogs.length > 0) updateAllVisuals();
        }
        e = newE;
    }
    
    // PP System Enemy
    if (window.PPSystem && enemyMove && !enemyWillSwitch) {
        const ppResult = window.PPSystem.deductPP(e, enemyMove, p);
        if (ppResult && ppResult.logs) ppResult.logs.forEach(msg => log(msg));
    }

    // Giai đoạn 2: Tấn công
    if (enemyWillSwitch) {
        // Player only
        const playerResult = await executePlayerTurn(p, e, playerMove);
        if (!p.isAlive()) {
            if (!e.isAlive()) await handleEnemyFainted(e);
            await handlePlayerFainted(p);
            return;
        }
        if (!e.isAlive()) {
            await handleEnemyFainted(e);
            return;
        }
        if (playerResult?.pivot && hasAliveSwitch(battle.playerParty, battle.playerActive)) {
            battle.pendingPassSub = playerResult.passSub || false;
            battle.pendingPassBoosts = playerResult.passBoosts || false;
            try { await handlePlayerPivot(); } catch (err) { console.error(err); }
            battle.pendingPassSub = false;
            battle.pendingPassBoosts = false;
        }
        await executeEndPhase(battle.getPlayer(), battle.getEnemy());
        return;
    }

    // Giai đoạn 2b: Cả hai tấn công
    // Clash Logic
    let clashTriggered = false;
    let clashResult = null;
    
    if (typeof window.canTriggerClash === 'function' && window.GAME_SETTINGS?.enableClash !== false) {
        let playerSpeed = (typeof p.getStat === 'function') ? p.getStat('spe') : (p.spe || 100);
        let enemySpeed = (typeof e.getStat === 'function') ? e.getStat('spe') : (e.spe || 100);
        if (p.status === 'par') playerSpeed = Math.floor(playerSpeed * 0.5);
        if (e.status === 'par') enemySpeed = Math.floor(enemySpeed * 0.5);
        
        const isTrickRoom = battle.field && battle.field.trickRoom > 0;
        const playerIsSlower = isTrickRoom ? (playerSpeed > enemySpeed) : (playerSpeed < enemySpeed);
        const speedRatio = playerSpeed / enemySpeed;
        const meetsSpeedThreshold = speedRatio < 1.0;
        
        if (playerIsSlower && meetsSpeedThreshold) {
            const clashCheck = window.canTriggerClash(p, e, playerMove, enemyMove);
            
            if (clashCheck.canTrigger && typeof window.showClashOption === 'function') {
                let clashAvailable = false;
                if (battle.insightTriggeredThisTurn) {
                    clashAvailable = true;
                } else {
                    const proficiency = battle.trainerProficiency ?? 0;
                    const triggerRoll = window.rollClashTrigger ? window.rollClashTrigger(proficiency) : { success: true };
                    clashAvailable = triggerRoll.success;
                }
                battle.insightTriggeredThisTurn = false;
                
                if (clashAvailable) {
                    const clashChoice = await window.showClashOption(playerMove, enemyMove);
                    if (clashChoice === 'clash' && typeof window.resolveClash === 'function') {
                        clashTriggered = true;
                        clashResult = window.resolveClash(playerMove, enemyMove, p, e, { applySpeedModifier: true });
                        
                        if (clashResult) {
                            if (typeof window.playSFX === 'function') window.playSFX('CLASH');
                            
                            log(`<div style="border: 2px solid #f59e0b; padding: 10px; margin: 10px 0; background: linear-gradient(90deg, rgba(245,158,11,0.1), rgba(245,158,11,0.2), rgba(245,158,11,0.1));">`);
                            clashResult.logs.forEach(msg => log(msg));
                            log(`</div>`);
                            
                            // Effect
                            const battleStage = document.querySelector('.battle-stage');
                            if (battleStage) {
                                const playerSprite = document.getElementById('player-sprite');
                                const enemySprite = document.getElementById('enemy-sprite');
                                if (playerSprite) {
                                    playerSprite.classList.add('clash-shake');
                                    setTimeout(() => playerSprite.classList.remove('clash-shake'), 500);
                                }
                                if (enemySprite) {
                                    enemySprite.classList.add('clash-shake');
                                    setTimeout(() => enemySprite.classList.remove('clash-shake'), 500);
                                }
                                const impact = document.createElement('div');
                                impact.className = 'clash-impact';
                                battleStage.appendChild(impact);
                                setTimeout(() => impact.remove(), 800);
                            }
                            await wait(1000);
                            
                            if (clashResult.damageMultiplierB > 0) {
                                const modifiedEnemyMove = { ...enemyMove };
                                modifiedEnemyMove.clashDamageMultiplier = clashResult.damageMultiplierB;
                                await executeEnemyTurn(e, p, modifiedEnemyMove);
                                if (!p.isAlive()) {
                                    if (!e.isAlive()) await handleEnemyFainted(e);
                                    await handlePlayerFainted(p);
                                    return;
                                }
                                if (!e.isAlive()) {
                                    await handleEnemyFainted(e);
                                    return;
                                }
                            }
                            
                            if (clashResult.damageMultiplierA > 0) {
                                const modifiedPlayerMove = { ...playerMove };
                                modifiedPlayerMove.clashDamageMultiplier = clashResult.damageMultiplierA;
                                await executePlayerTurn(p, e, modifiedPlayerMove);
                                if (!p.isAlive()) {
                                    if (!e.isAlive()) await handleEnemyFainted(e);
                                    await handlePlayerFainted(p);
                                    return;
                                }
                                if (!e.isAlive()) {
                                    await handleEnemyFainted(e);
                                    return;
                                }
                            }
                            
                            await executeEndPhase(battle.getPlayer(), battle.getEnemy());
                            return;
                        }
                    }
                }
            }
        }
    }
    
    // Tính thứ tự
    const playerPriority = typeof window.getMovePriority === 'function' ? window.getMovePriority(playerMove, p, e) : 0;
    const enemyPriority = typeof window.getMovePriority === 'function' ? window.getMovePriority(enemyMove, e, p) : 0;
    
    let playerFirst = true;
    if (playerPriority !== enemyPriority) {
        playerFirst = playerPriority > enemyPriority;
    } else {
        let playerSpeed = p.getStat('spe');
        let enemySpeed = e.getStat('spe');
        
        if (battle.playerSide && battle.playerSide.tailwind > 0) playerSpeed *= 2;
        if (battle.enemySide && battle.enemySide.tailwind > 0) enemySpeed *= 2;
        
        const isTrickRoom = battle.field && battle.field.trickRoom > 0;
        const playerStall = playerMove && playerMove.stallFlag;
        const enemyStall = enemyMove && enemyMove.stallFlag;
        
        if (playerStall && !enemyStall) playerFirst = false;
        else if (enemyStall && !playerStall) playerFirst = true;
        else if (playerSpeed !== enemySpeed) {
            if (isTrickRoom) playerFirst = playerSpeed < enemySpeed;
            else playerFirst = playerSpeed > enemySpeed;
        } else {
            playerFirst = Math.random() < 0.5;
        }
    }

    if (playerFirst) {
        // Player First
        
        // Enemy Clash Check (AI)
        let enemyClashTriggered = false;
        if (typeof window.aiDecideClash === 'function' && window.GAME_SETTINGS?.enableClash !== false) {
            let pSpeed = (typeof p.getStat === 'function') ? p.getStat('spe') : (p.spe || 100);
            let eSpeed = (typeof e.getStat === 'function') ? e.getStat('spe') : (e.spe || 100);
            if (p.status === 'par') pSpeed = Math.floor(pSpeed * 0.5);
            if (e.status === 'par') eSpeed = Math.floor(eSpeed * 0.5);
            const speedRatio = eSpeed / pSpeed;
            const meetsSpeedThreshold = speedRatio < 1.0;
            
            if (meetsSpeedThreshold) {
                // Expert AI Counter
                let finalEnemyMove = enemyMove;
                if (battle.aiDifficulty === 'expert' && typeof window.getHardAiMove === 'function' && !enemyMove.isZ && !enemyMove.isMax) {
                    const recalcMove = window.getHardAiMove(e, p, battle.enemyParty);
                    if (recalcMove && recalcMove.name !== enemyMove.name) {
                        const newClashCheck = window.canTriggerClash(e, p, recalcMove, playerMove);
                        if (newClashCheck && newClashCheck.canTrigger) {
                            if (enemyMove.styleUsed) {
                                const styleMod = enemyMove.styleUsed === 'strong' ? 1.30 : (enemyMove.styleUsed === 'agile' ? 0.50 : 1.0);
                                recalcMove.basePower = Math.floor((recalcMove.basePower || recalcMove.power || 0) * styleMod);
                                recalcMove.power = recalcMove.basePower;
                                recalcMove.styleUsed = enemyMove.styleUsed;
                                recalcMove.priority = enemyMove.priority;
                            }
                            finalEnemyMove = recalcMove;
                            enemyMove = recalcMove;
                        }
                    }
                }
                
                const aiDecision = window.aiDecideClash(e, p, finalEnemyMove, playerMove);
                if (aiDecision.shouldClash && typeof window.resolveClash === 'function') {
                    const enemyProficiency = battle.enemyTrainerProficiency ?? 0;
                    const enemyTriggerRoll = window.rollClashTrigger ? window.rollClashTrigger(enemyProficiency) : { success: true };
                    
                    if (enemyTriggerRoll.success) {
                        enemyClashTriggered = true;
                        const clashResult = window.resolveClash(finalEnemyMove, playerMove, e, p);
                        if (clashResult) {
                            if (typeof window.playSFX === 'function') window.playSFX('CLASH');
                            
                            log(`<div style="border: 2px solid #f59e0b; padding: 10px; margin: 10px 0; background: linear-gradient(90deg, rgba(245,158,11,0.1), rgba(245,158,11,0.2), rgba(245,158,11,0.1));">`);
                            clashResult.logs.forEach(msg => log(msg));
                            log(`</div>`);
                            
                            // Effect
                            const battleStage = document.querySelector('.battle-stage');
                            if (battleStage) {
                                const playerSprite = document.getElementById('player-sprite');
                                const enemySprite = document.getElementById('enemy-sprite');
                                if (playerSprite) {
                                    playerSprite.classList.add('clash-shake');
                                    setTimeout(() => playerSprite.classList.remove('clash-shake'), 500);
                                }
                                if (enemySprite) {
                                    enemySprite.classList.add('clash-shake');
                                    setTimeout(() => enemySprite.classList.remove('clash-shake'), 500);
                                }
                                const impact = document.createElement('div');
                                impact.className = 'clash-impact';
                                battleStage.appendChild(impact);
                                setTimeout(() => impact.remove(), 800);
                            }
                            await wait(1000);
                            
                            if (clashResult.damageMultiplierB > 0) {
                                const modifiedPlayerMove = { ...playerMove };
                                modifiedPlayerMove.clashDamageMultiplier = clashResult.damageMultiplierB;
                                await executePlayerTurn(p, e, modifiedPlayerMove);
                                if (!p.isAlive()) {
                                    if (!e.isAlive()) await handleEnemyFainted(e);
                                    await handlePlayerFainted(p);
                                    return;
                                }
                                if (!e.isAlive()) {
                                    await handleEnemyFainted(e);
                                    return;
                                }
                            }
                            
                            if (clashResult.damageMultiplierA > 0) {
                                const modifiedEnemyMove = { ...enemyMove };
                                modifiedEnemyMove.clashDamageMultiplier = clashResult.damageMultiplierA;
                                await executeEnemyTurn(e, p, modifiedEnemyMove);
                                if (!p.isAlive()) {
                                    await handlePlayerFainted(p);
                                    return;
                                }
                            }
                            await executeEndPhase(battle.getPlayer(), battle.getEnemy());
                            return;
                        }
                    }
                }
            }
        }
        
        // Normal Player Attack
        const playerResult = await executePlayerTurn(p, e, playerMove);
        if (!p.isAlive()) {
            await handlePlayerFainted(p);
            const newP = battle.getPlayer();
            const currentE = battle.getEnemy();
            if (newP && newP.isAlive() && currentE && currentE.isAlive()) {
                await executeEndPhase(newP, currentE);
            }
            return;
        }
        
        if (playerResult?.pivot && hasAliveSwitch(battle.playerParty, battle.playerActive)) {
            const oldP = battle.getPlayer();
            const moveName = playerMove?.name || '';
            if (moveName === 'Volt Switch') log(`${oldP.name} dùng Volt Switch!`);
            else if (moveName === 'Flip Turn') log(`${oldP.name} dùng Flip Turn!`);
            else log(`${oldP.name} rút lui!`);
            
            battle.pendingPassSub = playerResult.passSub || false;
            battle.pendingPassBoosts = playerResult.passBoosts || false;
            await handlePlayerPivot();
            p = battle.getPlayer();
            battle.pendingPassSub = false;
            battle.pendingPassBoosts = false;
        } else if (playerResult?.pivot) {
            log(`<span style="color:#999">Nhưng không còn đồng đội để thay!</span>`);
        }
        
        if (!e.isAlive()) {
            if (!p.isAlive()) {
                await handleEnemyFainted(e);
                await handlePlayerFainted(p);
                return;
            }
            await handleEnemyFainted(e);
            const newE = battle.getEnemy();
            if (newE && newE.isAlive()) {
                await executeEndPhase(p, newE);
            }
            return;
        }
        
        // Enemy Turn
        if (!e.isAlive()) {
            log(`<span style="color:#999">Nhưng ${e.name} đã ngã xuống...</span>`);
            await handleEnemyFainted(e);
            return;
        }
        
        if (battle.playerForcedSwitch && p.isAlive() && hasAliveSwitch(battle.playerParty, battle.playerActive)) {
            battle.phase = 'force_switch';
            renderSwitchMenu(false);
            await new Promise((resolve) => battle.forceSwitchResolve = resolve);
            battle.playerForcedSwitch = false;
            p = battle.getPlayer();
        }
        
        if (playerResult?.phaze) {
            e = battle.getEnemy();
            await executeEndPhase(p, e);
            return;
        }
        
        await wait(600);
        const enemyResult = await executeEnemyTurn(e, p, enemyMove);
        
        if (!e.isAlive()) {
            if (!p.isAlive()) {
                await handleEnemyFainted(e);
                await handlePlayerFainted(p);
                return;
            }
            await handleEnemyFainted(e);
            return;
        }
        
        if (enemyResult?.pivot && hasAliveSwitch(battle.enemyParty, battle.enemyActive)) {
            const oldE = battle.getEnemy();
            const moveName = enemyMove?.name || '';
            if (moveName === 'Volt Switch') log(`${oldE.name} dùng Volt Switch!`);
            else if (moveName === 'Flip Turn') log(`${oldE.name} dùng Flip Turn!`);
            else if (moveName === 'Baton Pass') log(`${oldE.name} dùng Baton Pass!`);
            else log(`${oldE.name} rút lui!`);
            
            await handleEnemyPivot(enemyResult?.passBoosts || false);
            e = battle.getEnemy();
        }
        
        if (enemyResult?.phaze && p.isAlive() && hasAliveSwitch(battle.playerParty, battle.playerActive)) {
            battle.phase = 'force_switch';
            renderSwitchMenu(false);
            await new Promise((resolve) => battle.forceSwitchResolve = resolve);
            p = battle.getPlayer();
        }
        
        if (!p.isAlive()) {
            await handlePlayerFainted(p);
            const newP = battle.getPlayer();
            const currentE = battle.getEnemy();
            if (newP && newP.isAlive() && currentE && currentE.isAlive()) {
                await executeEndPhase(newP, currentE);
            }
            return;
        }
        
    } else {
        // Enemy First
        const enemyResult = await executeEnemyTurn(e, p, enemyMove);
        
        if (!e.isAlive()) {
            if (!p.isAlive()) {
                await handleEnemyFainted(e);
                await handlePlayerFainted(p);
                return;
            }
            await handleEnemyFainted(e);
            return;
        }
        
        if (enemyResult?.pivot && hasAliveSwitch(battle.enemyParty, battle.enemyActive)) {
            const oldE = battle.getEnemy();
            const moveName = enemyMove?.name || '';
            if (moveName === 'Volt Switch') log(`${oldE.name} dùng Volt Switch!`);
            else if (moveName === 'Flip Turn') log(`${oldE.name} dùng Flip Turn!`);
            else if (moveName === 'Baton Pass') log(`${oldE.name} dùng Baton Pass!`);
            else log(`${oldE.name} rút lui!`);
            await handleEnemyPivot(enemyResult?.passBoosts || false);
            e = battle.getEnemy();
        }
        
        if (enemyResult?.phaze && p.isAlive() && hasAliveSwitch(battle.playerParty, battle.playerActive)) {
            battle.phase = 'force_switch';
            renderSwitchMenu(false);
            await new Promise((resolve) => battle.forceSwitchResolve = resolve);
            p = battle.getPlayer();
        }
        
        if (!p.isAlive()) {
            await handlePlayerFainted(p);
            const newP = battle.getPlayer();
            const currentE = battle.getEnemy();
            if (newP && newP.isAlive() && currentE && currentE.isAlive()) {
                await executeEndPhase(newP, currentE);
            }
            return;
        }
        
        await wait(600);
        
        // Player Turn
        if (!p.isAlive()) {
            log(`<span style="color:#999">Nhưng ${p.name} đã ngã xuống...</span>`);
            await handlePlayerFainted(p);
            const newP2 = battle.getPlayer();
            const currentE2 = battle.getEnemy();
            if (newP2 && newP2.isAlive() && currentE2 && currentE2.isAlive()) {
                await executeEndPhase(newP2, currentE2);
            }
            return;
        }
        
        if (!e.isAlive()) {
            log(`<span style="color:#999">Không còn mục tiêu...</span>`);
            await handleEnemyFainted(e);
            return;
        }
        
        // Re-check Taunt
        if (typeof MoveEffects !== 'undefined' && MoveEffects.canUseMove) {
            const canUseResult = MoveEffects.canUseMove(p, playerMove);
            if (!canUseResult.canUse) {
                log(`<span style="color:#e74c3c">${canUseResult.reason}</span>`);
                await wait(500);
                const availableMoves = p.moves.filter(m => {
                    const check = MoveEffects.canUseMove(p, m);
                    return check.canUse;
                });
                if (availableMoves.length > 0) {
                    playerMove = availableMoves[0];
                    log(`<span style="color:#f59e0b">${p.name} đổi sang dùng ${playerMove.name}!</span>`);
                } else {
                    playerMove = { name: 'Struggle', cn: 'Struggle', power: 50, type: 'Normal', cat: 'phys', accuracy: true, flags: { contact: 1 } };
                    log(`<span style="color:#ef4444">${p.name} chỉ còn cách vùng vẫy!</span>`);
                }
            }
        }
        
        const playerResult = await executePlayerTurn(p, e, playerMove);
        if (!p.isAlive()) {
            await handlePlayerFainted(p);
            const newP = battle.getPlayer();
            const currentE = battle.getEnemy();
            if (newP && newP.isAlive() && currentE && currentE.isAlive()) {
                await executeEndPhase(newP, currentE);
            }
            return;
        }
        
        if (playerResult?.pivot && hasAliveSwitch(battle.playerParty, battle.playerActive)) {
            const oldP = battle.getPlayer();
            const moveName = playerMove?.name || '';
            if (moveName === 'Volt Switch') log(`${oldP.name} dùng Volt Switch!`);
            else if (moveName === 'Flip Turn') log(`${oldP.name} dùng Flip Turn!`);
            else log(`${oldP.name} rút lui!`);
            
            battle.pendingPassSub = playerResult.passSub || false;
            battle.pendingPassBoosts = playerResult.passBoosts || false;
            await handlePlayerPivot();
            p = battle.getPlayer();
            battle.pendingPassSub = false;
            battle.pendingPassBoosts = false;
        } else if (playerResult?.pivot) {
            log(`<span style="color:#999">Nhưng không còn đồng đội để thay!</span>`);
        }
        
        if (battle.playerForcedSwitch && p.isAlive() && hasAliveSwitch(battle.playerParty, battle.playerActive)) {
            battle.phase = 'force_switch';
            renderSwitchMenu(false);
            await new Promise((resolve) => battle.forceSwitchResolve = resolve);
            battle.playerForcedSwitch = false;
            p = battle.getPlayer();
        }
        
        if (!e.isAlive()) {
            if (!p.isAlive()) {
                await handleEnemyFainted(e);
                await handlePlayerFainted(p);
                return;
            }
            await handleEnemyFainted(e);
            const newE = battle.getEnemy();
            if (newE && newE.isAlive()) {
                await executeEndPhase(p, newE);
            }
            return;
        }
    }

    // End Phase
    const currentP = battle.getPlayer();
    const currentE = battle.getEnemy();
    await executeEndPhase(currentP, currentE);
}

// ============================================
// 【Đã di chuyển】Turn logic -> battle/battle-turns.js
// ============================================

// ============================================
// 【Đã di chuyển】Switch System -> battle/battle-switch.js
// ============================================

/**
 * Kết thúc lượt
 */
async function executeEndPhase(p, e) {
    console.log('[executeEndPhase] Start:', p?.name, 'vs', e?.name);
    
    try {
        await wait(300);
        
        if (!p || !e) {
            console.warn('[executeEndPhase] Invalid pokemon');
            battle.locked = false;
            return;
        }
        
        if (typeof window.getEndTurnStatusLogs === 'function') {
            // Player Status
            if (p.isAlive()) {
                const pLogs = window.getEndTurnStatusLogs(p, e, true);
                if (pLogs.length > 0) {
                    pLogs.forEach(txt => {
                        if (txt.includes('Devotion')) log(txt);
                        else log(`<span style="color:#d35400">${txt}</span>`);
                    });
                    updateAllVisuals();
                    await wait(400);
                    if (!p.isAlive()) {
                        await handlePlayerFainted(p);
                        return;
                    }
                }
            }
            
            // Enemy Status
            if (e.isAlive()) {
                const eLogs = window.getEndTurnStatusLogs(e, p, false);
                if (eLogs.length > 0) {
                    eLogs.forEach(txt => {
                        if (txt.includes('Devotion')) log(txt);
                        else log(`<span style="color:#d35400">${txt}</span>`);
                    });
                    updateAllVisuals();
                    await wait(400);
                    if (!e.isAlive()) {
                        await handleEnemyFainted(e);
                        return;
                    }
                }
            }
        }
        
        // G-Max DOT
        const applyGMaxDOT = async (pokemon, side, isPlayer) => {
            if (!pokemon || !pokemon.isAlive() || !side) return;
            const types = pokemon.types || [];
            const dotDamage = Math.max(1, Math.floor(pokemon.maxHp / 6));
            
            if (side.gmaxWildfire && side.gmaxWildfire.turns > 0) {
                if (!types.includes('Fire')) {
                    pokemon.currHp = Math.max(0, pokemon.currHp - dotDamage);
                    log(`<span style="color:#ef4444">🔥 ${pokemon.name} bị G-Max Wildfire thiêu đốt! (-${dotDamage})</span>`);
                    updateAllVisuals();
                    await wait(300);
                }
                side.gmaxWildfire.turns--;
                if (side.gmaxWildfire.turns <= 0) {
                    log(`<span style="color:#94a3b8">🔥 G-Max Wildfire đã tắt.</span>`);
                    delete side.gmaxWildfire;
                }
            }
            // ... (Other G-Max effects similar structure)
            
            if (!pokemon.isAlive()) {
                if (isPlayer) await handlePlayerFainted(pokemon);
                else await handleEnemyFainted(pokemon);
                return true;
            }
            return false;
        };
        
        if (p && p.isAlive() && battle.playerSide) {
            const fainted = await applyGMaxDOT(p, battle.playerSide, true);
            if (fainted) return;
        }
        if (e && e.isAlive() && battle.enemySide) {
            const fainted = await applyGMaxDOT(e, battle.enemySide, false);
            if (fainted) return;
        }
        
        // Turns On Field & Protect Counter
        const isProtectMove = (moveName) => {
            if (!moveName) return false;
            const moveId = moveName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const moveData = (typeof MOVES !== 'undefined' && MOVES[moveId]) ? MOVES[moveId] : null;
            return moveData?.stallingMove || false;
        };
        
        if (p && p.isAlive()) {
            if ((p.turnsOnField || 0) > 0 || p.lastMoveUsed) {
                p.turnsOnField = (p.turnsOnField || 0) + 1;
            }
            if (!isProtectMove(p.lastMoveUsed)) p.protectCounter = 0;
            
            if (typeof MoveEffects !== 'undefined' && MoveEffects.tickVolatileStatus) {
                const volatileLogs = MoveEffects.tickVolatileStatus(p);
                volatileLogs.forEach(txt => log(txt));
                if (!p.isAlive()) {
                    updateAllVisuals();
                    await handlePlayerFainted(p);
                    return;
                }
            }
            if (typeof MoveEffects !== 'undefined' && MoveEffects.processEndTurnItemEffects) {
                const itemLogs = MoveEffects.processEndTurnItemEffects(p);
                itemLogs.forEach(txt => log(txt));
                if (itemLogs.length > 0) updateAllVisuals();
            }
        }
        
        if (e && e.isAlive()) {
            if ((e.turnsOnField || 0) > 0 || e.lastMoveUsed) {
                e.turnsOnField = (e.turnsOnField || 0) + 1;
            }
            if (!isProtectMove(e.lastMoveUsed)) e.protectCounter = 0;
            
            if (typeof MoveEffects !== 'undefined' && MoveEffects.tickVolatileStatus) {
                const volatileLogs = MoveEffects.tickVolatileStatus(e);
                volatileLogs.forEach(txt => log(txt));
                if (!e.isAlive()) {
                    updateAllVisuals();
                    await handleEnemyFainted(e);
                    return;
                }
            }
            if (typeof MoveEffects !== 'undefined' && MoveEffects.processEndTurnItemEffects) {
                const itemLogs = MoveEffects.processEndTurnItemEffects(e);
                itemLogs.forEach(txt => log(txt));
                if (itemLogs.length > 0) updateAllVisuals();
            }
        }
        
        // Ability End Turn
        if (typeof AbilityHandlers !== 'undefined') {
            if (p && p.isAlive() && p.ability) {
                const h = AbilityHandlers[p.ability];
                if (h && h.onEndTurn) {
                    const l = []; h.onEndTurn(p, l);
                    l.forEach(txt => log(txt));
                    if (l.length > 0) updateAllVisuals();
                }
            }
            if (e && e.isAlive() && e.ability) {
                const h = AbilityHandlers[e.ability];
                if (h && h.onEndTurn) {
                    const l = []; h.onEndTurn(e, l);
                    l.forEach(txt => log(txt));
                    if (l.length > 0) updateAllVisuals();
                }
            }
        }
        
        // HP Threshold Form Change
        if (typeof window.checkHPThresholdTransform === 'function') {
            if (p && p.isAlive()) {
                const res = window.checkHPThresholdTransform(p);
                if (res && res.success) {
                    log(`<span style="color:#f59e0b">🔄 ${res.newName || p.name} thay đổi hình dạng!</span>`);
                    updateAllVisuals();
                    await wait(500);
                }
            }
            if (e && e.isAlive()) {
                const res = window.checkHPThresholdTransform(e);
                if (res && res.success) {
                    log(`<span style="color:#f59e0b">🔄 ${res.newName || e.name} thay đổi hình dạng!</span>`);
                    updateAllVisuals();
                    await wait(500);
                }
            }
        }
        
        // Dynamax Tick
        if (p && p.isAlive() && p.isDynamaxed && p.dynamaxTurns > 0) {
            const result = await processDynamaxEndTurn(p, true, log);
            result.logs.forEach(msg => log(msg));
            if (result.ended) {
                await endDynamaxAnimation(p, true);
                const originalSpriteUrl = p.getSprite(true);
                smartLoadSprite('player-sprite', originalSpriteUrl, true);
                updateAllVisuals();
                await wait(500);
            }
        }
        if (e && e.isAlive() && e.isDynamaxed && e.dynamaxTurns > 0) {
            const result = await processDynamaxEndTurn(e, false, log);
            result.logs.forEach(msg => log(msg));
            if (result.ended) {
                await endDynamaxAnimation(e, false);
                const originalSpriteUrl = e.getSprite(false);
                smartLoadSprite('enemy-sprite', originalSpriteUrl, false);
                updateAllVisuals();
                await wait(500);
            }
        }
        
        // Field Tick
        if (battle.tickFieldConditions) {
            const fieldLogs = battle.tickFieldConditions();
            if (fieldLogs && fieldLogs.length > 0) {
                for (const txt of fieldLogs) log(`<span style="color:#a78bfa">${txt}</span>`);
                await wait(300);
            }
        }
        
        // Defog Cleanse Tick
        if (battle.defogCleanse && battle.defogCleanse.turnsRemaining > 0) {
            battle.defogCleanse.turnsRemaining--;
            if (battle.defogCleanse.turnsRemaining <= 0) {
                battle.weather = battle.defogCleanse.originalWeather || 'fog';
                battle.weatherTurns = 0;
                delete battle.defogCleanse;
                log(`<span style="color:#6b7280">🌫️ Bóng tối tụ lại... Sương mù lại bao phủ chiến trường!</span>`);
                if (typeof setWeatherVisuals === 'function') setWeatherVisuals('fog');
                await wait(500);
            } else {
                log(`<span style="color:#94a3b8">（Sương mù sẽ trở lại sau ${battle.defogCleanse.turnsRemaining} lượt...）</span>`);
            }
        }
        
        if (typeof clearCommandEffects === 'function') {
            clearCommandEffects();
        }
        
        battle.locked = false;
        console.log('[executeEndPhase] Complete');
    } catch (err) {
        console.error('[executeEndPhase] Error:', err);
        battle.locked = false;
    }
}

window.executeEndPhase = executeEndPhase;

// ============================================
// 【Đã di chuyển】Hệ thống sát thương -> battle/battle-damage.js
// ============================================

/**
 * ===========================================
 * Part C: Switch System (Manual & Forced)
 * ===========================================
 */
function checkPlayerDefeatOrForceSwitch() {
    if (battle.battleEndDetermined) {
        return Promise.resolve('already_determined');
    }
    
    const battleEnd = battle.checkBattleEnd();
    
    if (battleEnd === 'loss') {
        battle.battleEndDetermined = true;
        log(" <b style='color:#e74c3c'>... Bạn đã thua.</b>");

        if (battle.trainer && battle.trainer.id !== 'wild' && battle.trainer.lines?.win) {
            log(`<i>${battle.trainer.name}: "${battle.trainer.lines.win}"</i>`);
        } else if (battle.scriptedResult === 'loss' && battle.trainer) {
            log(`<i>"Đúng như ta dự đoán..." ${battle.trainer.name} thì thầm.</i>`);
        }

        setTimeout(() => battleEndSequence('loss'), 2000);
        return Promise.resolve('loss');
    } else if (battleEnd === 'win') {
        battle.battleEndDetermined = true;
        log("🏆 <b style='color:#27ae60'>Đối phương đã bị đánh bại! Bạn thắng!</b>");
        const t = battle.trainer;
        if (t && t.id !== 'wild' && t.lines?.lose) {
            log(`<i>${t.name}: "${t.lines.lose}"</i>`);
        }
        setTimeout(() => battleEndSequence('win'), 2000);
        return Promise.resolve('win');
    }
    
    battle.phase = 'force_switch';
    renderSwitchMenu(false);
    
    return new Promise((resolve) => {
        battle.forceSwitchResolve = resolve;
    });
}

function renderSwitchMenu(allowCancel = true) {
    if (battle.locked && battle.phase !== 'force_switch' && battle.phase !== 'pivot_switch') return;

    if (allowCancel && battle.phase !== 'force_switch' && battle.phase !== 'pivot_switch') {
        if (typeof window.canPlayerSwitch === 'function') {
            const switchCheck = window.canPlayerSwitch();
            if (!switchCheck.canSwitch) {
                log(`<span style="color:#ef4444">${switchCheck.reason}</span>`);
                return;
            }
        }
    }

    const layer = document.getElementById('switch-menu-layer');

    layer.className = 'overlay-modal modern-layer';
    layer.classList.remove('hidden');
    layer.style.display = 'flex';
    layer.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'switch-container-modern';

    const header = document.createElement('div');
    header.className = 'switch-header-modern';
    const actionColor = !allowCancel ? 'var(--primary-pink)' : 'var(--accent-blue)';
    header.innerHTML = `
        <div style="width:6px; height:40px; background:${actionColor}; border-radius:10px;"></div>
        <div>
            <h2>pokémon</h2>
            <div class="switch-header-subtitle">
                ${!allowCancel ? 'Chọn Pokémon thay thế (Bắt buộc)' : 'Chọn đồng đội để thay đổi'}
            </div>
        </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'party-grid-modern';

    battle.playerParty.forEach((pm, idx) => {
        const card = document.createElement('div');
        const isCurrent = (idx === battle.playerActive);
        const isDead = (pm.currHp <= 0);
        const hpRatio = pm.maxHp ? (pm.currHp / pm.maxHp) : 0;

        card.className = 'party-card-modern';
        card.style.animationDelay = `${idx * 0.05}s`;

        if (isCurrent) card.classList.add('current');
        if (isDead) card.classList.add('dead');
        if (!allowCancel && isDead) card.classList.add('disabled');

        let hpColor = '#4fd1c5';
        if (hpRatio < 0.5) hpColor = '#fbc63e';
        if (hpRatio <= 0.2) hpColor = '#ff6b6b';

        const seedIdWithHyphen = pm.name.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const seedIdCompact = pm.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        const pokeData = (typeof POKEDEX !== 'undefined' && POKEDEX[seedIdCompact]) 
            ? POKEDEX[seedIdCompact] : null;
        const forme = pokeData?.forme || '';
        const baseSpecies = pokeData?.baseSpecies || '';
        const baseId = baseSpecies ? baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, '') : seedIdCompact;
        const fallbackId = typeof getFallbackSpriteId === 'function' ? getFallbackSpriteId(pm.name) : baseId;
        
        const formeLower = forme.toLowerCase();
        const regionalForms = ['alola', 'galar', 'hisui', 'paldea'];
        const isRegionalForm = regionalForms.some(r => formeLower.includes(r)) || regionalForms.some(r => seedIdWithHyphen.includes(`-${r}`));
        const isMegaForm = formeLower.includes('mega') || seedIdWithHyphen.includes('-mega');
        const isPrimalForm = formeLower === 'primal' || seedIdWithHyphen.includes('-primal');
        const isCrownedForm = formeLower === 'crowned' || seedIdWithHyphen.includes('-crowned');
        const isUltraForm = formeLower === 'ultra' || seedIdWithHyphen.includes('-ultra');
        const specialForms = ['wash', 'heat', 'mow', 'frost', 'fan', 'dusk-mane', 'dawn-wings', 'ice', 'shadow', 'zen', 'therian', 'origin', 'sky', 'attack', 'defense', 'speed', 'combat', 'blaze', 'aqua'];
        const isOtherSpecialForm = specialForms.some(f => formeLower.includes(f)) || specialForms.some(f => seedIdWithHyphen.includes(`-${f}`));
        const pikachuCapForms = ['original', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'partner', 'world'];
        const isPikachuCap = baseSpecies === 'Pikachu' && pikachuCapForms.includes(formeLower);
        const pikachuCosplayForms = ['cosplay', 'rock-star', 'belle', 'pop-star', 'phd', 'libre'];
        const isPikachuCosplay = baseSpecies === 'Pikachu' && pikachuCosplayForms.some(f => formeLower.includes(f));
        const needsPokesprite = isRegionalForm || isMegaForm || isPrimalForm || isUltraForm || isOtherSpecialForm;
        
        let imgSrc;
        if (isPikachuCap) {
            const capName = `pikachu-${formeLower}-cap`;
            imgSrc = `https://raw.githubusercontent.com/msikma/pokesprite/master/icons/pokemon/regular/${capName}.png`;
        } else if (isPikachuCosplay) {
            imgSrc = `https://raw.githubusercontent.com/msikma/pokesprite/master/icons/pokemon/regular/${seedIdWithHyphen}.png`;
        } else if (isCrownedForm) {
            imgSrc = `https://raw.githubusercontent.com/msikma/pokesprite/master/pokemon-gen8/regular/${seedIdWithHyphen}.png`;
        } else if (needsPokesprite) {
            let pokespriteId = seedIdWithHyphen;
            if (isMegaForm && !pokespriteId.includes('-mega')) {
                pokespriteId = pokespriteId.replace(/mega([xy])$/i, '-mega-$1');
                if (!pokespriteId.includes('-mega')) {
                    pokespriteId = pokespriteId.replace(/mega$/i, '-mega');
                }
            }
            if (isPrimalForm && !pokespriteId.includes('-primal')) {
                pokespriteId = pokespriteId.replace(/primal$/i, '-primal');
            }
            pokespriteId = pokespriteId.replace(/-dusk-mane$/, '-dusk');
            pokespriteId = pokespriteId.replace(/-dawn-wings$/, '-dawn');
            imgSrc = `https://raw.githubusercontent.com/msikma/pokesprite/master/pokemon-gen8/regular/${pokespriteId}.png`;
        } else {
            imgSrc = `https://play.pokemonshowdown.com/sprites/gen5/${seedIdCompact}.png`;
        }
        
        const fallbackSrc = `https://play.pokemonshowdown.com/sprites/gen5/${fallbackId}.png`;

        // FORCE ENGLISH NAME IN UI
        card.innerHTML = `
            ${isCurrent ? '<div class="current-tag">ACTIVE</div>' : ''}
            <div class="card-icon-modern">
                <img class="${isMegaForm ? 'mega-icon' : ''}" src="${imgSrc}" onerror="if(this.src!=='${fallbackSrc}'){this.src='${fallbackSrc}'}else{this.style.display='none'}">
            </div>
            <div class="card-info-modern">
                <div class="card-top-row">
                    <span class="card-name">${pm.name}</span>
                    <span class="card-lv">Lv.<span style="color:#2d3436;margin-left:2px">${pm.level}</span></span>
                </div>
                <div class="card-hp-nums">
                    ${pm.currHp} <span style="color:#b2bec3;font-weight:400">/ ${pm.maxHp}</span>
                </div>
                <div class="modern-hp-track">
                    <div class="modern-hp-fill" style="width:${hpRatio * 100}%; background:${hpColor}"></div>
                </div>
            </div>
            ${isDead ? '<div class="status-tag">FANT</div>' : ''}
        `;

        if (!isDead && !isCurrent) {
            card.onclick = () => {
                layer.classList.add('hidden');
                layer.style.display = '';
                layer.className = 'overlay-modal hidden';
                performSwitch(idx);
            };
        }

        grid.appendChild(card);
    });

    container.appendChild(header);
    container.appendChild(grid);

    if (allowCancel) {
        const footer = document.createElement('div');
        footer.className = 'switch-footer';
        footer.innerHTML = `
            <button class="btn-close-modern">
                <span class="key-hint">×</span> CANCEL
            </button>
        `;
        footer.querySelector('button').onclick = () => {
            layer.classList.add('hidden');
            layer.style.display = '';
            layer.className = 'overlay-modal hidden';
        };
        container.appendChild(footer);
    }

    layer.appendChild(container);

    if (allowCancel) {
        layer.onclick = (e) => {
            if (e.target === layer) {
                layer.classList.add('hidden');
                layer.style.display = '';
                layer.className = 'overlay-modal hidden';
            }
        };
    } else {
        layer.onclick = null;
    }
}

async function performSwitch(newIndex) {
    document.getElementById('switch-menu-layer').classList.add('hidden');

    const oldP = battle.getPlayer();
    const isForced = !oldP.isAlive() || battle.phase === 'force_switch';
    const isPivot = battle.phase === 'pivot_switch';
    const newPoke = battle.playerParty[newIndex];

    if (isPivot && battle.pendingPassBoosts) {
        battle._savedBoosts = oldP.boosts ? { ...oldP.boosts } : null;
        battle._savedSubstitute = (oldP.volatile && oldP.volatile.substitute) ? oldP.volatile.substitute : 0;
    }
    
    if (oldP.isAlive()) {
        if (oldP.isDynamaxed) {
            applyDynamaxState(oldP, false);
        }
        oldP.resetBoosts();
        
        if (typeof AbilityHandlers !== 'undefined' && oldP.ability) {
            const handler = AbilityHandlers[oldP.ability];
            if (handler && handler.onSwitchOut) handler.onSwitchOut(oldP);
        }
    }
    
    if (oldP.volatile) {
        if (oldP.volatile.yawn) delete oldP.volatile.yawn;
        if (oldP.volatile.uproar) delete oldP.volatile.uproar;
    }
    if (oldP.choiceLockedMove) delete oldP.choiceLockedMove;
    if (oldP.status === 'tox') oldP.statusTurns = 0;

    // FORCE ENGLISH NAMES
    if (isPivot) {
        log(`${oldP.name} rút lui! ${newPoke.name} lên sân!`);
    } else {
        log(isForced 
            ? `Cố lên! ${newPoke.name}!` 
            : `Về đi ${oldP.name}! ${newPoke.name}, tớ chọn cậu!`);
    }
    
    if (typeof window.playPokemonCry === 'function') {
        window.playPokemonCry(newPoke.name);
    }

    triggerEntryAbilities(newPoke, battle.getEnemy());
    
    if (typeof MoveEffects !== 'undefined' && MoveEffects.applyEntryHazards) {
        const hazardLogs = MoveEffects.applyEntryHazards(newPoke, true, battle);
        hazardLogs.forEach(msg => log(msg));
        
        if (newPoke.currHp <= 0) {
            log(`Ôi không! ${newPoke.name} bị bẫy trên sân đánh bại!`);
            updateAllVisuals();
            await checkPlayerDefeatOrForceSwitch();
            return;
        }
    }
    
    battle.playerActive = newIndex;
    
    window.currentMoveStyle = 'normal';
    if (typeof window.refreshCommanderBubble === 'function') {
        window.refreshCommanderBubble();
    }
    
    if (newPoke.hasBondResonance && typeof newPoke.applyBoost === 'function') {
        newPoke.applyBoost('atk', 1);
        newPoke.applyBoost('def', 1);
        newPoke.applyBoost('spa', 1);
        newPoke.applyBoost('spd', 1);
        newPoke.applyBoost('spe', 1);
        log(`<span style="color:#4ade80"><b>Cộng hưởng của ${newPoke.name} vẫn tiếp tục! Duy trì tăng chỉ số!</b></span>`);
    }

    if (isPivot) {
        if (battle.pendingPassSub && oldP.volatile && oldP.volatile.shedTailSub) {
            const subHp = oldP.volatile.shedTailSub;
            delete oldP.volatile.shedTailSub;
            if (!newPoke.volatile) newPoke.volatile = {};
            newPoke.volatile.substitute = subHp;
            log(`<span style="color:#3498db">🛡️ ${newPoke.name} thừa hưởng Thế Thân! (HP: ${subHp})</span>`);
        }
        
        if (battle.pendingPassBoosts) {
            if (battle._savedBoosts) {
                const hasNonZeroBoost = Object.values(battle._savedBoosts).some(v => v !== 0);
                if (hasNonZeroBoost) {
                    Object.keys(battle._savedBoosts).forEach(stat => {
                        if (newPoke.boosts) {
                            newPoke.boosts[stat] = Math.max(-6, Math.min(6, 
                                (newPoke.boosts[stat] || 0) + battle._savedBoosts[stat]));
                        }
                    });
                    log(`<span style="color:#9b59b6">${newPoke.name} thừa hưởng thay đổi chỉ số!</span>`);
                }
                delete battle._savedBoosts;
            }
            if (battle._savedSubstitute && battle._savedSubstitute > 0) {
                if (!newPoke.volatile) newPoke.volatile = {};
                newPoke.volatile.substitute = battle._savedSubstitute;
                log(`<span style="color:#3498db">🛡️ ${newPoke.name} thừa hưởng Thế Thân! (HP: ${battle._savedSubstitute})</span>`);
                delete battle._savedSubstitute;
            }
        }
        
        battle.phase = 'battle';
        updateAllVisuals();
        battle.locked = false;
        if (battle.pivotResolve) {
            const resolve = battle.pivotResolve;
            battle.pivotResolve = null;
            battle.pivotSide = null;
            resolve();
        }
        return;
    }

    battle.phase = 'battle';
    
    if (!isForced) {
        log("Đổi người nên bị đối phương tấn công!");
        battle.locked = true;
        await enemyTurn();
        
        const currentP = battle.getPlayer();
        const currentE = battle.getEnemy();
        if (currentP && currentP.isAlive() && currentE && currentE.isAlive()) {
            updateAllVisuals();
            showMovesMenu();
        }
    } else {
        updateAllVisuals();
        
        if (battle.enemyJustSwitchedInDoubleKO) {
            const newP = battle.getPlayer();
            const currentE = battle.getEnemy();
            if (newP && newP.isAlive() && currentE && currentE.isAlive()) {
                if (typeof triggerEntryAbilities === 'function') {
                    triggerEntryAbilities(currentE, newP);
                }
            }
            battle.enemyJustSwitchedInDoubleKO = false;
        }
        
        battle.locked = false;
        
        if (battle.forceSwitchResolve) {
            const resolve = battle.forceSwitchResolve;
            battle.forceSwitchResolve = null;
            resolve('switched');
        }
    }
}

// Hàm Log hỗ trợ
function log(msg) {
    const box = document.getElementById('log-box');

    let formatMsg = msg;
    formatMsg = formatMsg.replace(/(\d+)\s*(damage|sát thương)/g, '<span class="hl-dmg">$1</span> <span style="font-size:0.9em;color:#888">$2</span>');
    formatMsg = formatMsg.replace(/(Super Effective!|Hiệu quả siêu việt!)/gi, '<span class="hl-sup">Super Effective!</span>');
    formatMsg = formatMsg.replace(/(Not Very Effective\.\.\.|Hiệu quả không tốt)/gi, '<span class="hl-res">Not Very Effective...</span>');
    formatMsg = formatMsg.replace(/(Critical Hit!|Chí mạng!)/gi, '<span class="hl-crit">CRITICAL HIT!!</span>');
    formatMsg = formatMsg.replace(/(fainted|ngã xuống|mất khả năng chiến đấu)/gi, '<b style="color:#e11d48; text-decoration:underline; text-decoration-color:rgba(225,29,72,0.4)">$1</b>');

    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = formatMsg;
    box.appendChild(div);

    requestAnimationFrame(() => {
        box.scrollTop = box.scrollHeight;
    });
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// =========================================
// 【Đã di chuyển】Switch Menu -> ui/ui-menus.js
// 【Đã di chuyển】Mega/Dynamax Buttons -> ui/ui-menus.js
// 【Đã di chuyển】Evolution Animation -> ui/ui-menus.js
// =========================================

// Chức năng bỏ chạy
function tryRun() {
    if (battle.locked && battle.phase !== 'battle') return;

    const playerLabel = battle.playerName || 'Player';
    if (battle.trainer && battle.trainer.id !== 'wild') {
        log(`Đối đầu với kẻ địch mạnh, ${playerLabel} chọn rút lui chiến thuật! (Đầu hàng)`);
        const escapeLine = battle.trainer.lines?.escape || battle.trainer.lines?.win;
        if (escapeLine) {
            log(`<i>${battle.trainer.name}: "${escapeLine}"</i>`);
        }
    } else {
        log(`${playerLabel} và đồng đội đã chạy thoát thành công!`);
    }

    battle.phase = 'ended';
    battle.locked = true;

    setTimeout(() => battleEndSequence('escape'), 600);
}

// =========================================================
// 【Đã di chuyển】Hệ thống bắt Pokemon -> systems/catch-system.js
// =========================================================

// Export to window
window.initGame = initGame;
window.handleAttack = handleAttack;
window.renderSwitchMenu = renderSwitchMenu;
window.tryRun = tryRun;
window.log = log;
window.updateAllVisuals = updateAllVisuals;
window.executeEndPhase = executeEndPhase;
window.checkPlayerDefeatOrForceSwitch = checkPlayerDefeatOrForceSwitch;
window.performSwitch = performSwitch;
window.battleEndSequence = battleEndSequence;
window.showCommanderMenu = showCommanderMenu;
window.closeCommanderMenu = closeCommanderMenu;
window.updateCommanderButtons = updateCommanderButtons;
window.applyCommandEffect = applyCommandEffect;
window.clearCommandEffects = clearCommandEffects;

/* ===========================================
   Chức năng mới: Tổng kết trận đấu
=========================================== */
function battleEndSequence(result) {
    battle.phase = 'ended';
    battle.locked = true;
    
    const isTrainer = battle.trainer && battle.trainer.id !== 'wild';
    
    if (result === 'win' || result === 'caught') {
        if (typeof playVictoryBgm === 'function') {
            playVictoryBgm(isTrainer);
        }
    } else {
        if (typeof stopBgm === 'function') {
            stopBgm(500);
        }
    }

    const analysis = generateBattleReport(result);

    const overlay = document.getElementById('result-overlay');
    const card = document.getElementById('res-card-bg');
    const titleEl = document.getElementById('res-title');
    const rankLetterEl = document.getElementById('res-grade-letter');
    const rankSubEl = document.getElementById('res-grade-sub');
    const statusEl = document.getElementById('col-status');
    const descEl = document.getElementById('col-desc');
    const reasonEl = document.getElementById('col-reason');
    const dotsEl = document.getElementById('res-party-viz');
    const clipEl = document.getElementById('res-clipboard-text');

    if (!overlay || !card) return;

    overlay.classList.remove('active');
    card.classList.remove('theme-win', 'theme-loss', 'theme-escape');

    const enemyName = analysis.enemyName || 'Opponent';
    let titleCopy = 'VICTORY';
    let statusCopy = `Victory vs. ${enemyName}`;
    let themeClass = 'theme-win';

    if (result === 'loss') {
        titleCopy = 'DEFEATED';
        statusCopy = `Overwhelmed by ${enemyName}`;
        themeClass = 'theme-loss';
    } else if (result === 'escape') {
        titleCopy = 'ESCAPED';
        statusCopy = `Retreated from ${enemyName}`;
        themeClass = 'theme-escape';
    } else if (result === 'caught') {
        titleCopy = 'CAPTURED';
        statusCopy = `Captured ${enemyName}`;
        themeClass = 'theme-win';
    }

    card.classList.add(themeClass);
    if (titleEl) titleEl.textContent = titleCopy;
    if (statusEl) statusEl.textContent = statusCopy;

    const rankMatch = typeof analysis.rank === 'string'
        ? analysis.rank.match(/^([A-Z][A-Z\+\-]*)\s*(?:\((.+)\))?/i)
        : null;

    const rankLetter = rankMatch ? rankMatch[1] : analysis.rank || '?';
    const rankDescriptor = rankMatch && rankMatch[2] ? rankMatch[2] : 'RANK';

    if (rankLetterEl) rankLetterEl.textContent = rankLetter.toUpperCase();
    if (rankSubEl) rankSubEl.textContent = rankDescriptor;
    if (reasonEl) reasonEl.textContent = rankDescriptor;
    if (descEl) descEl.textContent = analysis.description || 'Chưa có mô tả.';

    if (dotsEl) {
        dotsEl.innerHTML = '';
        battle.playerParty.forEach(p => {
            const dot = document.createElement('div');
            const ratio = p.maxHp > 0 ? p.currHp / p.maxHp : 0;
            let state = 'hp-low';
            if (p.currHp <= 0) state = 'hp-dead';
            else if (ratio > 0.6) state = 'hp-100';
            else if (ratio > 0.25) state = 'hp-mid';
            dot.className = `mini-dot ${state}`;
            dotsEl.appendChild(dot);
        });
    }

    if (clipEl) {
        clipEl.value = analysis.fullReport;
    }

    let endLine = '';
    const lines = battle.trainer?.lines || {};
    if (result === 'win') {
        endLine = lines.lose;
    } else if (result === 'escape') {
        endLine = lines.escape || lines.win || lines.lose || '';
    } else {
        endLine = lines.win;
    }

    if (battle.trainer && battle.trainer.id !== 'wild' && endLine) {
        setTimeout(() => playCutIn(endLine, 4500), 100);
    }

    overlay.classList.remove('hidden');
    void overlay.offsetWidth;
    overlay.classList.add('active');
}

function generateBattleReport(result) {
    const pParty = battle.playerParty;
    const eParty = battle.enemyParty;

    const pName = battle.playerName || "Player";
    const activeEnemy = typeof battle.getEnemy === 'function'
        ? battle.getEnemy()
        : (eParty[battle.enemyActive ?? 0] || eParty[0] || null);
    const fallbackEnemyName = activeEnemy?.name || "Wild Pokemon";

    let eName = fallbackEnemyName || "Enemy";
    if (battle.trainer) {
        if (battle.trainer.id !== 'wild') {
            eName = battle.trainer.name || battle.trainer.title || battle.trainer.id || fallbackEnemyName || "Enemy";
        } else {
            eName = battle.trainer.name?.trim()
                || fallbackEnemyName
                || (battle.trainer.title && battle.trainer.title.toLowerCase() !== 'wild' ? battle.trainer.title : '')
                || "Wild Pokemon";
        }
    }

    const survivors = pParty.filter(p => p.currHp > 0);
    const fallen = pParty.filter(p => p.currHp <= 0);
    const survivorTxt = survivors.length > 0
        ? survivors.map(p => `${p.name}(${Math.round((p.currHp / Math.max(1, p.maxHp)) * 100)}%)`).join(', ')
        : "Không còn ai";

    const avgLevel = party => party.length
        ? party.reduce((sum, poke) => sum + (poke.level || poke.lv || 1), 0) / party.length
        : 0;

    let pTotalHpPct = 0;
    pParty.forEach(p => pTotalHpPct += (p.maxHp > 0 ? p.currHp / p.maxHp : 0));
    const pHpHealth = pParty.length > 0 ? Math.floor((pTotalHpPct / pParty.length) * 100) : 0;

    const eFallen = eParty.filter(p => p.currHp <= 0);
    let eTotalHpPct = 0;
    eParty.forEach(p => eTotalHpPct += (p.maxHp > 0 ? p.currHp / p.maxHp : 0));
    const eHpHealth = eParty.length > 0 ? Math.floor((eTotalHpPct / eParty.length) * 100) : 0;

    const avgPLv = avgLevel(pParty);
    const avgELv = avgLevel(eParty);
    const levelDiff = avgELv - avgPLv;

    const isTrainer = battle.trainer && battle.trainer.id !== 'wild';

    let rank = 'C';
    let desc = '';
    let resultTextDisplay = result === 'win' ? '【CHIẾN THẮNG】' : '【THẤT BẠI】';

    if (result === 'escape') {
        if (levelDiff > 30) {
            rank = 'B (Chiến thuật rút lui)';
            desc = 'Đối mặt chênh lệch cấp độ, chọn bảo toàn lực lượng là thông minh.';
        } else if (levelDiff > 10) {
            rank = 'C (Cẩn trọng)';
            desc = 'Nhận ra đối thủ khó nhằn, chọn không đối đầu.';
        } else if (survivors.length === 0) {
            rank = 'D (Tháo chạy)';
            desc = 'Vỡ trận, buộc phải rút lui.';
        } else {
            rank = 'D (Rời trận)';
            desc = isTrainer
                ? 'Đầu hàng trước huấn luyện viên.'
                : 'Thành công thoát khỏi Pokemon hoang dã.';
        }
        resultTextDisplay = '【RÚT LUI】';
    } else if (result === 'caught') {
        rank = 'CAPTURE (Thu phục)'; 
        desc = 'Đèn chỉ thị ngừng nhấp nháy. Mục tiêu đã bị bắt giữ.'; 
        resultTextDisplay = '【THU PHỤC】';
        if (eHpHealth > 70) {
            desc += ' Critical Capture tuyệt vời khi còn đầy máu!';
        } else if (eHpHealth < 10) {
            desc += ' Kiểm soát lượng máu hoàn hảo để bắt giữ!';
        }
    } else if (result === 'win') {
        const deadCount = fallen.length;
        if (deadCount === 0) {
            if (pHpHealth >= 95) { rank = 'S+ (Hoàn hảo)'; desc = 'Chiến thắng không tì vết.'; }
            else if (pHpHealth >= 80) { rank = 'S (Áp đảo)'; desc = 'Làm chủ hoàn toàn trận đấu.'; }
            else if (pHpHealth >= 60) { rank = 'A+ (Dễ dàng)'; desc = 'Tuy có giao tranh nhưng vẫn nắm quyền chủ động.'; }
            else { rank = 'A (Thắng lợi)'; desc = 'Đối thủ mạnh nhưng bạn đã giỏi hơn.'; }
        } else {
            const deadRatio = pParty.length > 0 ? deadCount / pParty.length : 1;
            if (deadRatio < 0.5) { rank = 'B (Khổ chiến)'; desc = 'Chiến thắng khó khăn với cái giá phải trả.'; }
            else if (deadRatio < 0.9) { rank = 'C (Tử chiến)'; desc = 'Chỉ còn người hùng cuối cùng đứng vững...'; }
            else { rank = 'C- (Lội ngược dòng)'; desc = 'Phép màu phút chót khi chỉ còn một chấm máu.'; }
        }
    } else {
        if (eFallen.length === 0) {
            if (eHpHealth >= 90) { rank = 'F (Thảm bại)'; desc = 'Chênh lệch sức mạnh quá lớn...'; }
            else if (eHpHealth >= 70) { rank = 'E (Thua đậm)'; desc = 'Không thể gây ra mối đe dọa nào.'; }
            else if (eHpHealth >= 40) { rank = 'D (Yếu thế)'; desc = 'Đã cố gắng nhưng vẫn bị áp đảo.'; }
            else if (eHpHealth >= 15) { rank = 'C (Cân sức)'; desc = 'Trận chiến kịch tính, chỉ thiếu chút may mắn.'; }
            else { rank = 'C+ (Tiếc nuối)'; desc = 'Dồn đối thủ vào đường cùng! Chỉ thiếu đúng một đòn...'; }
        } else {
            const killRatio = eParty.length > 0 ? (eFallen.length / eParty.length) : 0;
            if (killRatio > 0.6) {
                rank = 'B- (Hủy diệt)';
                desc = 'Dù thua nhưng đây là trận chiến đáng tôn trọng.';
            } else {
                rank = 'D+ (Hỗn chiến)';
                desc = 'Đã gây tổn thất cho địch nhưng không thể trụ đến cùng.';
            }
        }
    }

    const rows = [];
    let summaryLine;
    if (result === 'escape') {
        summaryLine = `- Tổng kết: ${pName} đã 【Rút lui/Đầu hàng】 trước ${eName}.`;
    } else if (result === 'caught') {
        summaryLine = `- Tổng kết: ${pName} đã thu phục ${eName}.`;
    } else {
        summaryLine = `- Tổng kết: ${pName} vs ${eName}, kết quả: ${resultTextDisplay}.`;
    }
    rows.push(`- Kết quả: ${resultTextDisplay}`);
    rows.push(`- Xếp hạng: ${rank}`);
    rows.push(summaryLine);
    rows.push(`- Diễn biến: ${desc}`);

    if (result === 'win' && battle.trainer?.lines?.lose) {
        rows.push(`- Địch thua: "${battle.trainer.lines.lose}"`);
    } else if (result === 'escape' && battle.trainer?.lines?.escape) {
        rows.push(`- Địch nói: "${battle.trainer.lines.escape}"`);
    } else if (result === 'loss' && battle.trainer?.lines?.win) {
        rows.push(`- Địch thắng: "${battle.trainer.lines.win}"`);
    }

    const formatEnemyName = poke => (poke?.name || '???');
    const enemyStatusLine = eParty.length > 0
        ? eParty.map((poke, idx) => {
            const pct = poke.maxHp > 0 ? Math.round((Math.max(0, poke.currHp) / poke.maxHp) * 100) : 0;
            const state = poke.currHp <= 0 ? 'FNT' : `${pct}%`;
            const marker = idx === (battle.enemyActive ?? 0) ? '*' : '';
            return `${marker}${formatEnemyName(poke)}(${state})`;
        }).join(' / ')
        : 'Unknown';

    rows.push(`- Phe ta còn lại: ${survivorTxt}`);
    rows.push(`- Phe địch: ${enemyStatusLine}`);
    if (result !== 'escape' && fallen.length > 0) {
        rows.push(`- Danh sách bị hạ: ${fallen.map(p => p.name).join(', ')}`);
    }

    // =========================================================
    // 【Hệ thống Gợi ý Phát triển】Phong cách Anime
    // =========================================================
    let growthData = null;
    if (typeof window.calculateAnimeGrowth === 'function') {
        growthData = window.calculateAnimeGrowth({
            rank: rank,
            hpHealth: pHpHealth,
            levelDiff: levelDiff,
            resultLabel: resultTextDisplay
        }, result);
        
        if (typeof window.formatGrowthReport === 'function') {
            const growthRows = window.formatGrowthReport(growthData);
            growthRows.forEach(row => rows.push(row));
        }
    }

    return {
        rank,
        description: desc,
        playerName: pName,
        enemyName: eName,
        resultLabel: resultTextDisplay,
        summaryLine,
        fullReport: rows.join('\n'),
        fallenCount: fallen.length,
        survivorCount: survivors.length,
        hpHealth: pHpHealth,
        growth: growthData
    };
}

window.restartBattle = function() {
    document.getElementById('result-overlay').classList.add('hidden');
    const logBox = document.getElementById('log-box');
    if (logBox) {
        logBox.innerHTML = '';
    }
    battle = new BattleState();
    window.battle = battle;
    
    if (typeof stopBgm === 'function') {
        stopBgm(0);
    }
    
    log("=== RESET BATTLE ===");
    initGame();
};

// =========================================================
// 【Đã di chuyển】Log Filter -> systems/log-filter.js
// =========================================================

/**
 * =========================================================
 * BATTLE EVOLUTION SYSTEM V2 (Hệ thống Tiến hóa Trận mạc)
 * =========================================================
 * Thiết kế song song:
 * 1. Tiến hóa Sinh học (Bio): Đột phá khi gặp nguy hiểm ở giai đoạn 1, 2
 * 2. Cộng hưởng Linh hồn (Bond): Bùng nổ ở dạng cuối cùng
 * =========================================================
 */

window.EvolutionSystem = {
    /**
     * Kiểm tra bất lợi
     * @returns {boolean}
     */
    checkDisadvantage: function() {
        if (!battle || !battle.playerParty || !battle.enemyParty) return false;
        
        let pTotalNow = 0, pTotalMax = 0;
        battle.playerParty.forEach(p => { 
            if (p && typeof p.currHp === 'number') {
                pTotalNow += Math.max(0, p.currHp); 
                pTotalMax += p.maxHp || 1;
            }
        });
        const playerRatio = pTotalNow / Math.max(1, pTotalMax);
        
        let eTotalNow = 0, eTotalMax = 0;
        battle.enemyParty.forEach(e => { 
            if (e && typeof e.currHp === 'number') {
                eTotalNow += Math.max(0, e.currHp); 
                eTotalMax += e.maxHp || 1;
            }
        });
        const enemyRatio = eTotalNow / Math.max(1, eTotalMax);
        
        const alivePlayer = battle.playerParty.filter(p => p && typeof p.isAlive === 'function' && p.isAlive()).length;
        const aliveEnemy = battle.enemyParty.filter(e => e && typeof e.isAlive === 'function' && e.isAlive()).length;
        
        const isAbsoluteLastOne = (alivePlayer === 1) && (playerRatio <= 0.40);
        const isNearWipeout = playerRatio <= 0.10;
        const isOneVsMany = (alivePlayer === 1) && (aliveEnemy >= 2);
        
        return isAbsoluteLastOne || isNearWipeout || isOneVsMany;
    },

    /**
     * Kiểm tra điều kiện tiến hóa
     * @param {Pokemon} pokemon
     * @returns {Object|null}
     */
    checkEligibility: function(pokemon) {
        if (window.GAME_SETTINGS && !window.GAME_SETTINGS.enableEVO) return null;
        
        if (!pokemon || pokemon.currHp <= 0) return null;
        if (pokemon.hasEvolvedThisBattle || pokemon.hasBondResonance) return null;

        const avs = pokemon.avs || { trust: 0, passion: 0, insight: 0, devotion: 0 };
        const totalAVs = (pokemon.getEffectiveAVs('trust') || 0) + 
                         (pokemon.getEffectiveAVs('passion') || 0) + 
                         (pokemon.getEffectiveAVs('insight') || 0) + 
                         (pokemon.getEffectiveAVs('devotion') || 0);

        const baseId = pokemon.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const data = typeof POKEDEX !== 'undefined' ? POKEDEX[baseId] : null;
        if (!data) return null;

        const hpRatio = pokemon.currHp / pokemon.maxHp;

        // ============================================
        // Tuyến A: Tiến hóa Sinh học (Bio)
        // ============================================
        if (data.evos && data.evos.length > 0) {
            if (pokemon.isMega || pokemon.isTransformed) return null;
            
            const nextFormName = data.evos[0];
            const nextId = nextFormName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const nextData = typeof POKEDEX !== 'undefined' ? POKEDEX[nextId] : null;
            if (!nextData) return null;

            const allowedEvoTypes = [undefined, 'levelFriendship'];
            if (!allowedEvoTypes.includes(nextData.evoType)) return null;

            // 1. Level Lock (-3 cấp)
            const reqLevel = Math.max(1, (nextData.evoLevel || 1) - 3);
            if (pokemon.level < reqLevel) return null;

            // 2. AVS Threshold
            const isFirstStage = !data.prevo;
            const nextHasEvos = nextData.evos && nextData.evos.length > 0;
            
            let reqAVs;
            if (isFirstStage) {
                reqAVs = 80;
            } else if (!nextHasEvos) {
                reqAVs = 140;
            } else {
                reqAVs = 160;
            }
            if (totalAVs < reqAVs) return null;

            // 3. Crisis Lock
            const isCrisis = hpRatio <= 0.45;
            const isAceMoment = pokemon.isAce && hpRatio <= 0.6;
            
            if (isCrisis || isAceMoment) {
                return {
                    type: 'bio',
                    currentName: pokemon.name,
                    targetName: nextFormName,
                    targetId: nextId,
                    nextData: nextData,
                    totalAVs: totalAVs,
                    reqAVs: reqAVs
                };
            }
        }
        // ============================================
        // Tuyến B: Bond Resonance
        // ============================================
        else {
            const unlocks = battle.playerUnlocks || {};
            if (unlocks.enable_bond === false) return null;
            if (battle.playerBondUsed) return null;
            
            if (totalAVs < 220) return null;
            if (!pokemon.isAce) return null;

            let playerTotalHp = 0, enemyTotalHp = 0;
            battle.playerParty.forEach(pp => {
                if (pp && typeof pp.isAlive === 'function') {
                    playerTotalHp += Math.max(0, pp.currHp || 0);
                }
            });
            battle.enemyParty.forEach(ep => {
                if (ep && typeof ep.isAlive === 'function') {
                    enemyTotalHp += Math.max(0, ep.currHp || 0);
                }
            });
            
            const aliveCount = battle.playerParty.filter(p => p && typeof p.isAlive === 'function' && p.isAlive()).length;
            const isLastStand = aliveCount === 1;
            
            const currentPokemonCritical = hpRatio <= 0.50;
            const isSmallBattle = (battle.playerParty.length <= 2 && battle.enemyParty.length <= 2);
            const isHpDisadvantage = playerTotalHp < enemyTotalHp * 0.5;
            
            const canTriggerBond = currentPokemonCritical && (isLastStand || (isSmallBattle && isHpDisadvantage));

            if (canTriggerBond) {
                return {
                    type: 'bond',
                    currentName: pokemon.name,
                    targetName: `Bond · ${pokemon.name}`,
                    totalAVs: totalAVs,
                    isLastStand: isLastStand,
                    isHpDisadvantage: isHpDisadvantage
                };
            }
        }

        return null;
    }
};

/**
 * Update Evo Button
 */
function updateEvolutionButtonVisuals() {
    const btn = document.getElementById('btn-evolved');
    if (btn) btn.classList.add('hidden');
  
    const p = battle.getPlayer();
    if (!p) return;
    
    const evoInfo = window.EvolutionSystem.checkEligibility(p);
    if (!evoInfo) return;

    if (evoInfo.type === 'bio' && !p._evoHintLogged) {
        log(`<span style="color:#d4ac0d; text-shadow:0 0 5px gold;">✨ ${p.name} đang tỏa sáng ánh sáng tiến hóa... Nó đang đáp lại ý chí của bạn!</span>`);
        p._evoHintLogged = true;
        if (typeof window.refreshCommanderBubble === 'function') {
            window.refreshCommanderBubble();
        }
    } else if (evoInfo.type === 'bond' && !p._bondHintLogged) {
        log(`<span style="color:#4ade80; text-shadow:0 0 8px #22c55e;">∞ Nhịp tim của ${p.name} và bạn đang đồng bộ... Liên kết (Bond) đang thức tỉnh!</span>`);
        p._bondHintLogged = true;
        if (typeof window.refreshCommanderBubble === 'function') {
            window.refreshCommanderBubble();
        }
    }
}

/**
 * Trigger Battle Evolution
 */
window.triggerBattleEvolution = async function() {
    const btn = document.getElementById('btn-evolved');
    const p = battle.getPlayer();
  
    if (!p) return;
    const evoInfo = window.EvolutionSystem.checkEligibility(p);
    if (!evoInfo) return;

    battle.locked = true;
    if (btn) btn.classList.add('hidden');
    
    const spriteRef = document.getElementById('player-sprite');

    // ============================================
    // Tuyến A: Bio Evolution
    // ============================================
    if (evoInfo.type === 'bio') {
        p.hasEvolvedThisBattle = true;
        const oldName = p.name;
        
        log(`<div class="log-evo-intro">✨ EVOLUTION ✨</div>`);
        log(`Hình dáng của ${oldName}...!`);
        await wait(300);
        
        if (spriteRef) {
            spriteRef.classList.add('bio-evo-glow');
        }
        await wait(800);
        
        const newData = evoInfo.nextData;
        p.name = newData.name;
        p.cnName = newData.name;
        p.types = newData.types || p.types;
        p.baseStats = newData.baseStats;
        
        const stats = calcStats(p.baseStats, p.level, {
            ivs: p.statsMeta?.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
            ev_level: p.statsMeta?.ev_level || 0,
            nature: p.nature
        });
        
        p.maxHp = stats.hp;
        p.atk = stats.atk;
        p.def = stats.def;
        p.spa = stats.spa;
        p.spd = stats.spd;
        p.spe = stats.spe;

        p.currHp = p.maxHp;
        p.status = null;
      
        if (typeof p.applyBoost === 'function') {
            p.applyBoost('atk', 1);
            p.applyBoost('def', 1);
            p.applyBoost('spa', 1);
            p.applyBoost('spd', 1);
            p.applyBoost('spe', 1);
        }
        
        if (spriteRef) {
            spriteRef.classList.remove('bio-evo-glow');
            spriteRef.classList.add('bio-evo-burst');
            
            const newSrc = p.getSprite(true);
            if (typeof smartLoadSprite === 'function') {
                delete spriteRequestedUrls['player-sprite'];
                smartLoadSprite('player-sprite', newSrc, false);
                spriteRequestedUrls['player-sprite'] = newSrc;
            }
        }
        await wait(400);
        
        if (spriteRef) {
            spriteRef.classList.remove('bio-evo-burst');
            spriteRef.classList.add('bio-evo-finish');
        }
        await wait(600);
        
        if (spriteRef) {
            spriteRef.classList.remove('bio-evo-silhouette', 'bio-evo-burst', 'bio-evo-finish');
            if (!spriteRef.classList.contains('loaded')) {
                spriteRef.classList.add('loaded');
            }
        }
        
        log(`……${oldName} được bao phủ bởi ánh sáng rực rỡ!`);
        log(`<b style="color:#a855f7">Chúc mừng! ${oldName} đã tiến hóa thành ${p.name}!</b>`);
        log(`<span style="color:#4ade80">Hồi phục hoàn toàn! Chỉ số tăng lên!</span>`);
        
        if (p.avs) {
            p.avsEvolutionBoost = true;
            log(`<span style="color:#ff6b9d">💖 Sự tiến hóa kích hoạt sức mạnh cảm xúc! Hiệu quả AVS nhân đôi!</span>`);
        }
    }
    // ============================================
    // Tuyến B: Bond Resonance
    // ============================================
    else if (evoInfo.type === 'bond') {
        p.hasBondResonance = true;
        battle.playerBondUsed = true;
        const avs = p.avs || {};
        const totalAVs = (avs.trust || 0) + (avs.passion || 0) + (avs.insight || 0) + (avs.devotion || 0);
        
        log(`<div style="border-top: 2px solid #4ade80; border-bottom: 2px solid #4ade80; padding: 8px; text-align: center; margin: 10px 0; background: linear-gradient(90deg, rgba(74,222,128,0.1), rgba(74,222,128,0.3), rgba(74,222,128,0.1));">`);
        log(`<b style="font-size:1.4em; color:#4ade80; text-shadow: 0 0 10px #22c55e;">∞ BOND RESONANCE ∞</b>`);
        log(`</div>`);
        await wait(500);
        
        log(`Nhịp tim của cả hai hòa làm một...`);
        await wait(400);
        log(`Đáp lại sự tin tưởng tuyệt đối <span style="color:#facc15">(Total AVs: ${totalAVs})</span>, giới hạn cơ thể bị phá vỡ!`);
        
        if (spriteRef) {
            spriteRef.classList.add('evo-burst');
            spriteRef.style.filter = 'brightness(3) drop-shadow(0 0 20px gold)';
        }
        await wait(400);
        
        if (spriteRef) {
            spriteRef.classList.remove('evo-burst');
            spriteRef.classList.add('evo-finish');
            spriteRef.style.filter = 'drop-shadow(0 0 15px gold) brightness(1.15) saturate(1.2)';
        }
        await wait(600);
        
        if (spriteRef) {
            spriteRef.classList.remove('evo-finish');
            spriteRef.classList.add('bond-resonance');
        }
        
        const healAmount = Math.floor(p.maxHp * 0.6);
        p.currHp = Math.min(p.currHp + healAmount, p.maxHp);
        p.status = null;
        
        if (typeof p.applyBoost === 'function') {
            p.applyBoost('atk', 1);
            p.applyBoost('def', 1);
            p.applyBoost('spa', 1);
            p.applyBoost('spd', 1);
            p.applyBoost('spe', 1);
            
            log(`<b style="color:#4ade80">✦ ${p.name} thức tỉnh tiềm năng! Tăng toàn bộ chỉ số!</b>`);
        }
        
        await wait(300);
        log(`Đây không phải tiến hóa... mà là <b style="color:#facc15">Hình thái Cộng hưởng</b> vượt qua cả tiến hóa!`);
        log(`<span style="color:#4ade80">✦ Tăng mạnh toàn bộ thuộc tính!</span>`);
        log(`<span style="color:#60a5fa">✦ Khí thế (HP) hồi phục mạnh mẽ! (+${healAmount})</span>`);
        log(`<span style="color:#ff6b9d">✦ Hiệu quả AVS nhân đôi!</span>`);
        
        if (evoInfo.isLastStand) {
            log(`<span style="color:#f87171; font-style:italic;">「Dù chỉ còn một hơi thở... tuyệt đối không bỏ cuộc!」</span>`);
        }
    }
  
    updateAllVisuals();
    battle.locked = false;
    
    if (typeof window.refreshCommanderBubble === 'function') {
        window.refreshCommanderBubble();
    }
};

// =========================================================
// COMMANDER SYSTEM (Hệ thống Chỉ Huy Chiến Thuật)
// =========================================================

/**
 * Khởi tạo hệ thống
 */
function initCommanderSystem() {
    battle.trainerProficiency = battle.trainerProficiency ?? 0;
    battle.activeCommand = null;
    
    battle.commandUsage = {
        dodge: 0,
        crit: 0,
        cure: 0,
        endure: 0
    };
    
    battle.commandLimits = {
        dodge: 99,
        crit: 99,
        cure: 2,
        endure: 2
    };
    
    const p = battle.getPlayer?.();
    const initSyncScore = p ? getCommanderSyncScore(battle.trainerProficiency ?? 0, p) : 0;
    
    if (initSyncScore < 120) {
        battle.commandCooldown = getCommanderCooldown(initSyncScore);
        if (battle.commandCooldown < 0) battle.commandCooldown = 0;
        console.log(`[COMMANDER v2] Init Cooldown: ${battle.commandCooldown} (Sync: ${initSyncScore} < 120)`);
    } else {
        battle.commandCooldown = 0;
        console.log(`[COMMANDER v2] No Init Cooldown (Sync: ${initSyncScore} >= 120)`);
    }
    
    const proficiency = battle.trainerProficiency ?? 0;
    if (proficiency < 101) {
        battle.playerStyleCooldown = getStyleCooldown(proficiency);
        console.log(`[STYLES v3] Init Cooldown: ${battle.playerStyleCooldown} (Prof: ${proficiency} < 101)`);
    } else {
        battle.playerStyleCooldown = 0;
        console.log(`[STYLES v3] No Init Cooldown (Prof: ${proficiency} >= 101)`);
    }
    
    console.log(`[COMMANDER v2] Init. Prof: ${proficiency}, Sync: ${initSyncScore}`);
}

/**
 * Kiểm tra có hiển thị menu không
 */
function shouldShowCommanderMenu() {
    if (window.GAME_SETTINGS && !window.GAME_SETTINGS.enableCommander) return false;
    
    if (!battle || battle.locked) return false;
    
    const p = battle.getPlayer();
    if (!p || !p.isAce || p.currHp <= 0) return false;
    
    const proficiency = battle.trainerProficiency ?? 0;
    const syncScore = getCommanderSyncScore(proficiency, p);
    const requiredCooldown = getCommanderCooldown(syncScore);
    
    if (requiredCooldown < 0) {
        console.log(`[COMMANDER v2] Low Sync (${syncScore}), Disabled`);
        return false;
    }
    
    if (battle.commandCooldown > 0) {
        console.log(`[COMMANDER v2] Cooldown: ${battle.commandCooldown}`);
        return false;
    }
    
    const dodgeAvailable = !p.commandDodgeUsed;
    const critAvailable = !p.commandCritUsed;
    const cureAvailable = !p.commandCureUsed && battle.commandUsage.cure < battle.commandLimits.cure;
    const endureAvailable = !p.commandEndureUsed && battle.commandUsage.endure < battle.commandLimits.endure;
    
    const hasAvailableCommand = dodgeAvailable || critAvailable || cureAvailable || endureAvailable;
    if (!hasAvailableCommand) {
        console.log(`[COMMANDER v2] No Commands`);
        return false;
    }
    
    console.log(`[COMMANDER v2] Available! Sync: ${syncScore}, CD Cycle: ${requiredCooldown}`);
    return true;
}

/**
 * Hiển thị Menu
 */
function showCommanderMenu() {
    const overlay = document.getElementById('commander-overlay');
    if (!overlay) return;
    
    updateCommanderButtons();
    overlay.classList.remove('hidden');
    
    if (typeof window.playSFX === 'function') {
        window.playSFX('CONFIRM');
    }
    
    log(`<span style="color:#fbbf24; font-weight:bold;">⚡ Khoảnh khắc lóe sáng! Bạn cảm nhận sự cộng hưởng với đồng đội!</span>`);
    console.log(`[COMMANDER] Menu shown`);
}

/**
 * Đóng Menu
 */
function closeCommanderMenu() {
    const overlay = document.getElementById('commander-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
    
    if (typeof window.playSFX === 'function') {
        window.playSFX('CANCEL');
    }
    console.log(`[COMMANDER] Menu closed`);
}

/**
 * Update Buttons
 */
function updateCommanderButtons() {
    const p = battle.getPlayer();
    const btnMap = {
        dodge: '.pos-top',
        cure: '.pos-left',
        crit: '.pos-right',
        endure: '.pos-bottom'
    };
    
    const dodgeBtn = document.querySelector(btnMap.dodge);
    if (dodgeBtn && p) {
        if (p.commandDodgeUsed) {
            dodgeBtn.disabled = true;
            dodgeBtn.style.opacity = '0.4';
            dodgeBtn.style.pointerEvents = 'none';
        } else {
            dodgeBtn.disabled = false;
            dodgeBtn.style.opacity = '1';
            dodgeBtn.style.pointerEvents = 'auto';
        }
    }
    
    const critBtn = document.querySelector(btnMap.crit);
    if (critBtn && p) {
        if (p.commandCritUsed) {
            critBtn.disabled = true;
            critBtn.style.opacity = '0.4';
            critBtn.style.pointerEvents = 'none';
        } else {
            critBtn.disabled = false;
            critBtn.style.opacity = '1';
            critBtn.style.pointerEvents = 'auto';
        }
    }
    
    const cureBtn = document.querySelector(btnMap.cure);
    if (cureBtn && p) {
        const cureDisabled = p.commandCureUsed || battle.commandUsage.cure >= battle.commandLimits.cure;
        if (cureDisabled) {
            cureBtn.disabled = true;
            cureBtn.style.opacity = '0.4';
            cureBtn.style.pointerEvents = 'none';
        } else {
            cureBtn.disabled = false;
            cureBtn.style.opacity = '1';
            cureBtn.style.pointerEvents = 'auto';
        }
    }
    
    const endureBtn = document.querySelector(btnMap.endure);
    if (endureBtn && p) {
        const endureDisabled = p.commandEndureUsed || battle.commandUsage.endure >= battle.commandLimits.endure;
        if (endureDisabled) {
            endureBtn.disabled = true;
            endureBtn.style.opacity = '0.4';
            endureBtn.style.pointerEvents = 'none';
        } else {
            endureBtn.disabled = false;
            endureBtn.style.opacity = '1';
            endureBtn.style.pointerEvents = 'auto';
        }
    }
}

/**
 * Nạp lệnh
 */
window.armCommand = function(command) {
    const p = battle.getPlayer();
    if (!p) return;
    
    const commandInfo = {
        dodge: { emoji: '👁️', label: 'DODGE!', cn: 'Mau tránh đi', avs: 'Insight', color: '#00cec9' },
        crit: { emoji: '🔥', label: 'FOCUS!', cn: 'Vào điểm yếu', avs: 'Passion', color: '#ff6b6b' },
        cure: { emoji: '🤝', label: 'LISTEN!', cn: 'Tỉnh lại đi', avs: 'Trust', color: '#f1c40f' },
        endure: { emoji: '🛡️', label: 'HOLD ON!', cn: 'Ráng chịu đựng', avs: 'Devotion', color: '#a55eea' }
    };
    
    if (battle.commandArmed === command) {
        battle.commandArmed = null;
        log(`<span style="color:#94a3b8">Hủy lệnh ${commandInfo[command].label}.</span>`);
        return false;
    }
    
    if (window.currentMoveStyle && window.currentMoveStyle !== 'normal') {
        log(`<span style="color:#94a3b8">Hủy Style, chuyển sang Lệnh Chỉ Huy.</span>`);
        window.currentMoveStyle = 'normal';
        if (typeof window.setMoveStyle === 'function') {
            window.setMoveStyle('normal');
        }
    }
    
    if (battle.evoArmed) {
        log(`<span style="color:#94a3b8">Hủy Tiến Hóa, chuyển sang Lệnh Chỉ Huy.</span>`);
        battle.evoArmed = null;
    }
    
    const usedKey = `command${command.charAt(0).toUpperCase() + command.slice(1)}Used`;
    if (p[usedKey]) {
        log(`<span style="color:#ef4444;">${p.name} đã dùng lệnh ${commandInfo[command].label} trong trận này rồi!</span>`);
        return false;
    }
    
    if ((command === 'cure' || command === 'endure') && 
        battle.commandUsage[command] >= battle.commandLimits[command]) {
        log(`<span style="color:#ef4444;">Lệnh ${commandInfo[command].label} đã hết lượt dùng toàn cục!</span>`);
        return false;
    }
    
    if (battle.commandArmed && battle.commandArmed !== command) {
        const oldInfo = commandInfo[battle.commandArmed];
        log(`<span style="color:#94a3b8">Hủy lệnh ${oldInfo.label}, chuyển sang ${commandInfo[command].label}</span>`);
    }
    
    battle.commandArmed = command;
    const info = commandInfo[command];
    
    log(`<span style="color:${info.color}">🎯 Lệnh ${info.label} đã sẵn sàng! Sẽ kích hoạt khi chọn chiêu!</span>`);
    console.log(`[COMMANDER] Command armed: ${command}`);
    
    return true;
};

/**
 * Kích hoạt lệnh đã nạp
 */
window.triggerArmedCommand = function() {
    const command = battle.commandArmed;
    if (!command) return false;
    
    const p = battle.getPlayer();
    if (!p) return false;
    
    const commandInfo = {
        dodge: { emoji: '👁️', label: 'DODGE!', cn: 'Mau tránh đi', avs: 'Insight', color: '#00cec9' },
        crit: { emoji: '🔥', label: 'FOCUS!', cn: 'Vào điểm yếu', avs: 'Passion', color: '#ff6b6b' },
        cure: { emoji: '🤝', label: 'LISTEN!', cn: 'Tỉnh lại đi', avs: 'Trust', color: '#f1c40f' },
        endure: { emoji: '🛡️', label: 'HOLD ON!', cn: 'Ráng chịu đựng', avs: 'Devotion', color: '#a55eea' }
    };
    
    const info = commandInfo[command];
    
    battle.activeCommand = command;
    battle.commandUsage[command]++;
    
    const usedKey = `command${command.charAt(0).toUpperCase() + command.slice(1)}Used`;
    p[usedKey] = true;
    
    const proficiency = battle.trainerProficiency ?? 0;
    const syncScore = getCommanderSyncScore(proficiency, p);
    const commandCooldown = getCommanderCooldown(syncScore);
    battle.commandCooldown = Math.max(1, commandCooldown);
    console.log(`[COMMANDER v2] Set Cooldown: ${battle.commandCooldown} (Sync: ${syncScore})`);
    
    if (typeof window.playSFX === 'function') {
        window.playSFX('MEGA_EVOLVE');
    }
    
    log(`<div style="border-left: 4px solid ${info.color}; padding-left: 10px; margin: 5px 0;">`);
    log(`<b style="color:${info.color}; font-size: 1.1em;">🗣️ [Chỉ Huy] "${info.cn}!"</b>`);
    log(`<span style="color:#9ca3af; font-size: 0.9em;">${p.name} cảm nhận được ý chí của Trainer! (${info.avs})</span>`);
    log(`</div>`);
    
    applyCommandEffect(command, p);
    
    battle.commandArmed = null;
    
    if (typeof window.refreshCommanderBubble === 'function') {
        window.refreshCommanderBubble();
    }
    
    return true;
};

window.triggerCommand = function(command) {
    window.armCommand(command);
};

/**
 * Apply Effect
 */
function applyCommandEffect(command, pokemon) {
    switch (command) {
        case 'dodge':
            pokemon.commandDodgeActive = true;
            break;
            
        case 'crit':
            pokemon.commandCritActive = true;
            break;
            
        case 'cure':
            let listenChance = 0.40;
            if (pokemon.isAce && pokemon.avs) {
                const baseDevotion = pokemon.getEffectiveAVs('devotion');
                if (baseDevotion > 0) {
                    const effectiveDevotion = pokemon.avsEvolutionBoost ? baseDevotion * 2 : baseDevotion;
                    const devotionBonus = (Math.min(effectiveDevotion, 255) / 255) * 0.50;
                    listenChance += devotionBonus;
                }
            }
            
            listenChance = Math.min(listenChance, 1.0);
            const listenRoll = Math.random();
            
            if (listenRoll < listenChance) {
                let cured = false;
                if (pokemon.volatile) {
                    if (pokemon.volatile.flinch) {
                        delete pokemon.volatile.flinch;
                        cured = true;
                    }
                    if (pokemon.volatile.confusion) {
                        delete pokemon.volatile.confusion;
                        delete pokemon.volatile.confusionTurns;
                        cured = true;
                    }
                    if (pokemon.volatile.attract) {
                        delete pokemon.volatile.attract;
                        cured = true;
                    }
                }
                if (cured) {
                    log(`<b style="color:#f1c40f">💫 ${pokemon.name} đã lấy lại tỉnh táo!</b>`);
                }
                pokemon.commandCureActive = true;
                log(`<b style="color:#ff9f43; text-shadow:0 0 8px #ff9f43;">🤝 Lệnh LISTEN! thành công! ${pokemon.name} tuân theo chỉ dẫn!</b>`);
            } else {
                log(`<span style="color:#ef4444;">Lệnh LISTEN! thất bại... ${pokemon.name} không nghe thấy...</span>`);
            }
            break;
            
        case 'endure':
            pokemon.commandEndureActive = true;
            break;
    }
}

/**
 * Clear Effects
 */
function clearCommandEffects() {
    const p = battle.getPlayer();
    if (p) {
        p.commandDodgeActive = false;
        p.commandCritActive = false;
        p.commandCureActive = false;
        p.commandEndureActive = false;
    }
    
    battle.activeCommand = null;
    
    if (battle.commandCooldown > 0) {
        battle.commandCooldown--;
    }
}

// ============================================
// 【Hệ thống Lớp phủ】Mô tả Helper
// ============================================

function _getTargetDescription(target) {
    if (!target) return 'Toàn thể';
    
    switch (target.type) {
        case 'all': return 'Toàn thể';
        case 'pokemonType': return `Pokemon hệ ${target.value}`;
        case 'moveType': return `Chiêu hệ ${target.value}`;
        case 'moveFlag': return `Chiêu loại ${target.value}`;
        case 'side': return target.value === 'player' ? 'Phe Ta' : 'Phe Địch';
        case 'not': return `Không phải (${_getTargetDescription(target.inner)})`;
        case 'hasAbility': return `Có đặc tính ${target.value}`;
        case 'hasItem': return `Cầm vật phẩm ${target.value}`;
        case 'grounded': return 'Pokemon chạm đất';
        case 'and': 
            return target.conditions?.map(c => _getTargetDescription(c)).join(' VÀ ') || 'Toàn thể';
        case 'or':
            return target.conditions?.map(c => _getTargetDescription(c)).join(' HOẶC ') || 'Toàn thể';
        default: return 'Toàn thể';
    }
}

function _getEffectsDescription(effects) {
    if (!effects) return '';
    const parts = [];
    const statusNames = { 'brn': 'Bỏng', 'psn': 'Độc', 'tox': 'Kịch độc', 'par': 'Tê liệt', 'frz': 'Đóng băng', 'slp': 'Ngủ', 'confusion': 'Choáng' };
    const statNames = { atk: 'Công', def: 'Thủ', spa: 'Đ.Công', spd: 'Đ.Thủ', spe: 'Tốc' };

    for (const [stat, mult] of Object.entries(effects.statMods || {})) {
        const name = statNames[stat] || stat;
        if (mult > 1) parts.push(`${name}+${Math.round((mult - 1) * 100)}%`);
        else if (mult < 1) parts.push(`${name}-${Math.round((1 - mult) * 100)}%`);
    }
    if (effects.hpChange > 0) parts.push(`Hồi ${Math.round(effects.hpChange * 100)}%HP mỗi lượt`);
    if (effects.hpChange < 0) parts.push(`Mất ${Math.round(Math.abs(effects.hpChange) * 100)}%HP mỗi lượt`);
    
    if (effects.dmgMod && effects.dmgMod !== 1) {
        parts.push(`Sát thương ${effects.dmgMod > 1 ? '+' : '-'}${Math.round(Math.abs(1 - effects.dmgMod) * 100)}%`);
    }
    if (effects.critStage) parts.push(`Chí mạng ${effects.critStage > 0 ? '+' : ''}${effects.critStage} cấp`);
    if (effects.envRecoil) parts.push(`${Math.round(effects.envRecoil.chance * 100)}% phản ${Math.round(effects.envRecoil.damage * 100)}% sát thương`);
    if (effects.banItems?.length) parts.push(`Cấm đồ: ${effects.banItems.join('/')}`);
    if (effects.immuneTypes?.length) parts.push(`Miễn nhiễm hệ: ${effects.immuneTypes.join('/')}`);
    if (effects.weakTypes?.length) parts.push(`Yếu hệ: ${effects.weakTypes.join('/')}`);
    if (effects.banTypes?.length) parts.push(`Cấm chiêu hệ: ${effects.banTypes.join('/')}`);
    
    return parts.join(', ');
}

window.initCommanderSystem = initCommanderSystem;
window.shouldShowCommanderMenu = shouldShowCommanderMenu;
window.showCommanderMenu = showCommanderMenu;
window.closeCommanderMenu = closeCommanderMenu;
window.clearCommandEffects = clearCommandEffects;
window._getTargetDescription = _getTargetDescription;
window._getEffectsDescription = _getEffectsDescription;