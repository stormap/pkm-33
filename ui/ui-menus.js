/**
 * ===========================================
 * UI-MENUS.JS - HỆ THỐNG MENU
 * ===========================================
 * * Trách nhiệm:
 * - Chuyển đổi Menu chính / Menu chiêu thức
 * - Điều khiển nút Mega/Dynamax/Tera
 * - Phát hoạt ảnh tiến hóa
 */

// ============================================
// CHUYỂN ĐỔI MENU
// ============================================

/**
 * Hiển thị menu chiêu thức
 */
function showMovesMenu() {
    console.log('[UI-MENUS] showMovesMenu called');
    
    const battle = typeof window !== 'undefined' ? window.battle : null;
    
    // =========================================================
    // 【Khóa chiêu Tụ lực】Kiểm tra người chơi có đang tụ lực không
    // =========================================================
    if (battle) {
        const player = battle.getPlayer();
        if (player && player.volatile?.chargingMove) {
            const chargingMove = player.volatile.chargingMove;
            
            // 【Quan trọng】Kiểm tra xem có thể hành động không (Flinch/Sleep/Paralysis/Freeze... sẽ ngăn hành động)
            // Nếu không thể hành động, checkCanMove sẽ xóa trạng thái chargingMove
            if (typeof window.checkCanMove === 'function') {
                const canMoveCheck = window.checkCanMove(player);
                if (!canMoveCheck.can) {
                    // Không thể hành động, chargingMove đã bị checkCanMove xóa
                    // Hiển thị lý do không thể hành động, sau đó hiển thị menu kỹ năng bình thường
                    console.log(`[CHARGE MOVE] Player cannot move: ${canMoveCheck.msg}`);
                    // Không hiển thị tin nhắn ở đây, để executePlayerTurn xử lý
                    // Tiếp tục hiển thị menu chiêu thức bình thường
                }
            }
            
            // Kiểm tra lại xem chargingMove còn tồn tại không (có thể đã bị checkCanMove xóa)
            if (player.volatile?.chargingMove) {
                console.log(`[CHARGE MOVE] Player is charging ${chargingMove}, forcing move execution`);
                
                // Tìm index chiêu thức tương ứng
                const moveIndex = player.moves?.findIndex(m => m.name === chargingMove);
                if (moveIndex >= 0 && typeof window.handleAttack === 'function') {
                    const moveToUse = player.moves[moveIndex];
                    // Hiển thị gợi ý
                    if (typeof window.log === 'function') {
                        // Ưu tiên hiển thị tên tiếng Anh (.name)
                        window.log(`<span style="color:#f59e0b">⚡ ${player.name} tiếp tục thực hiện ${moveToUse.name}!</span>`);
                    }
                    // Bắt buộc thực hiện chiêu tụ lực (truyền index thay vì object)
                    setTimeout(() => {
                        window.handleAttack(moveIndex);
                    }, 100);
                    return; // Không hiển thị menu chiêu thức
                }
            }
        }
    }
    
    // =========================================================
    // 【Hệ thống Insight】Dự đoán "Ý định ban đầu" của AI
    // Quyết định cuối cùng của AI có thể khác (tùy biến theo tình huống), 
    // nhưng Insight hiển thị ý định ban đầu.
    // =========================================================
    if (battle && window.GAME_SETTINGS?.enableClash !== false) {
        const p = battle.getPlayer();
        const e = battle.getEnemy();
        
        if (p && e && p.isAlive() && e.isAlive()) {
            // Tính toán tốc độ để xem ai đi sau
            let playerSpeed = (typeof p.getStat === 'function') ? p.getStat('spe') : (p.spe || 100);
            let enemySpeed = (typeof e.getStat === 'function') ? e.getStat('spe') : (e.spe || 100);
            if (p.status === 'par') playerSpeed = Math.floor(playerSpeed * 0.5);
            if (e.status === 'par') enemySpeed = Math.floor(enemySpeed * 0.5);
            const isTrickRoom = battle.field && battle.field.trickRoom > 0;
            const playerIsSlower = isTrickRoom ? (playerSpeed > enemySpeed) : (playerSpeed < enemySpeed);
            
            // Chỉ kích hoạt Insight khi người chơi đi sau
            if (playerIsSlower && typeof window.preCalculateIntent === 'function') {
                // Sử dụng getHardAiMove để lấy "ý định ban đầu" của AI (chiêu tối ưu)
                let predictedMove = null;
                if (typeof window.getHardAiMove === 'function') {
                    predictedMove = window.getHardAiMove(e, p, battle.enemyParty);
                }
                if (!predictedMove && e.moves && e.moves.length > 0) {
                    predictedMove = e.moves[0];
                }
                
                if (predictedMove) {
                    const insightResult = window.preCalculateIntent(e, p, predictedMove);
                    if (insightResult && insightResult.success) {
                        console.log(`[INSIGHT] Cảnh báo kích hoạt: Level ${insightResult.level}, Chiêu dự đoán: ${predictedMove.name}`);
                        // Đánh dấu Insight đã kích hoạt trong lượt này, để hệ thống Clash (Đối xung) sử dụng
                        battle.insightTriggeredThisTurn = true;
                        battle.insightPredictedMove = predictedMove;
                        // Hiển thị cảnh báo
                        if (typeof window.showInsightWarning === 'function') {
                            window.showInsightWarning(insightResult);
                        }
                    } else {
                        battle.insightTriggeredThisTurn = false;
                        battle.insightPredictedMove = null;
                    }
                }
            } else {
                // Người chơi đi trước, không kích hoạt Insight
                battle.insightTriggeredThisTurn = false;
                battle.insightPredictedMove = null;
            }
        }
    }
    
    // 【Hệ thống Chỉ huy Chiến thuật】Cửa sổ tự động đã bị loại bỏ, chuyển sang kích hoạt thủ công qua Smart Bubble
    // 【Sửa lỗi】Chỉ làm mới bong bóng khi không có trạng thái khóa
    // Trạng thái khóa bao gồm: commandArmed, evoArmed, playerMegaArmed, currentMoveStyle
    const hasLockedState = battle?.commandArmed || battle?.evoArmed || battle?.playerMegaArmed || 
                           (window.currentMoveStyle && window.currentMoveStyle !== 'normal');
    if (!hasLockedState && typeof window.refreshCommanderBubble === 'function') {
        window.refreshCommanderBubble();
    }
    
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('moves-menu').classList.remove('hidden');
    
    // 【Hệ thống Cổ Võ】Nút Thái Cực đã bị loại bỏ, chức năng chuyển sang Commander System V2
    // Không reset Style nữa, giữ nguyên Style người chơi chọn cho đến khi sử dụng
    
    // Cập nhật trạng thái hiển thị nút Mega
    console.log('[UI-MENUS] Calling updateMegaButtonVisibility');
    updateMegaButtonVisibility();
}

