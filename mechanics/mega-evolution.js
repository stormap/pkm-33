/**
 * =============================================
 * MEGA EVOLUTION SYSTEM
 * =============================================
 * 
 * 从 battle-engine.js 迁移的 Mega 进化核心逻辑
 * 
 * 职责:
 * - 形态变化资格检测 (Mega/Ultra/Primal/Dynamax/Crowned)
 * - Mega 进化执行
 * - 非官方 Mega 检测
 * 
 * 依赖: pokedex-data.js, battle-engine.js (Pokemon, calcStats, getPokemonData)
 */

/* ==========================================================
 *  智能形态探测器 v3 : Zero-Config, Database-Driven
 *  基于 mechanic 字段和数据库自动检测可用形态
 * ========================================================== */ 

/**
 * 自动检测宝可梦的形态变化资格（Mega/Ultra/Primal/Dynamax 等）
 * 
 * @param {Pokemon} pokemon - 宝可梦实例
 * @param {string|null} explicitFormFlag - JSON 中显式指定的形态 ('x', 'y', 'primal', 'ultra', 'crowned', 'machampgmax' 等)
 */
function autoDetectFormChangeEligibility(pokemon, explicitFormFlag = null) {
    // 使用规范化名称查找 POKEDEX
    const normalizedName = typeof normalizePokemonName === 'function' 
        ? normalizePokemonName(pokemon.name) 
        : pokemon.name;
    const baseId = normalizedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const data = typeof POKEDEX !== 'undefined' ? POKEDEX[baseId] : null;
    
    // 获取玩家在 JSON 配置里指定的"意愿" (Mechanic Lock)
    const desiredMechanic = pokemon.mechanic || 'any'; // 'mega', 'dynamax', 'zmove', 'any'(Auto)
    
    console.log(`[FORM] Auto-Scan for ${pokemon.name} (baseId: ${baseId}), mechanic: ${desiredMechanic}, hasData: ${!!data}`);
    
    // ========================================
    // 步骤 1：扫描数据库的所有形态树
    // ========================================
    let avail = {
        mega: [],
        gmax: [],
        primal: null,
        ultra: null,
        crowned: null
    };
    
    // 从 otherFormes 收集
    if (data && data.otherFormes) {
        for (const formeName of data.otherFormes) {
            const formeId = formeName.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            if (formeId.includes('gmax') || formeId.includes('gigantamax')) {
                avail.gmax.push(formeId);
            } else if (formeName.includes('Mega') && formeId.match(/mega[xy]?$/)) {
                avail.mega.push(formeId);
            } else if (formeName.includes('Primal')) {
                avail.primal = formeId;
            } else if (formeName.includes('Ultra')) {
                avail.ultra = formeId;
            } else if (formeName.includes('Crowned')) {
                avail.crowned = formeId;
            }
        }
    }
    
    // 激进探测：尝试拼接 ID（数据库可能没有 otherFormes 但有实际数据）
    const guessedGmaxId = baseId + 'gmax';
    const guessedMegaId = baseId + 'mega';
    if (avail.gmax.length === 0 && typeof POKEDEX !== 'undefined' && POKEDEX[guessedGmaxId]) {
        avail.gmax.push(guessedGmaxId);
    }
    if (avail.mega.length === 0 && typeof POKEDEX !== 'undefined' && POKEDEX[guessedMegaId]) {
        avail.mega.push(guessedMegaId);
    }
    
    // 双 Mega 白名单
    const KNOWN_DUAL_MEGAS = ['charizard', 'mewtwo'];
    const hasDualMega = (avail.mega.length >= 2) && KNOWN_DUAL_MEGAS.includes(baseId);
    
    console.log(`[FORM] Available forms:`, avail);
    
    // ========================================
    // 步骤 2：原始回归 / Crowned - 立即固化
    // ========================================
    if (avail.primal && typeof POKEDEX !== 'undefined' && POKEDEX[avail.primal]) {
        pokemon.isPrimal = true;
        pokemon.primalTargetId = avail.primal;
        pokemon.needsInitTransform = true;
        pokemon.initTransformTarget = avail.primal;
        pokemon.initTransformType = 'primal';
    }
    
    if (avail.crowned && typeof POKEDEX !== 'undefined' && POKEDEX[avail.crowned]) {
        pokemon.isCrowned = true;
        pokemon.crownedTargetId = avail.crowned;
        pokemon.needsInitTransform = true;
        pokemon.initTransformTarget = avail.crowned;
        pokemon.initTransformType = 'crowned';
    }
    
    // ===================================
    //  决策区: 根据 mechanic 决定 Target
    // ===================================
    
    // 👉 场景 A: 明确想要极巨化 (mechanic='dynamax')
    if (desiredMechanic === 'dynamax') {
        // 【修复】优先使用用户在 JSON 中显式指定的 mega/mega_target 字段
        if (pokemon.megaTargetId && pokemon.megaTargetId.includes('gmax')) {
            // 用户已经指定了 G-Max 形态，直接使用
            pokemon.canMegaEvolve = true;
            pokemon.canDynamax = true;
            pokemon.evolutionType = 'dynamax';
            console.log(`[FORM] Using explicit G-Max target: ${pokemon.megaTargetId}`);
        } else if (avail.gmax.length > 0) {
            // 找到正版 Gmax 数据
            pokemon.megaTargetId = avail.gmax[0];
            pokemon.canMegaEvolve = true;
            pokemon.canDynamax = true;
            pokemon.evolutionType = 'dynamax';
            console.log(`[FORM] Locked Dynamax target: ${pokemon.megaTargetId}`);
        } else {
            // 没有 GMax 数据，走通用极巨化 (Non-GMax Dynamax)
            pokemon.megaTargetId = guessedGmaxId; // 虚拟 ID，供图片加载尝试
            pokemon.canMegaEvolve = true;
            pokemon.canDynamax = true;
            pokemon.evolutionType = 'dynamax';
            pokemon.isGenericDynamax = true; // 标记为通用极巨化
            console.log(`[FORM] Generic Dynamax (No G-Form in DB) target: ${pokemon.megaTargetId}`);
        }
        return;
    }
    
    // 👉 场景 B: 明确想要 Mega (mechanic='mega')
    if (desiredMechanic === 'mega') {
        if (avail.mega.length > 0) {
            const validMegaForms = avail.mega.filter(f => typeof POKEDEX !== 'undefined' && POKEDEX[f]);
            if (validMegaForms.length > 0) {
                if (hasDualMega && validMegaForms.length >= 2) {
                    pokemon.hasDualMega = true;
                    pokemon.megaFormsAvailable = validMegaForms;
                    // 【修复】优先使用 JSON 中指定的 mega_target，否则默认 X 形态
                    const specifiedTarget = pokemon.mega_target || pokemon.megaTarget;
                    if (specifiedTarget && validMegaForms.includes(specifiedTarget)) {
                        pokemon.megaTargetId = specifiedTarget;
                    } else {
                        pokemon.megaTargetId = validMegaForms.find(f => f.endsWith('x')) || validMegaForms[0];
                    }
                } else {
                    pokemon.megaTargetId = validMegaForms[0];
                }
                pokemon.canMegaEvolve = true;
                pokemon.evolutionType = 'mega';
                console.log(`[FORM] Locked Mega target: ${pokemon.megaTargetId}`);
                return;
            }
        }
        // 没有 Mega 数据，禁用
        pokemon.canMegaEvolve = false;
        console.log(`[FORM] ${pokemon.name} has no Mega form - Mega DISABLED`);
        return;
    }
    
    // 👉 场景 C: Z 招式模式 (mechanic='zmove')
    if (desiredMechanic === 'zmove') {
        // Z 招式不需要形态变化，但禁止 Mega/Dynamax
        pokemon.canMegaEvolve = false;
        pokemon.canDynamax = false;
        console.log(`[FORM] ${pokemon.name} locked to Z-Move - form changes DISABLED`);
        return;
    }
    
    if (desiredMechanic === 'tera') {
        // 太晶化不需要形态变化，禁止自动检测 Mega/Dynamax
        pokemon.canMegaEvolve = false;
        pokemon.canDynamax = false;
        console.log(`[FORM] ${pokemon.name} locked to Tera - form changes DISABLED`);
        return;
    }
    
    // 👉 场景 D: 自动挡 (mechanic 不填或 'any')
    // 优先 Mega（因为 Mega 改变种族特性更明显），没 Mega 看能不能 GMax
    if (avail.ultra && typeof POKEDEX !== 'undefined' && POKEDEX[avail.ultra]) {
        pokemon.megaTargetId = avail.ultra;
        pokemon.canMegaEvolve = true;
        pokemon.evolutionType = 'ultra';
        console.log(`[FORM] Auto-detected Ultra: ${pokemon.megaTargetId}`);
    } else if (avail.mega.length > 0) {
        // 【修复】只有携带对应 Mega 石的宝可梦才能自动检测 Mega
        const pokemonItem = (pokemon.item || '').toLowerCase().replace(/[^a-z]/g, '');
        const validMegaForms = avail.mega.filter(f => {
            if (typeof POKEDEX === 'undefined' || !POKEDEX[f]) return false;
            const megaData = POKEDEX[f];
            // 检查是否携带对应的 Mega 石
            const requiredItem = (megaData.requiredItem || '').toLowerCase().replace(/[^a-z]/g, '');
            return requiredItem && pokemonItem === requiredItem;
        });
        
        if (validMegaForms.length > 0) {
            // 【双 Mega 特殊处理】喷火龙/超梦携带任意一个 Mega 石时，都可以选择 X 或 Y
            if (hasDualMega) {
                // 获取所有可用的 Mega 形态（不管携带哪个石头）
                const allMegaForms = avail.mega.filter(f => typeof POKEDEX !== 'undefined' && POKEDEX[f]);
                if (allMegaForms.length >= 2) {
                    pokemon.hasDualMega = true;
                    pokemon.megaFormsAvailable = allMegaForms;
                    console.log(`[FORM] Dual Mega enabled: ${allMegaForms.join(', ')}`);
                }
            }
            pokemon.megaTargetId = validMegaForms.find(f => f.endsWith('x')) || validMegaForms[0];
            pokemon.canMegaEvolve = true;
            pokemon.evolutionType = 'mega';
            console.log(`[FORM] Auto-detected Mega (with item): ${pokemon.megaTargetId}`);
        } else {
            // 没有携带 Mega 石，禁用自动 Mega
            pokemon.canMegaEvolve = false;
            console.log(`[FORM] ${pokemon.name} has Mega form but no Mega Stone - Mega DISABLED`);
        }
    } else if (avail.gmax.length > 0) {
        // 只有专属 GMax 的才自动激活，通用极巨化需要手动指定 mechanic
        pokemon.megaTargetId = avail.gmax[0];
        pokemon.canMegaEvolve = true;
        pokemon.canDynamax = true;
        pokemon.evolutionType = 'dynamax';
        console.log(`[FORM] Auto-detected GMax: ${pokemon.megaTargetId}`);
    } else {
        pokemon.canMegaEvolve = false;
        pokemon.canFormChange = false;
        console.log(`[FORM] ${pokemon.name} has NO form changes available`);
    }
}

