"use strict";
// Languages: 🌐 in the menu (Settings) and at the top of the front page. Spanish, Italian, Hindi and Chinese for the menu, the panel headings, the front page and the most common buttons and
// messages. Nothing in the game's own code changes: this file walks the page, and wherever a piece of text (or a tooltip) is exactly one of the English phrases in the table below it shows the
// translation instead; a MutationObserver does the same for text the game adds later (toasts, panels). Anything not in the table stays in English, and so do the long help texts and the guide.
// The choice is kept in the browser (rome-lang). English is the default, and while English is on this file does nothing at all.
// Each row of ROWS is [English, Spanish, Italian, Hindi, Chinese]; the English text must be exactly what the page shows (spaces collapsed). To add a phrase, add a row.

const I18n = (() => {
  const KEY = "rome-lang", LANGS = ["en", "es", "it", "hi", "zh"], NAMES = { en: "English", es: "Español", it: "Italiano", hi: "हिन्दी", zh: "中文" };
  const ROWS = [
    // the screen and the menu
    ["Ancient Rome · c. 128 AD", "Roma antigua · c. 128 d. C.", "Roma antica · c. 128 d.C.", "प्राचीन रोम · लगभग 128 ई.", "古罗马 · 约公元128年"],
    ["Discovered", "Descubierto", "Scoperti", "खोजे गए", "已发现"],
    ["Ancient Rome", "Roma antigua", "Roma antica", "प्राचीन रोम", "古罗马"],
    ["Modern Rome", "Roma moderna", "Roma moderna", "आधुनिक रोम", "现代罗马"],
    ["✕ Leave", "✕ Salir", "✕ Esci", "✕ छोड़ें", "✕ 离开"],
    ["Directions", "Direcciones", "Indicazioni", "दिशा-निर्देश", "路线指引"],
    ["Getting around", "Desplazarse", "Spostarsi", "आना-जाना", "出行"],
    ["Map", "Mapa", "Mappa", "नक्शा", "地图"],
    ["Places", "Lugares", "Luoghi", "स्थान", "地点"],
    ["✈ Travel", "✈ Viajar", "✈ Viaggia", "✈ यात्रा", "✈ 旅行"],
    ["View", "Vista", "Vista", "दृश्य", "视角"],
    ["Time", "Hora", "Ora", "समय", "时间"],
    ["Money and work", "Dinero y trabajo", "Denaro e lavoro", "पैसा और काम", "金钱与工作"],
    ["💼 Jobs", "💼 Trabajos", "💼 Lavori", "💼 नौकरियाँ", "💼 工作"],
    ["🏢 Business", "🏢 Negocios", "🏢 Attività", "🏢 कारोबार", "🏢 生意"],
    ["📈 Exchange", "📈 Bolsa", "📈 Borsa", "📈 शेयर बाज़ार", "📈 交易所"],
    ["📖 Story", "📖 Historia", "📖 Storia", "📖 कहानी", "📖 故事"],
    ["🗺 Treasure map", "🗺 Mapa del tesoro", "🗺 Mappa del tesoro", "🗺 खज़ाने का नक्शा", "🗺 藏宝图"],
    ["🎣 Fishing", "🎣 Pesca", "🎣 Pesca", "🎣 मछली पकड़ना", "🎣 钓鱼"],
    ["💰 Tax", "💰 Impuestos", "💰 Tasse", "💰 कर", "💰 税"],
    ["📜 Quest", "📜 Misión", "📜 Missione", "📜 मिशन", "📜 任务"],
    ["💎 Treasure", "💎 Tesoro", "💎 Tesoro", "💎 खज़ाना", "💎 宝藏"],
    ["🏺 Souvenirs", "🏺 Recuerdos", "🏺 Souvenir", "🏺 स्मृति-चिह्न", "🏺 纪念品"],
    ["🎁 Daily gift", "🎁 Regalo diario", "🎁 Regalo giornaliero", "🎁 रोज़ का उपहार", "🎁 每日礼物"],
    ["Play and compete", "Jugar y competir", "Gioca e gareggia", "खेलें और मुकाबला करें", "游戏与竞赛"],
    ["🏁 Events", "🏁 Eventos", "🏁 Eventi", "🏁 आयोजन", "🏁 赛事"],
    ["🏆 Leaderboard", "🏆 Clasificación", "🏆 Classifica", "🏆 लीडरबोर्ड", "🏆 排行榜"],
    ["🥇 Weekly cup", "🥇 Copa semanal", "🥇 Coppa settimanale", "🥇 साप्ताहिक कप", "🥇 每周杯赛"],
    ["🏛️ Hall of fame", "🏛️ Salón de la fama", "🏛️ Albo d'oro", "🏛️ यश-मंदिर", "🏛️ 名人堂"],
    ["🏟️ Tournaments", "🏟️ Torneos", "🏟️ Tornei", "🏟️ टूर्नामेंट", "🏟️ 锦标赛"],
    ["🎮 Delhi games", "🎮 Juegos de Delhi", "🎮 Giochi di Delhi", "🎮 दिल्ली के खेल", "🎮 德里游戏"],
    ["🌐 Play online", "🌐 Jugar en línea", "🌐 Gioca online", "🌐 ऑनलाइन खेलें", "🌐 在线游戏"],
    ["🎯 Challenge someone", "🎯 Retar a alguien", "🎯 Sfida qualcuno", "🎯 किसी को चुनौती दें", "🎯 挑战他人"],
    ["👀 Watch a match", "👀 Ver una partida", "👀 Guarda una partita", "👀 मैच देखें", "👀 观看比赛"],
    ["🤜 Shove", "🤜 Empujar", "🤜 Spingi", "🤜 धक्का दें", "🤜 推搡"],
    ["People", "Gente", "Persone", "लोग", "人物"],
    ["💬 Chat", "💬 Chat", "💬 Chat", "💬 चैट", "💬 聊天"],
    ["👥 Friends", "👥 Amigos", "👥 Amici", "👥 दोस्त", "👥 好友"],
    ["📌 Bulletin board", "📌 Tablón de anuncios", "📌 Bacheca", "📌 सूचना पट्ट", "📌 布告栏"],
    ["🛡 Guild", "🛡 Gremio", "🛡 Gilda", "🛡 संघ", "🛡 公会"],
    ["😀 Emotes", "😀 Gestos", "😀 Emote", "😀 भाव", "😀 表情"],
    ["📷 Photo", "📷 Foto", "📷 Foto", "📷 फ़ोटो", "📷 拍照"],
    ["🚩 Report a player", "🚩 Denunciar a un jugador", "🚩 Segnala un giocatore", "🚩 खिलाड़ी की शिकायत करें", "🚩 举报玩家"],
    ["You", "Tú", "Tu", "आप", "你"],
    ["🎓 Tutorial", "🎓 Tutorial", "🎓 Tutorial", "🎓 ट्यूटोरियल", "🎓 教程"],
    ["🏅 Achievements", "🏅 Logros", "🏅 Traguardi", "🏅 उपलब्धियाँ", "🏅 成就"],
    ["👤 Profile", "👤 Perfil", "👤 Profilo", "👤 प्रोफ़ाइल", "👤 个人资料"],
    ["Character", "Personaje", "Personaggio", "किरदार", "角色"],
    ["Log in", "Iniciar sesión", "Accedi", "लॉग इन", "登录"],
    ["Settings", "Ajustes", "Impostazioni", "सेटिंग्स", "设置"],
    ["🔇 Mute everything", "🔇 Silenciar todo", "🔇 Silenzia tutto", "🔇 सब कुछ म्यूट करें", "🔇 全部静音"],
    ["Sound on", "Sonido activado", "Suoni attivi", "आवाज़ चालू", "声音开"],
    ["Music on", "Música activada", "Musica attiva", "संगीत चालू", "音乐开"],
    ["Voice on", "Voz activada", "Voce attiva", "वाणी चालू", "语音开"],
    ["🎮 Gamepad: on", "🎮 Mando: sí", "🎮 Gamepad: attivo", "🎮 गेमपैड: चालू", "🎮 手柄:开"],
    ["🎮 Gamepad: off", "🎮 Mando: no", "🎮 Gamepad: spento", "🎮 गेमपैड: बंद", "🎮 手柄:关"],
    ["Controls", "Controles", "Comandi", "नियंत्रण", "操作说明"],
    ["Health", "Salud", "Salute", "स्वास्थ्य", "生命"],
    ["Hunger", "Hambre", "Fame", "भूख", "饥饿"],
    ["Horses", "Caballos", "Cavalli", "घोड़े", "马匹"],
    ["Denarii", "Denarios", "Denari", "दीनार", "第纳尔"],
    ["Jump", "Saltar", "Salta", "कूदें", "跳跃"],
    ["Run", "Correr", "Corri", "दौड़ें", "奔跑"],
    ["Did you know?", "¿Sabías que…?", "Lo sapevi?", "क्या आप जानते हैं?", "你知道吗?"],
    ["Sleeping...", "Durmiendo...", "Sto dormendo...", "सो रहे हैं...", "睡觉中..."],
    ["Language", "Idioma", "Lingua", "भाषा", "语言"],
    ["Close", "Cerrar", "Chiudi", "बंद करें", "关闭"],
    ["Menu", "Menú", "Menu", "मेन्यू", "菜单"],
    ["Reload", "Recargar", "Ricarica", "फिर से लोड करें", "重新加载"],
    ["Something went wrong loading the game.", "Algo salió mal al cargar el juego.", "Qualcosa è andato storto durante il caricamento del gioco.", "गेम लोड करते समय कुछ गड़बड़ हो गई।", "加载游戏时出了点问题。"],
    ["Stop directions", "Detener las direcciones", "Interrompi le indicazioni", "दिशा-निर्देश बंद करें", "停止指引"],
    ["Stop looking", "Dejar de mirar", "Smetti di guardare", "देखना बंद करें", "停止观看"],
    ["Take me to the nearest place I haven't seen", "Llévame al sitio más cercano que aún no he visto", "Portami al luogo più vicino che non ho ancora visto", "मुझे सबसे पास की ऐसी जगह ले चलो जो मैंने नहीं देखी", "带我去最近一个我还没去过的地方"],
    ["🏠 Take me home (Your House)", "🏠 Llévame a casa (Tu casa)", "🏠 Portami a casa (La tua casa)", "🏠 मुझे घर ले चलो (आपका घर)", "🏠 带我回家(你的房子)"],
    // account and character
    ["Your account", "Tu cuenta", "Il tuo account", "आपका खाता", "你的账号"],
    ["Email", "Correo electrónico", "Email", "ईमेल", "电子邮件"],
    ["Password", "Contraseña", "Password", "पासवर्ड", "密码"],
    ["Create account", "Crear cuenta", "Crea account", "खाता बनाएँ", "创建账号"],
    ["Forgot your password?", "¿Olvidaste tu contraseña?", "Password dimenticata?", "पासवर्ड भूल गए?", "忘记密码?"],
    ["Log out", "Cerrar sesión", "Esci", "लॉग आउट", "退出登录"],
    ["Save now", "Guardar ahora", "Salva ora", "अभी सहेजें", "立即保存"],
    ["Logged in as", "Sesión iniciada como", "Accesso effettuato come", "इस रूप में लॉग इन", "登录身份"],
    ["Create an account to save your game online and carry it to any device.", "Crea una cuenta para guardar tu partida en línea y llevarla a cualquier dispositivo.", "Crea un account per salvare la partita online e portarla su qualsiasi dispositivo.", "अपना खेल ऑनलाइन सहेजने और किसी भी डिवाइस पर ले जाने के लिए खाता बनाएँ।", "创建账号即可在线保存游戏进度,并在任何设备上继续玩。"],
    ["Create your character", "Crea tu personaje", "Crea il tuo personaggio", "अपना किरदार बनाएँ", "创建你的角色"],
    ["Your character", "Tu personaje", "Il tuo personaggio", "आपका किरदार", "你的角色"],
    ["Name", "Nombre", "Nome", "नाम", "名字"],
    ["Class", "Clase", "Classe", "वर्ग", "职业"],
    ["Look", "Aspecto", "Aspetto", "रूप", "外观"],
    ["Skin", "Piel", "Pelle", "त्वचा", "肤色"],
    ["Hair", "Pelo", "Capelli", "बाल", "发型"],
    ["Toga", "Toga", "Toga", "टोगा", "托加袍"],
    ["Sash", "Faja", "Fascia", "पटका", "腰带"],
    ["Begin", "Empezar", "Inizia", "शुरू करें", "开始"],
    ["Cancel", "Cancelar", "Annulla", "रद्द करें", "取消"],
    ["Buy", "Comprar", "Compra", "खरीदें", "购买"],
    ["Sell", "Vender", "Vendi", "बेचें", "出售"],
    ["The Market", "El mercado", "Il mercato", "बाज़ार", "市场"],
    ["Market", "Mercado", "Mercato", "बाज़ार", "市场"],
    ["Your house", "Tu casa", "La tua casa", "आपका घर", "你的房子"],
    ["House", "Casa", "Casa", "घर", "房子"],
    ["Upgrade", "Mejorar", "Migliora", "उन्नत करें", "升级"],
    ["Rent", "Alquiler", "Affitto", "किराया", "租金"],
    // friends, travel, work
    ["Your friends", "Tus amigos", "I tuoi amici", "आपके दोस्त", "你的好友"],
    ["Add a friend", "Añadir un amigo", "Aggiungi un amico", "दोस्त जोड़ें", "添加好友"],
    ["Send request", "Enviar solicitud", "Invia richiesta", "अनुरोध भेजें", "发送请求"],
    ["Who is online?", "¿Quién está en línea?", "Chi è online?", "कौन ऑनलाइन है?", "谁在线?"],
    ["Friend requests", "Solicitudes de amistad", "Richieste di amicizia", "दोस्ती के अनुरोध", "好友请求"],
    ["✈ Where do you want to go?", "✈ ¿A dónde quieres ir?", "✈ Dove vuoi andare?", "✈ आप कहाँ जाना चाहते हैं?", "✈ 你想去哪里?"],
    ["Rome", "Roma", "Roma", "रोम", "罗马"],
    ["Old Delhi", "Delhi Antigua", "Vecchia Delhi", "पुरानी दिल्ली", "老德里"],
    ["Cancún and Chichén Itzá", "Cancún y Chichén Itzá", "Cancún e Chichén Itzá", "कैनकुन और चिचेन इत्सा", "坎昆与奇琴伊察"],
    ["Beijing", "Pekín", "Pechino", "बीजिंग", "北京"],
    ["← Back to the cities", "← Volver a las ciudades", "← Torna alle città", "← शहरों पर वापस", "← 返回城市列表"],
    ["🎁 Take today's gift", "🎁 Recoger el regalo de hoy", "🎁 Ritira il regalo di oggi", "🎁 आज का उपहार लें", "🎁 领取今日礼物"],
    ["📋 The job board", "📋 El tablón de trabajos", "📋 La bacheca dei lavori", "📋 नौकरी की सूची", "📋 工作布告栏"],
    ["💼 All the jobs", "💼 Todos los trabajos", "💼 Tutti i lavori", "💼 सभी नौकरियाँ", "💼 所有工作"],
    ["Work", "Trabajar", "Lavora", "काम करें", "工作"],
    ["💰 The tax collector", "💰 El recaudador de impuestos", "💰 L'esattore delle tasse", "💰 कर वसूलने वाला", "💰 税吏"],
    ["You owe:", "Debes:", "Devi:", "आप पर बकाया:", "你欠:"],
    ["Pay", "Pagar", "Paga", "भुगतान करें", "支付"],
    ["Add denarii", "Añadir denarios", "Aggiungi denari", "दीनार जोड़ें", "添加第纳尔"],
    // play online and PvP
    ["⚔ Duel a real person", "⚔ Duelo contra una persona real", "⚔ Duella con una persona reale", "⚔ असली इंसान से द्वंद्व", "⚔ 与真人决斗"],
    ["🏁 Race real people", "🏁 Carrera contra personas reales", "🏁 Corri contro persone reali", "🏁 असली लोगों से दौड़", "🏁 与真人赛跑"],
    ["🛡 Team up: beat 5 bots together", "🛡 En equipo: derrotad juntos a 5 bots", "🛡 Fate squadra: sconfiggete 5 bot insieme", "🛡 टीम बनाएँ: मिलकर 5 बॉट हराएँ", "🛡 组队:一起击败5个机器人"],
    ["⚓ Naval battle: every ship for itself", "⚓ Batalla naval: cada barco por su cuenta", "⚓ Battaglia navale: ogni nave per sé", "⚓ नौसैनिक युद्ध: हर जहाज़ अकेला", "⚓ 海战:各船自战"],
    ["🤼 Kushti wrestling vs a person (Old Delhi)", "🤼 Lucha kushti contra una persona (Delhi Antigua)", "🤼 Lotta kushti contro una persona (Vecchia Delhi)", "🤼 किसी इंसान से कुश्ती (पुरानी दिल्ली)", "🤼 与真人摔跤 kushti(老德里)"],
    ["🪁 Kite fight vs a person (Old Delhi)", "🪁 Pelea de cometas contra una persona (Delhi Antigua)", "🪁 Lotta di aquiloni contro una persona (Vecchia Delhi)", "🪁 किसी इंसान से पतंगबाज़ी (पुरानी दिल्ली)", "🪁 与真人斗风筝(老德里)"],
    ["♟ Xiangqi: Chinese chess against a person (Beijing)", "♟ Xiangqi: ajedrez chino contra una persona (Pekín)", "♟ Xiangqi: scacchi cinesi contro una persona (Pechino)", "♟ शियांगछी: चीनी शतरंज, इंसान के साथ (बीजिंग)", "♟ 与真人下象棋(北京)"],
    ["🥋 Wushu duel: a bare-handed bout (Beijing)", "🥋 Duelo de wushu: combate sin armas (Pekín)", "🥋 Duello di wushu: un incontro a mani nude (Pechino)", "🥋 वुशु द्वंद्व: खाली हाथ मुकाबला (बीजिंग)", "🥋 武术对决:赤手空拳(北京)"],
    ["🐉 Dragon boat race on Kunming Lake (Beijing)", "🐉 Carrera de barcos dragón en el lago Kunming (Pekín)", "🐉 Gara di dragon boat sul lago Kunming (Pechino)", "🐉 कुनमिंग झील पर ड्रैगन नौका दौड़ (बीजिंग)", "🐉 昆明湖龙舟赛(北京)"],
    ["⚽ Pok-ta-pok ball game vs a person (Cancún)", "⚽ Juego de pelota pok-ta-pok contra una persona (Cancún)", "⚽ Gioco della palla pok-ta-pok contro una persona (Cancún)", "⚽ किसी इंसान से पोक-ता-पोक गेंद का खेल (कैनकुन)", "⚽ 与真人玩 pok-ta-pok 球赛(坎昆)"],
    ["🛞 Chariot derby: ram the others, last one running wins", "🛞 Derbi de cuadrigas: embiste a los demás, gana el último en pie", "🛞 Derby dei carri: sperona gli altri, vince l'ultimo in corsa", "🛞 रथ डर्बी: दूसरों से टकराओ, आख़िर तक चलने वाला जीतता है", "🛞 战车混战:撞翻对手,最后跑完的获胜"],
    ["🥊 Arena brawl: up to 6, last one standing", "🥊 Pelea en la arena: hasta 6, gana el último en pie", "🥊 Rissa nell'arena: fino a 6, vince l'ultimo in piedi", "🥊 अखाड़े की भिड़ंत: 6 तक, आख़िर तक खड़ा रहने वाला जीतता है", "🥊 竞技场混战:最多6人,最后站着的获胜"],
    ["🤝 2 v 2: you and a partner against two", "🤝 2 contra 2: tú y un compañero contra dos", "🤝 2 contro 2: tu e un compagno contro due", "🤝 2 बनाम 2: आप और एक साथी, दो के विरुद्ध", "🤝 2对2:你和搭档对战两人"],
    ["⚔ Ranked duel in the arena", "⚔ Duelo clasificatorio en la arena", "⚔ Duello classificato nell'arena", "⚔ अखाड़े में रैंक वाला द्वंद्व", "⚔ 竞技场排位决斗"],
    ["🏆 Ranked leaderboard", "🏆 Clasificación de rangos", "🏆 Classifica dei ranghi", "🏆 रैंक लीडरबोर्ड", "🏆 排位排行榜"],
    ["Lock in", "Confirmar", "Conferma", "पक्का करें", "确认"],
    ["Cancel the trade", "Cancelar el intercambio", "Annulla lo scambio", "लेन-देन रद्द करें", "取消交易"],
    ["Trade", "Intercambio", "Scambio", "लेन-देन", "交易"],
    ["You offer", "Tú ofreces", "Tu offri", "आप देते हैं", "你提供"],
    ["They offer", "Ellos ofrecen", "Loro offrono", "वे देते हैं", "对方提供"],
    ["Accept", "Aceptar", "Accetta", "स्वीकार करें", "接受"],
    ["Not now", "Ahora no", "Non ora", "अभी नहीं", "暂不"],
    ["A citizen needs help", "Un ciudadano necesita ayuda", "Un cittadino ha bisogno d'aiuto", "एक नागरिक को मदद चाहिए", "一位市民需要帮助"],
    ["Haggle", "Regatear", "Contratta", "मोल-भाव करें", "讨价还价"],
    ["Never mind", "No importa", "Lascia stare", "रहने दें", "算了"],
    ["Refresh", "Actualizar", "Aggiorna", "ताज़ा करें", "刷新"],
    ["Leave guild", "Salir del gremio", "Lascia la gilda", "संघ छोड़ें", "离开公会"],
    ["Send", "Enviar", "Invia", "भेजें", "发送"],
    ["Exit", "Salir", "Esci", "बाहर निकलें", "退出"],
    ["Pin it", "Fijarlo", "Fissalo", "इसे लगाएँ", "钉上"],
    ["Move", "Mover", "Muovi", "चलें", "移动"],
    // photo mode
    ["Normal", "Normal", "Normale", "सामान्य", "原色"],
    ["Sepia", "Sepia", "Seppia", "सेपिया", "棕褐色"],
    ["B&W", "B/N", "B/N", "श्वेत-श्याम", "黑白"],
    ["Vivid", "Vívido", "Vivace", "चटक", "鲜艳"],
    ["Postcard", "Postal", "Cartolina", "पोस्टकार्ड", "明信片"],
    ["📷 Take photo", "📷 Hacer foto", "📷 Scatta una foto", "📷 फ़ोटो लें", "📷 拍照"],
    ["📤 Share", "📤 Compartir", "📤 Condividi", "📤 साझा करें", "📤 分享"],
    // front page
    ["Play free", "Jugar gratis", "Gioca gratis", "मुफ़्त खेलें", "免费游玩"],
    ["🎮 Demo", "🎮 Demo", "🎮 Demo", "🎮 डेमो", "🎮 试玩"],
    ["History guide", "Guía de historia", "Guida alla storia", "इतिहास गाइड", "历史指南"],
    ["Free to play · No real money, ever", "Gratis · Nunca con dinero real", "Gratis · Mai denaro vero", "मुफ़्त · असली पैसे कभी नहीं", "免费游玩 · 绝不涉及真钱"],
    ["Walk through history,", "Recorre la historia,", "Cammina nella storia,", "इतिहास में घूमिए,", "漫步历史,"],
    ["one street at a time.", "una calle a la vez.", "una strada alla volta.", "एक-एक गली करके।", "一条街一条街地走。"],
    ["Enter Rome", "Entrar en Roma", "Entra a Roma", "रोम में प्रवेश करें", "进入罗马"],
    ["or log in to your account →", "o inicia sesión en tu cuenta →", "oppure accedi al tuo account →", "या अपने खाते में लॉग इन करें →", "或登录你的账号 →"],
    ["try the demo, no account needed", "prueba la demo, sin necesidad de cuenta", "prova la demo, senza account", "डेमो आज़माएँ, खाते की ज़रूरत नहीं", "试玩体验,无需账号"],
    ["For players", "Para jugadores", "Per i giocatori", "खिलाड़ियों के लिए", "给玩家"],
    ["Four cities to explore.", "Cuatro ciudades por explorar.", "Quattro città da esplorare.", "घूमने के लिए चार शहर।", "四座城市等你探索。"],
    ["Over 60 landmarks with real stories.", "Más de 60 monumentos con historias reales.", "Oltre 60 monumenti con storie vere.", "60 से ज़्यादा स्थल, असली कहानियों के साथ।", "60多处地标,配有真实的故事。"],
    ["Pick a class.", "Elige una clase.", "Scegli una classe.", "एक वर्ग चुनें।", "选择职业。"],
    ["Fight and race.", "Lucha y corre.", "Combatti e corri.", "लड़ें और दौड़ें।", "战斗与竞速。"],
    ["Play real people (PvP).", "Juega contra personas reales (JcJ).", "Gioca contro persone reali (PvP).", "असली लोगों के साथ खेलें (PvP)।", "与真人对战(PvP)。"],
    ["Earn denarii.", "Gana denarios.", "Guadagna denari.", "दीनार कमाएँ।", "赚取第纳尔。"],
    ["Collect everything.", "Colecciónalo todo.", "Colleziona tutto.", "सब कुछ इकट्ठा करें।", "收集一切。"],
    ["Festivals.", "Fiestas.", "Feste.", "त्योहार।", "节日。"],
    ["Throw flowers at other players during Floralia and Holi.", "Lanza flores a otros jugadores durante las Floralias y el Holi.", "Lancia fiori agli altri giocatori durante i Floralia e l'Holi.", "फ्लोरेलिया और होली के दौरान दूसरे खिलाड़ियों पर फूल फेंकें।", "在花神节和洒红节向其他玩家抛洒鲜花。"],
    ["Friends and guilds.", "Amigos y gremios.", "Amici e gilde.", "दोस्त और संघ।", "好友与公会。"],
    ["Days, nights and weather.", "Días, noches y clima.", "Giorni, notti e meteo.", "दिन, रात और मौसम।", "昼夜与天气。"],
    ["Sunrise, storms and stars, and a bed to sleep in when it gets late.", "Amaneceres, tormentas y estrellas, y una cama donde dormir cuando se hace tarde.", "Albe, temporali e stelle, e un letto in cui dormire quando si fa tardi.", "सूर्योदय, तूफ़ान और तारे, और देर होने पर सोने के लिए एक बिस्तर।", "日出、风暴与星空,夜深了还有一张床可以睡。"],
    ["Saved to your account.", "Guardado en tu cuenta.", "Salvato nel tuo account.", "आपके खाते में सहेजा गया।", "保存在你的账号里。"],
    ["Pick up your game on any computer.", "Retoma tu partida en cualquier ordenador.", "Riprendi la partita su qualsiasi computer.", "किसी भी कंप्यूटर पर अपना खेल जारी रखें।", "在任何电脑上继续你的游戏。"],
    ["What you can do", "Lo que puedes hacer", "Cosa puoi fare", "आप क्या कर सकते हैं", "你可以做什么"],
    ["Explore and learn", "Explora y aprende", "Esplora e impara", "घूमें और सीखें", "探索与学习"],
    ["Fight real people (PvP)", "Lucha contra personas reales (JcJ)", "Combatti contro persone reali (PvP)", "असली लोगों से लड़ें (PvP)", "与真人战斗(PvP)"],
    ["Play together", "Jugad juntos", "Giocate insieme", "साथ मिलकर खेलें", "一起玩"],
    ["History guide, timeline & quiz", "Guía de historia, cronología y cuestionario", "Guida alla storia, cronologia e quiz", "इतिहास गाइड, समय-रेखा और क्विज़", "历史指南、时间线与测验"],
    ["Privacy", "Privacidad", "Privacy", "गोपनीयता", "隐私"],
    ["Terms", "Condiciones", "Termini", "शर्तें", "条款"],
    ["Demo: your game is not saved to an account, and other players are off.", "Demo: tu partida no se guarda en una cuenta y no hay otros jugadores.", "Demo: la partita non viene salvata in un account e gli altri giocatori sono disattivati.", "डेमो: आपका खेल किसी खाते में सहेजा नहीं जाता, और दूसरे खिलाड़ी बंद हैं।", "试玩:游戏不会保存到账号,其他玩家也不可见。"],
    ["Log in to save", "Inicia sesión para guardar", "Accedi per salvare", "सहेजने के लिए लॉग इन करें", "登录以保存"],
    // common messages
    ["Photo saved to your downloads.", "Foto guardada en tus descargas.", "Foto salvata nei download.", "फ़ोटो आपके डाउनलोड में सहेजी गई।", "照片已保存到下载文件夹。"],
    ["You left the game.", "Has abandonado la partida.", "Hai lasciato la partita.", "आपने खेल छोड़ दिया।", "你离开了游戏。"],
    ["You stopped watching.", "Has dejado de mirar.", "Hai smesso di guardare.", "आपने देखना बंद कर दिया।", "你已停止观看。"],
    ["Loading...", "Cargando...", "Caricamento...", "लोड हो रहा है...", "加载中..."],
    ["Gamepad on.", "Mando activado.", "Gamepad attivato.", "गेमपैड चालू।", "手柄已开启。"],
    ["Gamepad off.", "Mando desactivado.", "Gamepad disattivato.", "गेमपैड बंद।", "手柄已关闭。"],
    ["Log in to your account to enter a tournament.", "Inicia sesión para entrar en un torneo.", "Accedi al tuo account per entrare in un torneo.", "टूर्नामेंट में शामिल होने के लिए अपने खाते में लॉग इन करें।", "登录账号后才能参加锦标赛。"],
    ["Open a tournament", "Abrir un torneo", "Apri un torneo", "टूर्नामेंट शुरू करें", "开办锦标赛"],
    ["Start now", "Empezar ya", "Inizia ora", "अभी शुरू करें", "立即开始"],
    ["Sign up", "Inscribirse", "Iscriviti", "नाम लिखवाएँ", "报名"],
    ["Leave", "Salir", "Esci", "छोड़ें", "退出"],
    ["Watch", "Ver", "Guarda", "देखें", "观战"],
    ["Bracket", "Cuadro", "Tabellone", "ब्रैकेट", "对阵表"],
    ["← All tournaments", "← Todos los torneos", "← Tutti i tornei", "← सभी टूर्नामेंट", "← 所有锦标赛"],
    ["Latest tournament winners", "Últimos ganadores de torneos", "Ultimi vincitori dei tornei", "हाल के टूर्नामेंट विजेता", "最近的锦标赛冠军"],
    ["⭐ Highest ratings", "⭐ Mejores puntuaciones", "⭐ Punteggi più alti", "⭐ सबसे ऊँची रेटिंग", "⭐ 最高评分"],
    ["Results by game", "Resultados por juego", "Risultati per gioco", "खेल के अनुसार नतीजे", "各游戏战绩"],
    ["Recent matches", "Partidas recientes", "Partite recenti", "हाल के मैच", "最近的比赛"],
    ["Copy link to this profile", "Copiar el enlace a este perfil", "Copia il link a questo profilo", "इस प्रोफ़ाइल का लिंक कॉपी करें", "复制此资料的链接"],
  ];
  // phrases with a number or a name in them: [regular expression, { language: template with $1, $2... }]
  const PATTERNS = [
    [/^Discovered: (.+) \(\+(\d+) denarii\)$/, { es: "Descubierto: $1 (+$2 denarios)", it: "Scoperto: $1 (+$2 denari)", hi: "खोज लिया: $1 (+$2 दीनार)", zh: "发现:$1(+$2第纳尔)" }],
    [/^Day (\d+) · (\d\d:\d\d) · (.+)$/, { es: "Día $1 · $2 · $3", it: "Giorno $1 · $2 · $3", hi: "दिन $1 · $2 · $3", zh: "第$1天 · $2 · $3" }],
    [/^(\d+) \/ (\d+)$/, { es: "$1 / $2", it: "$1 / $2", hi: "$1 / $2", zh: "$1 / $2" }],
  ];
  const IDX = { es: 1, it: 2, hi: 3, zh: 4 };
  const maps = { es: new Map(), it: new Map(), hi: new Map(), zh: new Map() };
  for (const row of ROWS) for (const l of Object.keys(IDX)) maps[l].set(row[0], row[IDX[l]]);

  let lang = "en", obs = null, queue = new Set();
  const textMeta = new WeakMap(), attrMeta = new WeakMap();          // node -> { src (the English), out (what we put there) }
  const ATTRS = ["title", "placeholder", "aria-label"];

  function translate(src) {
    if (lang === "en") return src;
    const key = src.replace(/\s+/g, " ").trim();
    if (!key) return src;
    let out = maps[lang].get(key);
    if (out === undefined) {
      for (const [re, t] of PATTERNS) if (re.test(key)) { out = key.replace(re, t[lang]); break; }
    }
    if (out === undefined) return src;
    return (src.match(/^\s*/) || [""])[0] + out + (src.match(/\s*$/) || [""])[0];
  }

  function doText(node) {
    const cur = node.nodeValue, m = textMeta.get(node), src = m && cur === m.out ? m.src : cur, out = translate(src);
    if (out !== cur) { node.nodeValue = out; textMeta.set(node, { src, out }); } else if (m && lang === "en") textMeta.delete(node);
  }
  function doAttrs(el) {
    let meta = attrMeta.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a), m = meta && meta[a], src = m && cur === m.out ? m.src : cur, out = translate(src);
      if (out !== cur) { el.setAttribute(a, out); if (!meta) { meta = {}; attrMeta.set(el, meta); } meta[a] = { src, out }; }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    const tag = root.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "CANVAS") return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 && /^(SCRIPT|STYLE|TEXTAREA|CANVAS)$/.test(n.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function flush() {
    const nodes = [...queue]; queue.clear();
    for (const n of nodes) if (n.isConnected !== false) walk(n);
  }
  function watch() {
    if (obs || lang === "en") return;
    obs = new MutationObserver((list) => {                  // (at once, before the next frame is drawn, so no English flashes up first)
      for (const r of list) {
        if (r.type === "childList") for (const n of r.addedNodes) queue.add(n);
        else queue.add(r.target);
      }
      flush();
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function set(l) {
    if (!LANGS.includes(l)) l = "en";
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) { /* ignore */ }
    document.documentElement.lang = l;
    for (const s of document.querySelectorAll(".lang-select")) s.value = l;
    if (l === "en") { if (obs) { obs.disconnect(); obs = null; } }
    walk(document.body);                                    // (English puts the originals back, because the page's own text is the source)
    if (l !== "en") watch();
  }

  function init() {
    let saved = "en";
    try { saved = localStorage.getItem(KEY) || "en"; } catch (e) { /* ignore */ }
    for (const s of document.querySelectorAll(".lang-select")) {
      for (const l of LANGS) { const o = document.createElement("option"); o.value = l; o.textContent = NAMES[l]; s.append(o); }
      s.addEventListener("change", () => set(s.value));
    }
    set(saved);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  return { set, get lang() { return lang; }, rows: ROWS.length };
})();