/**
 * Hiển thị menu chính
 */
function showMainMenu() {
    if (typeof window.playSFX === 'function') window.playSFX('CANCEL');
    document.getElementById('moves-menu').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
    
    const battle = typeof window !== 'undefined' ? window.battle : null;
    // Khi quay lại menu chính, reset trạng thái chuẩn bị Mega
    if (battle && battle.playerMegaArmed) {
        battle.playerMegaArmed = false;
        const megaBtn = document.getElementById('btn-mega');
        if (megaBtn) megaBtn.classList.remove('armed');
    }
}

// ============================================
// ĐIỀU KHIỂN NÚT MEGA/DYNAMAX/TERA
// ============================================

/**
 * Cập nhật trạng thái hiển thị của nút Mega/Dynamax/Tera
 * 【Đã di chuyển】Chức năng nút tròn nhỏ đã chuyển sang cửa sổ nổi Commander System V2
 * Hàm này hiện tại chỉ chịu trách nhiệm ẩn nút tròn và làm mới cửa sổ nổi
 */
function updateMegaButtonVisibility() {
    // 【Di chuyển】Nút tròn luôn ẩn, chức năng do cửa sổ nổi đảm nhận
    const megaBtn = document.getElementById('btn-mega');
    const evoBtn = document.getElementById('btn-evolved');
    if (megaBtn) {
        megaBtn.classList.add('hidden');
        megaBtn.classList.remove('armed');
    }
    if (evoBtn) evoBtn.classList.add('hidden');
    
    // 【Sửa lỗi】Chỉ làm mới cửa sổ nổi khi không có trạng thái khóa
    const battle = typeof window !== 'undefined' ? window.battle : null;
    const hasLockedState = battle?.commandArmed || battle?.evoArmed || battle?.playerMegaArmed || 
                           (window.currentMoveStyle && window.currentMoveStyle !== 'normal');
    if (!hasLockedState && typeof window.refreshCommanderBubble === 'function') {
        window.refreshCommanderBubble();
    }
    
    // 【Quan trọng】Return ngay lập tức, không thực hiện logic hiển thị phía sau nữa
    return;
    
    /* --- CODE CŨ BÊN DƯỚI ĐÃ BỊ VÔ HIỆU HÓA --- */
    /*
    console.log(`[MEGA UI] Player: ${p.name}, canMegaEvolve: ${p.canMegaEvolve}, canDynamax: ${p.canDynamax}, canTera: ${p.canTera}, mechanic: ${lockedMechanic}`);
    
    const canMegaEvolveFunc = window.canMegaEvolve;
    const canActivateMechanicFunc = window.canActivateMechanic || (() => true);
    
    // Kiểm tra hệ thống mở khóa
    const unlocks = battle.playerUnlocks || {};
    
    // =========================================================
    // Kiểm tra khóa cơ chế: Cơ chế khóa 2 lớp
    // Lớp 1 (unlocks): Người chơi có mở khóa cơ chế đó không
    // Lớp 2 (mechanic): Pokémon có được chỉ định sử dụng cơ chế đó không
    // =========================================================
    
    // Kiểm tra Mega
    // 【Sửa lỗi】Phải check enable_mega === true mới được dùng Mega
    // 【Khóa lớp 2】Pokémon phải có mechanic === 'mega' mới được Mega
    const canMega = unlocks.enable_mega === true
        && typeof canMegaEvolveFunc === 'function' 
        && canMegaEvolveFunc(p) 
        && !battle.playerMegaUsed
        && canActivateMechanicFunc(p, 'mega')
        && lockedMechanic === 'mega';  // 【Sửa lỗi quan trọng】Phải chỉ định rõ mechanic
    
    // Kiểm tra Dynamax
    // 【Sửa lỗi】Phải check enable_dynamax === true mới được dùng Dynamax
    // 【Khóa lớp 2】Pokémon phải có mechanic === 'dynamax' mới được Dynamax
    const canDynamax = unlocks.enable_dynamax === true
        && p.canDynamax 
        && !p.isDynamaxed 
        && !battle.playerMaxUsed
        && canActivateMechanicFunc(p, 'dynamax')
        && lockedMechanic === 'dynamax';  // 【Sửa lỗi quan trọng】Phải chỉ định rõ mechanic
    
    // Kiểm tra Terastallize
    // 【Sửa lỗi】Phải check enable_tera === true mới được dùng Tera
    // 【Khóa lớp 2】Pokémon phải có mechanic === 'tera' mới được Tera
    const canTerastallize = unlocks.enable_tera === true
        && p.canTera 
        && !p.isTerastallized 
        && !battle.playerTeraUsed
        && canActivateMechanicFunc(p, 'tera')
        && lockedMechanic === 'tera';
    
    const isDynamaxTarget = p.megaTargetId && p.megaTargetId.toLowerCase().includes('gmax');
    
    console.log(`[MEGA UI] canMega: ${canMega}, canDynamax: ${canDynamax}, canTera: ${canTerastallize}, lockedMechanic: ${lockedMechanic}, isDynamaxTarget: ${isDynamaxTarget}`);
    
    // Chế độ Terastallize
    if (lockedMechanic === 'tera') {
        if (canTerastallize) {
            megaBtn.classList.remove('hidden');
            megaBtn.classList.add('tera-style');
            if (iconText) iconText.textContent = 'T';
            p.evolutionType = 'tera';
        } else {
            megaBtn.classList.add('hidden');
            battle.playerMegaArmed = false;
        }
        return;
    }
    
    // Chế độ Z-Move không hiển thị nút
    if (lockedMechanic === 'zmove') {
        megaBtn.classList.add('hidden');
        battle.playerMegaArmed = false;
        return;
    }
    
    // Chế độ Dynamax (Kiểm tra ưu tiên)
    if (lockedMechanic === 'dynamax') {
        if (canDynamax) {
            megaBtn.classList.remove('hidden');
            megaBtn.classList.add('dynamax-style');
            if (iconText) iconText.textContent = 'X';
            p.evolutionType = 'dynamax';
            console.log('[MEGA UI] Showing Dynamax button (mechanic locked)');
        } else {
            megaBtn.classList.add('hidden');
            console.log('[MEGA UI] Hidden: mechanic locked to dynamax but canDynamax is false');
        }
        return;
    }
    
    // Chế độ Mega
    if (lockedMechanic === 'mega') {
        if (canMega) {
            megaBtn.classList.remove('hidden');
            megaBtn.classList.remove('dynamax-style');
            p.evolutionType = 'mega';
            console.log('[MEGA UI] Showing Mega button (mechanic locked)');
        } else {
            megaBtn.classList.add('hidden');
            console.log('[MEGA UI] Hidden: mechanic locked to mega but canMega is false');
        }
        return;
    }
    
    // Khi không khóa cơ chế: Ẩn nút
    // 【Quan trọng】4 cơ chế lớn (Mega/Dynamax/Tera/Z-Move) đều yêu cầu trường mechanic rõ ràng
    megaBtn.classList.add('hidden');
    console.log('[MEGA UI] Hidden: no mechanic specified (all mechanics require explicit mechanic field)');
    battle.playerMegaArmed = false;
    megaBtn.classList.remove('armed');
    */
}