// 向后兼容别名
const autoDetectMegaEligibility = autoDetectFormChangeEligibility;

/**
 * 检查是否为非官方 Mega（动态检测）
 * 不再使用硬编码列表！
 * 实际检测在 smartLoadSprite 中进行：当所有精灵图回退都失败时，自动判断为非官方 Mega
 */
function isUnofficialMega(megaTargetId) {
    // 不再预判，让 smartLoadSprite 的回退机制来动态检测
    return false;
}

/**
 * 执行 Mega 进化 (引擎层面)
 * @param {Pokemon} pokemon - 要进化的宝可梦
 * @returns {object|null} - 进化结果信息，或 null 如果失败
 */
function performMegaEvolution(pokemon) {
    if (!pokemon.canMegaEvolve || pokemon.isMega || !pokemon.megaTargetId) {
        return null;
    }
    
    // === 【Ambrosia 时空醉】标记下回合混乱 ===
    if (typeof window.WeatherEffects !== 'undefined' && window.WeatherEffects.checkNeuroBacklash) {
        const currentWeather = window.battle?.weather || '';
        const trainer = window.battle?.isPlayerTurn ? null : window.battle?.enemyTrainer;
        const neuroResult = window.WeatherEffects.checkNeuroBacklash(currentWeather, 'mega', pokemon, trainer);
        if (neuroResult.shouldTrigger) {
            pokemon.volatile = pokemon.volatile || {};
            pokemon.volatile.neuroBacklash = true;
            console.log(`[AMBROSIA] ⚡ 时空醉：${pokemon.name} Mega进化后被标记，下回合将混乱`);
        }
    }
    
    const megaData = typeof getPokemonData === 'function' 
        ? getPokemonData(pokemon.megaTargetId)
        : null;
    if (!megaData) {
        console.warn(`[MEGA] Mega form data not found: ${pokemon.megaTargetId}`);
        return null;
    }
    
    // 检测是否为非官方 Mega
    const isUnofficial = isUnofficialMega(pokemon.megaTargetId);
    if (isUnofficial) {
        console.log(`[MEGA] Detected unofficial Mega: ${pokemon.megaTargetId} (Radical Red / ROM Hack)`);
        pokemon.isUnofficialMega = true;
    }
    
    // 保存旧数据用于日志
    const oldName = pokemon.cnName;
    const oldTypes = [...pokemon.types];
    const oldAbility = pokemon.ability;
    
    // 更新基础数据
    pokemon.name = megaData.name;
    
    // [BUG FIX] 强制刷新中文名，防止变回英文
    if (typeof window !== 'undefined' && window.Locale) {
        // 先尝试查全名 "Lucario-Mega" => "超级路卡利欧"
        let cn = window.Locale.get(megaData.name);
        
        // 检测是否为 Mega 形态（名字包含 -Mega 或 -Mega-X/Y）
        const isMegaForm = megaData.name.includes('-Mega');
        
        // 如果是 Mega 形态，但翻译结果不包含"超级"，则强制添加
        if (isMegaForm && !cn.startsWith('超级')) {
            // 优先使用 POKEDEX 中的 baseSpecies 字段，更可靠
            const megaPokedex = typeof POKEDEX !== 'undefined' ? POKEDEX[pokemon.megaTargetId] : null;
            const baseSpeciesName = megaPokedex?.baseSpecies || megaData.name.split('-')[0];
            const baseCn = window.Locale.get(baseSpeciesName);
            cn = `超级${baseCn}`;
            console.log(`[MEGA] 智能拼装中文名: baseSpecies=${baseSpeciesName}, baseCn=${baseCn}, result=${cn}`);
        }
        pokemon.cnName = cn;
    } else {
        pokemon.cnName = megaData.name;
    }
    
    pokemon.types = megaData.types || pokemon.types;
    pokemon.baseStats = megaData.baseStats;
    
    // 获取 Mega 形态的特性
    // 【修复】如果用户在 JSON 中自定义了特性（非默认特性），则保留用户特性
    const megaPokedexData = typeof POKEDEX !== 'undefined' ? POKEDEX[pokemon.megaTargetId] : null;
    const basePokedexData = typeof POKEDEX !== 'undefined' ? POKEDEX[pokemon.megaTargetId.replace(/mega[xy]?$/, '')] : null;
    const isCustomAbility = basePokedexData && basePokedexData.abilities && 
        !Object.values(basePokedexData.abilities).includes(oldAbility);
    
    if (isCustomAbility) {
        // 用户自定义了特性（如 Magic Guard），保留不覆盖
        console.log(`[MEGA] Preserving custom ability: ${oldAbility}`);
    } else if (megaPokedexData && megaPokedexData.abilities) {
        pokemon.ability = megaPokedexData.abilities['0'] || megaPokedexData.abilities['H'] || pokemon.ability;
    }
    
    // 重新计算能力值 (HP 不变!)
    const oldHp = pokemon.currHp;
    const oldMaxHp = pokemon.maxHp;
    
    // 保留原始 Pokemon 的 EV 配置，如果没有则使用自动计算
    let evLevel = pokemon.statsMeta?.ev_level;
    if (evLevel === undefined || evLevel === null) {
        evLevel = Math.floor(pokemon.level * 1.5);
        if (evLevel > 85) evLevel = 85;
    }
    
    const newStats = typeof calcStats === 'function'
        ? calcStats(megaData.baseStats, pokemon.level, 31, evLevel)
        : megaData.baseStats;
    
    // HP 保持不变 (Mega 进化的核心规则)
    // pokemon.maxHp = oldMaxHp; // 不变
    // pokemon.currHp = oldHp;   // 不变
    
    // 更新其他能力值
    pokemon.atk = newStats.atk;
    pokemon.def = newStats.def;
    pokemon.spa = newStats.spa;
    pokemon.spd = newStats.spd;
    pokemon.spe = newStats.spe;
    
    // 标记已 Mega 进化
    pokemon.isMega = true;
    pokemon.canMegaEvolve = false;
    
    // === 播放 Mega 进化叫声 ===
    if (typeof window !== 'undefined' && typeof window.playPokemonCry === 'function') {
        window.playPokemonCry(pokemon.name);
    }
    
    return {
        oldName,
        newName: pokemon.cnName,
        oldTypes,
        newTypes: pokemon.types,
        oldAbility,
        newAbility: pokemon.ability,
        typeChanged: JSON.stringify(oldTypes) !== JSON.stringify(pokemon.types),
        abilityChanged: oldAbility !== pokemon.ability
    };
}

/**
 * 检查宝可梦是否可以 Mega 进化
 * @param {Pokemon} pokemon
 * @returns {boolean}
 */
function canMegaEvolve(pokemon) {
    return pokemon && pokemon.canMegaEvolve && !pokemon.isMega && pokemon.megaTargetId;
}

// ============================================
// 导出到全局
// ============================================

if (typeof window !== 'undefined') {
    window.autoDetectFormChangeEligibility = autoDetectFormChangeEligibility;
    window.autoDetectMegaEligibility = autoDetectMegaEligibility;
    window.performMegaEvolution = performMegaEvolution;
    window.canMegaEvolve = canMegaEvolve;
    window.isUnofficialMega = isUnofficialMega;
}

// 导出为模块（如果支持）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        autoDetectFormChangeEligibility,
        autoDetectMegaEligibility,
        performMegaEvolution,
        canMegaEvolve,
        isUnofficialMega
    };
}
