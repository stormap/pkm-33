/**
 * ===========================================
 * PP-SYSTEM.JS - 技能 PP 管理系统 (完整版)
 * ===========================================
 * 
 * 职责:
 * - 初始化宝可梦招式的 PP 值
 * - 使用招式时扣减 PP (含 Pressure 特性)
 * - PP 耗尽时禁用招式 → 挣扎兜底
 * - PP 直接扣除手段: Spite / Grudge / Eerie Spell / G-Max Depletion
 * - PP 回复: Leppa Berry / Lunar Dance / restoreAllPP
 * - PP 依赖判定: Trump Card 威力
 * - Transform: 复制招式 PP 强制设为 5
 */

const PPSystem = {

    // =========================================================
    // 第零类：基础查询
    // =========================================================

    /**
     * 检查招式是否还有 PP
     */
    hasPP(move) {
        if (!move) return false;
        if (move.name === 'Struggle') return true;
        if (move.pp === undefined) return true;
        return move.pp > 0;
    },

    /**
     * 检查宝可梦是否所有招式 PP 都耗尽
     */
    allPPDepleted(pokemon) {
        if (!pokemon || !pokemon.moves || pokemon.moves.length === 0) return true;
        return pokemon.moves.every(m => m.pp !== undefined && m.pp <= 0);
    },

    /**
     * 在宝可梦的 moves 数组中查找对应招式对象 (by name)
     */
    findMove(pokemon, moveName) {
        if (!pokemon || !pokemon.moves || !moveName) return null;
        return pokemon.moves.find(m => m.name === moveName) || null;
    },

    // =========================================================
    // 第一类：消耗增减机制 (Consumption Modifiers)
    // 基础公式: Cost = 1 + (Pressure ? 1 : 0)
    // =========================================================

    /**
     * 核心扣除函数
     * @param {Pokemon} user - 使用招式的宝可梦
     * @param {object} move - 使用的招式对象
     * @param {Pokemon} [target] - 招式目标 (用于 Pressure 判定)
     * @returns {{ success: boolean, logs: string[] }}
     */
    deductPP(user, move, target) {
        const logs = [];
        if (!user || !move) return { success: false, logs };

        // 挣扎 / Z招式 / Max招式 不消耗 PP
        if (move.name === 'Struggle' || move.isZ || move.isMax) {
            return { success: true, logs };
        }

        // 在宝可梦的 moves 数组中找到对应招式
        const targetMove = this.findMove(user, move.name);
        if (!targetMove) return { success: true, logs }; // 非标准招式，不扣PP

        // 计算消耗量
        let cost = 1;

        // === Pressure 特性 ===
        // 当目标拥有 Pressure 时，消耗 +1
        if (target && target.isAlive && target.isAlive()) {
            const targetAbility = (target.ability || '').toLowerCase().replace(/[^a-z]/g, '');
            if (targetAbility === 'pressure') {
                cost += 1;
                console.log(`[PP] Pressure: ${target.cnName || target.name} 的压迫感使 PP 消耗 +1`);
            }
        }

        // 执行扣除
        if (targetMove.pp !== undefined) {
            targetMove.pp = Math.max(0, targetMove.pp - cost);
            console.log(`[PP] ${user.cnName || user.name} 使用 ${targetMove.cn || targetMove.name}, 消耗${cost}, PP: ${targetMove.pp}/${targetMove.maxPp}`);
        }

        // === Leppa Berry 检查 ===
        // PP 降为 0 时触发
        if (targetMove.pp === 0) {
            const berryLog = this.checkLeppaBerry(user, targetMove);
            if (berryLog) logs.push(berryLog);
        }

        return { success: true, logs };
    },

    // =========================================================
    // 第二类：直接扣除 PP 的手段 (PP Depletion)
    // =========================================================

    /**
     * 怨恨 (Spite): 减少目标最后使用的招式 4 点 PP
     * @param {Pokemon} target - 被怨恨的目标
     * @returns {string[]} 日志
     */
    applySpite(target) {
        const logs = [];
        if (!target || !target.lastMoveUsed) {
            logs.push(`<span style="color:#aaa">但是失败了！</span>`);
            return logs;
        }

        const move = this.findMove(target, target.lastMoveUsed);
        if (!move || move.pp === undefined) {
            logs.push(`<span style="color:#aaa">但是失败了！</span>`);
            return logs;
        }

        const reduction = Math.min(4, move.pp);
        move.pp = Math.max(0, move.pp - 4);
        const moveName = move.cn || move.name;
        logs.push(`<span style="color:#8b5cf6">${target.cnName} 的 ${moveName} 被削减了 ${reduction} 点 PP！(剩余 ${move.pp}/${move.maxPp})</span>`);
        console.log(`[PP] Spite: ${target.name} ${move.name} -${reduction}, now ${move.pp}/${move.maxPp}`);

        // Leppa Berry 检查
        if (move.pp === 0) {
            const berryLog = this.checkLeppaBerry(target, move);
            if (berryLog) logs.push(berryLog);
        }

        return logs;
    },

    /**
     * 怨念 (Grudge): 使用者濒死时，攻击者的该招式 PP 清零
     * 调用时机: 在 onFaint 结算中，检查被击倒者是否有 grudge volatile
     * @param {Pokemon} fainted - 被击倒的宝可梦 (拥有 Grudge 状态)
     * @param {Pokemon} attacker - 击倒者
     * @returns {string[]} 日志
     */
    applyGrudge(fainted, attacker) {
        const logs = [];
        if (!fainted || !attacker || !attacker.lastMoveUsed) return logs;

        // 检查 grudge volatile
        if (!fainted.volatile || !fainted.volatile.grudge) return logs;

        const move = this.findMove(attacker, attacker.lastMoveUsed);
        if (!move || move.pp === undefined) return logs;

        const moveName = move.cn || move.name;
        move.pp = 0;
        logs.push(`<span style="color:#7c3aed"><b>👻 ${fainted.cnName} 的怨念！</b> ${attacker.cnName} 的 ${moveName} PP 被完全耗尽！</span>`);
        console.log(`[PP] Grudge: ${attacker.name} ${move.name} PP -> 0`);

        // 清除 grudge 状态
        fainted.volatile.grudge = false;

        return logs;
    },

    /**
     * 设置 Grudge volatile (使用怨念招式时调用)
     * @param {Pokemon} user
     */
    setGrudge(user) {
        if (!user) return;
        user.volatile = user.volatile || {};
        user.volatile.grudge = true;
        console.log(`[PP] Grudge set on ${user.name}`);
    },

    /**
     * 诡异咒语 (Eerie Spell): 减少目标最后使用的招式 3 点 PP
     * @param {Pokemon} target
     * @returns {string[]} 日志
     */
    applyEerieSpell(target) {
        const logs = [];
        if (!target || !target.lastMoveUsed) return logs;

        const move = this.findMove(target, target.lastMoveUsed);
        if (!move || move.pp === undefined) return logs;

        const reduction = Math.min(3, move.pp);
        move.pp = Math.max(0, move.pp - 3);
        const moveName = move.cn || move.name;
        logs.push(`<span style="color:#8b5cf6">${target.cnName} 的 ${moveName} 被削减了 ${reduction} 点 PP！(剩余 ${move.pp}/${move.maxPp})</span>`);
        console.log(`[PP] Eerie Spell: ${target.name} ${move.name} -${reduction}, now ${move.pp}/${move.maxPp}`);

        if (move.pp === 0) {
            const berryLog = this.checkLeppaBerry(target, move);
            if (berryLog) logs.push(berryLog);
        }

        return logs;
    },

    /**
     * 超极巨损耗 (G-Max Depletion): 减少目标最后使用的招式 2 点 PP
     * @param {Pokemon} target
     * @returns {string[]} 日志
     */
    applyGMaxDepletion(target) {
        const logs = [];
        if (!target || !target.lastMoveUsed) return logs;

        const move = this.findMove(target, target.lastMoveUsed);
        if (!move || move.pp === undefined) return logs;

        const reduction = Math.min(2, move.pp);
        move.pp = Math.max(0, move.pp - 2);
        const moveName = move.cn || move.name;
        logs.push(`<span style="color:#e11d48">${target.cnName} 的 ${moveName} 被削减了 ${reduction} 点 PP！(剩余 ${move.pp}/${move.maxPp})</span>`);
        console.log(`[PP] G-Max Depletion: ${target.name} ${move.name} -${reduction}, now ${move.pp}/${move.maxPp}`);

        if (move.pp === 0) {
            const berryLog = this.checkLeppaBerry(target, move);
            if (berryLog) logs.push(berryLog);
        }

        return logs;
    },

    // =========================================================
    // 第三类：回复与重置机制 (Restoration & Reset)
    // =========================================================

    /**
     * 零余果 (Leppa Berry): PP 降为 0 时恢复 10 点
     * @param {Pokemon} pokemon
     * @param {object} move - PP 刚变为 0 的招式
     * @returns {string|null} 日志
     */
    checkLeppaBerry(pokemon, move) {
        if (!pokemon || !move) return null;

        const itemId = (pokemon.item || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (itemId !== 'leppaberry') return null;

        move.pp = Math.min(move.maxPp || 10, move.pp + 10);
        pokemon.item = null; // 消耗树果
        const moveName = move.cn || move.name;
        console.log(`[PP] Leppa Berry: ${pokemon.name} ${move.name} restored to ${move.pp}`);
        return `<span style="color:#22c55e">🍇 ${pokemon.cnName} 吃掉了零余果！${moveName} 恢复了 PP！(${move.pp}/${move.maxPp})</span>`;
    },

    /**
     * 恢复指定招式的 PP
     * @param {object} move
     * @param {number} [amount] - 恢复量（默认全部恢复）
     */
    restorePP(move, amount) {
        if (!move || move.maxPp === undefined) return;
        if (amount === undefined) {
            move.pp = move.maxPp;
        } else {
            move.pp = Math.min(move.maxPp, (move.pp || 0) + amount);
        }
    },

    /**
     * 恢复宝可梦所有招式的 PP
     * @param {Pokemon} pokemon
     */
    restoreAllPP(pokemon) {
        if (!pokemon || !pokemon.moves) return;
        pokemon.moves.forEach(m => this.restorePP(m));
        console.log(`[PP] All PP restored for ${pokemon.cnName || pokemon.name}`);
    },

    /**
     * 新月舞 (Lunar Dance) / 治愈愿望: 下只上场的宝可梦 HP/PP/状态 全回复
     * 设置标记，在换人时触发
     * @param {object} battle
     * @param {boolean} isPlayer
     */
    setLunarDanceHeal(battle, isPlayer) {
        if (!battle) return;
        if (isPlayer) {
            battle.pendingLunarDance = true;
        } else {
            battle.pendingEnemyLunarDance = true;
        }
        console.log(`[PP] Lunar Dance heal pending (${isPlayer ? 'player' : 'enemy'})`);
    },

    /**
     * 在换人时检查并应用 Lunar Dance 回复
     * @param {Pokemon} pokemon - 刚换入的宝可梦
     * @param {object} battle
     * @param {boolean} isPlayer
     * @returns {string[]} 日志
     */
    applyLunarDanceOnSwitch(pokemon, battle, isPlayer) {
        const logs = [];
        if (!pokemon || !battle) return logs;

        const flag = isPlayer ? 'pendingLunarDance' : 'pendingEnemyLunarDance';
        if (!battle[flag]) return logs;

        // 全回复
        pokemon.currHp = pokemon.maxHp;
        pokemon.status = null;
        this.restoreAllPP(pokemon);
        battle[flag] = false;

        logs.push(`<span style="color:#fbbf24"><b>🌙 新月之光包围了 ${pokemon.cnName}！HP、PP、状态全部回复！</b></span>`);
        console.log(`[PP] Lunar Dance heal applied to ${pokemon.name}`);
        return logs;
    },

    // =========================================================
    // 第三类补充：Transform PP=5
    // =========================================================

    /**
     * 变身 (Transform): 复制目标招式列表，所有招式 PP 强制设为 5
     * @param {Pokemon} user - 变身者
     * @param {Pokemon} target - 被复制的目标
     * @returns {string[]} 日志
     */
    applyTransformPP(user, target) {
        const logs = [];
        if (!user || !target || !target.moves) return logs;

        // 复制招式列表，PP 全部设为 5
        user.moves = target.moves.map(m => ({
            ...m,
            pp: 5,
            maxPp: 5
        }));

        console.log(`[PP] Transform: ${user.name} copied moves from ${target.name}, all PP set to 5`);
        return logs;
    },

    // =========================================================
    // 第四类：基于 PP 的数值判定 (PP Dependent Mechanics)
    // =========================================================

    /**
     * 王牌 (Trump Card): 根据剩余 PP 计算威力
     * 判定时机: PP 已被扣除后的剩余量
     * @param {Pokemon} user
     * @returns {number} 威力
     */
    getTrumpCardPower(user) {
        const move = this.findMove(user, 'Trump Card');
        if (!move) return 40;

        const pp = move.pp !== undefined ? move.pp : 5;
        // PP 已扣除后的剩余量
        if (pp === 0) return 200;
        if (pp === 1) return 80;
        if (pp === 2) return 60;
        if (pp === 3) return 50;
        return 40; // pp >= 4
    },

    // =========================================================
    // 第五类：系统级兜底逻辑 (Struggle)
    // =========================================================

    /**
     * 创建挣扎招式对象
     * @returns {object}
     */
    createStruggle() {
        return {
            name: 'Struggle',
            cn: '挣扎',
            power: 50,
            basePower: 50,
            type: 'Normal',
            cat: 'phys',
            category: 'Physical',
            accuracy: true,
            flags: { contact: 1 },
            isStruggle: true
        };
    },

    /**
     * 获取可用招式列表 (过滤 PP=0 的招式)
     * @param {Pokemon} pokemon
     * @returns {object[]} 可用招式数组
     */
    getUsableMoves(pokemon) {
        if (!pokemon || !pokemon.moves) return [];
        return pokemon.moves.filter(m => m.pp === undefined || m.pp > 0);
    }
};

// 挂载到全局
window.PPSystem = PPSystem;

export default PPSystem;