// ============================================
// HOẠT ẢNH TIẾN HÓA
// ============================================

/**
 * Thực hiện hiệu ứng hình ảnh Mega Evolution
 */
async function playMegaEvolutionAnimation(pokemon, isPlayer = true) {
    const spriteId = isPlayer ? 'player-sprite' : 'enemy-sprite';
    const sprite = document.getElementById(spriteId);
    if (!sprite) return;

    const isBack = isPlayer;
    const newSpriteUrl = pokemon.getSprite(isBack);

    sprite.classList.remove('evo-silhouette', 'evo-burst', 'evo-finish');
    
    // Giai đoạn 1: Bóng đen DNA (Silhouette)
    sprite.classList.add('evo-silhouette');
    await wait(1000);
    
    // Giai đoạn 2: Bùng nổ ánh sáng trắng + Đổi ảnh
    sprite.classList.remove('evo-silhouette');
    sprite.classList.add('evo-burst');
    
    const spriteRequestedUrls = window.spriteRequestedUrls || {};
    delete spriteRequestedUrls[spriteId];
    if (typeof smartLoadSprite === 'function') {
        smartLoadSprite(spriteId, newSpriteUrl, false);
    }
    spriteRequestedUrls[spriteId] = newSpriteUrl;
    
    await wait(300);
    
    // Giai đoạn 3: Hoạt ảnh hạ nhiệt
    sprite.classList.remove('evo-burst');
    sprite.classList.add('evo-finish');
    
    await wait(800);
    
    // 【Sửa lỗi】Giữ lại class player-scale để tránh thay đổi kích thước sprite
    sprite.classList.remove('evo-silhouette', 'evo-burst', 'evo-finish');
    if (!sprite.classList.contains('loaded')) {
        sprite.classList.add('loaded');
    }
    sprite.classList.add(isPlayer ? 'mega-player' : 'mega-enemy');
}

/**
 * Thực hiện hiệu ứng hình ảnh Dynamax
 */
async function playDynamaxAnimation(pokemon, isPlayer = true) {
    const spriteId = isPlayer ? 'player-sprite' : 'enemy-sprite';
    const sprite = document.getElementById(spriteId);
    if (!sprite) return;

    sprite.classList.remove('evo-silhouette', 'evo-burst', 'evo-finish', 'state-dynamax', 'dynamax-burst', 'dynamax-shrink');
    
    // Giai đoạn 1: Bùng nổ năng lượng đỏ
    sprite.classList.add('dynamax-burst');
    await wait(800);
    
    // Giai đoạn 2: Vào trạng thái Dynamax
    sprite.classList.remove('dynamax-burst');
    sprite.classList.add('state-dynamax');
    
    await wait(200);
}

/**
 * Kết thúc hiệu ứng hình ảnh Dynamax
 */
async function endDynamaxAnimation(pokemon, isPlayer = true) {
    const spriteId = isPlayer ? 'player-sprite' : 'enemy-sprite';
    const sprite = document.getElementById(spriteId);
    if (!sprite) return;

    sprite.classList.remove('state-dynamax');
    sprite.classList.add('dynamax-shrink');
    
    await wait(600);
    
    sprite.classList.remove('dynamax-shrink', 'dynamax-burst');
}

/**
 * Hàm hỗ trợ: Chờ đợi
 */
function wait(ms) { 
    return new Promise(r => setTimeout(r, ms)); 
}

/**
 * Hàm hỗ trợ: Xuất log
 */
function log(msg) {
    if (typeof window !== 'undefined' && typeof window.log === 'function') {
        window.log(msg);
    } else {
        console.log(msg);
    }
}

// ============================================
// CHUYỂN ĐỔI MEGA/DYNAMAX/TERA
// ============================================

/**
 * Chuyển đổi trạng thái chờ tiến hóa Mega/Dynamax/Tera
 */
function toggleMega() {
    const megaBtn = document.getElementById('btn-mega');
    if (!megaBtn) return;
    
    const battle = typeof window !== 'undefined' ? window.battle : null;
    if (!battle) return;
    
    const p = battle.getPlayer();
    const canMegaEvolveFunc = window.canMegaEvolve;
    
    // =========================================================
    // Chế độ Terastallize (Kiểm tra ưu tiên)
    // 【Sửa lỗi】Phải kiểm tra: 1) unlocks.enable_tera === true  2) mechanic === 'tera'
    // =========================================================
    const teraUnlocks = battle.playerUnlocks || {};
    if (p && teraUnlocks.enable_tera === true && p.mechanic === 'tera' && p.canTera) {
        if (battle.playerTeraUsed || p.isTerastallized) {
            return;
        }
        
        battle.playerMegaArmed = !battle.playerMegaArmed;
        
        if (battle.playerMegaArmed) {
            megaBtn.classList.add('armed');
            log(`<span style="color:#22d3ee">💎 Terastallize sẵn sàng! Sẽ kích hoạt sau khi chọn chiêu! (${p.teraType})</span>`);
        } else {
            megaBtn.classList.remove('armed');
            log(`<span style="color:#94a3b8">Hủy trạng thái chờ Terastallize.</span>`);
        }
        return;
    }
    
    // Kiểm tra xem có phải chế độ Dynamax không
    // 【Sửa lỗi】Phải kiểm tra: 1) unlocks.enable_dynamax === true  2) mechanic === 'dynamax'
    const unlocks = battle.playerUnlocks || {};
    const isDynamaxMode = p 
        && unlocks.enable_dynamax === true 
        && p.mechanic === 'dynamax'  // 【Khóa lớp 2】Phải chỉ định rõ mechanic
        && (p.canDynamax || (p.megaTargetId && p.megaTargetId.toLowerCase().includes('gmax')));
    
    if (isDynamaxMode) {
        // === Chế độ Dynamax ===
        if (battle.playerMaxUsed || p.isDynamaxed) {
            return;
        }
        
        battle.playerMegaArmed = !battle.playerMegaArmed;
        
        if (battle.playerMegaArmed) {
            megaBtn.classList.add('armed');
            log(`<span style="color:#e11d48">✦ Dynamax sẵn sàng! Sẽ kích hoạt sau khi chọn chiêu!</span>`);
        } else {
            megaBtn.classList.remove('armed');
            log(`<span style="color:#94a3b8">Hủy trạng thái chờ Dynamax.</span>`);
        }
        return;
    }
    
    // === Chế độ Mega thường ===
    // 【Sửa lỗi】Phải kiểm tra unlocks.enable_mega === true
    const megaUnlocks = battle.playerUnlocks || {};
    if (!p || megaUnlocks.enable_mega !== true || !canMegaEvolveFunc || !canMegaEvolveFunc(p) || battle.playerMegaUsed) {
        return;
    }
    
    // Kiểm tra xem có phải Pokémon song hệ Mega không (Charizard/Mewtwo)
    if (p.hasDualMega && p.megaFormsAvailable && p.megaFormsAvailable.length >= 2) {
        // Nếu đã chuẩn bị, thì hủy
        if (battle.playerMegaArmed) {
            battle.playerMegaArmed = false;
            megaBtn.classList.remove('armed');
            log(`<span style="color:#94a3b8">Hủy trạng thái chờ Mega Evolution.</span>`);
            return;
        }
        
        // Hiển thị hộp thoại chọn
        if (typeof showMegaFormSelectionDialog === 'function') {
            showMegaFormSelectionDialog(p, (selectedFormId) => {
                if (selectedFormId) {
                    p.megaTargetId = selectedFormId;
                    p.formTargetId = selectedFormId;
                    
                    battle.playerMegaArmed = true;
                    megaBtn.classList.add('armed');
                    
                    const formName = selectedFormId.includes('megax') ? 'Mega X' : 'Mega Y';
                    log(`<span style="color:#a855f7">✦ ${formName} Evolution sẵn sàng! Sẽ kích hoạt sau khi chọn chiêu!</span>`);
                }
            });
        }
    } else {
        // Mega thường (Đơn dạng)
        battle.playerMegaArmed = !battle.playerMegaArmed;
        
        if (battle.playerMegaArmed) {
            megaBtn.classList.add('armed');
            log(`<span style="color:#a855f7">✦ Mega Evolution sẵn sàng! Sẽ kích hoạt sau khi chọn chiêu!</span>`);
        } else {
            megaBtn.classList.remove('armed');
            log(`<span style="color:#94a3b8">Hủy trạng thái chờ Mega Evolution.</span>`);
        }
    }
}

// ============================================
// XUẤT MODULE
// ============================================

// Môi trường trình duyệt
if (typeof window !== 'undefined') {
    window.showMovesMenu = showMovesMenu;
    window.showMainMenu = showMainMenu;
    window.updateMegaButtonVisibility = updateMegaButtonVisibility;
    window.toggleMega = toggleMega;
    window.playMegaEvolutionAnimation = playMegaEvolutionAnimation;
    window.playDynamaxAnimation = playDynamaxAnimation;
    window.endDynamaxAnimation = endDynamaxAnimation;
}

// Môi trường Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showMovesMenu,
        showMainMenu,
        toggleMega,
        updateMegaButtonVisibility,
        playMegaEvolutionAnimation,
        playDynamaxAnimation,
        endDynamaxAnimation
    };
}